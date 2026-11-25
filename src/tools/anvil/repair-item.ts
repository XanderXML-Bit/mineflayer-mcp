/**
 * Repair Item Tool
 * Repair an item using an anvil
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import type { Block } from 'prismarine-block';
import type { Item } from 'prismarine-item';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { withTask } from '../../services/task.service.js';
import pathfinderPkg from 'mineflayer-pathfinder';
import mcData from 'minecraft-data';

const { goals } = pathfinderPkg;

/** Bot with anvil methods */
type BotWithAnvil = Bot & {
  openAnvil(block: Block): Promise<AnvilWindow>;
};

/** Anvil window interface */
interface AnvilWindow {
  xpCost: number;
  slots: (Item | null)[];
  putIntoSlot(slot: number, type: number, metadata: number | null, count: number): Promise<void>;
  withdraw(slot: number, type: number, metadata: number | null, count: number): Promise<void>;
  rename(name: string): Promise<void>;
  close(): void;
}

/** Item NBT with damage value */
interface ItemNBTWithDamage {
  value?: {
    Damage?: {
      value?: number;
    };
  };
}

const InputSchema = BaseInputSchema.extend({
  itemName: z.string().describe('Name of the item to repair'),
  materialName: z.string().optional().describe('Material to use for repair (auto-detects if omitted)'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  success: boolean;
  item?: string;
  material?: string;
  xpCost?: number;
  newDurability?: number;
  error?: string;
}

// Repair materials for different tool types
const REPAIR_MATERIALS: Record<string, string> = {
  wooden: 'oak_planks',
  stone: 'cobblestone',
  iron: 'iron_ingot',
  golden: 'gold_ingot',
  diamond: 'diamond',
  netherite: 'netherite_ingot',
  leather: 'leather',
  chainmail: 'iron_ingot',
  turtle: 'scute',
  elytra: 'phantom_membrane',
};

export class RepairItemTool extends BaseTool<Input, Output> {
  readonly name = 'repairItem';
  readonly description = 'Repair an item at an anvil using materials';
  readonly category = 'anvil' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    return withTask(bot, async (_signal) => {
      const _data = mcData(bot.version);

      // Find anvil
      const anvil = bot.findBlock({
        matching: (block) => block.name.includes('anvil'),
        maxDistance: 32,
      });

      if (!anvil) {
        return { success: false, error: 'No anvil found within 32 blocks' };
      }

      // Find item to repair
      const itemToRepair = bot.inventory.items().find(i =>
        i.name.toLowerCase().includes(input.itemName.toLowerCase())
      );

      if (!itemToRepair) {
        return { success: false, error: `No item matching '${input.itemName}' found in inventory` };
      }

      // Determine repair material
      let materialName = input.materialName;
      if (!materialName) {
        // Auto-detect based on item name
        for (const [prefix, material] of Object.entries(REPAIR_MATERIALS)) {
          if (itemToRepair.name.includes(prefix)) {
            materialName = material;
            break;
          }
        }
      }

      if (!materialName) {
        return { success: false, error: `Cannot determine repair material for ${itemToRepair.name}` };
      }

      // Find material in inventory
      const material = bot.inventory.items().find(i => i.name === materialName);
      if (!material) {
        return { success: false, error: `No ${materialName} found in inventory for repair` };
      }

      // Navigate to anvil
      const distance = bot.entity.position.distanceTo(anvil.position);
      if (distance > 4) {
        const { GoalNear } = goals;
        await bot.pathfinder.goto(new GoalNear(
          anvil.position.x,
          anvil.position.y,
          anvil.position.z,
          2
        ));
      }

      // Open anvil
      const anvilWindow = await (bot as unknown as BotWithAnvil).openAnvil(anvil) as unknown as AnvilWindow;

      if (!anvilWindow) {
        return { success: false, error: 'Failed to open anvil' };
      }

      try {
        // Wait for window to load
        await new Promise(resolve => setTimeout(resolve, 200));

        // Put item in first slot
        await anvilWindow.putIntoSlot(0, itemToRepair.type, itemToRepair.metadata, 1);
        await new Promise(resolve => setTimeout(resolve, 100));

        // Put material in second slot
        await anvilWindow.putIntoSlot(1, material.type, material.metadata, 1);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Check XP cost
        const xpCost = anvilWindow.xpCost || 0;
        if (xpCost > (bot.experience?.level || 0)) {
          // Take items back
          await anvilWindow.withdraw(0, itemToRepair.type, itemToRepair.metadata, 1);
          await anvilWindow.withdraw(1, material.type, material.metadata, 1);
          anvilWindow.close();
          return { success: false, error: `Not enough XP. Need ${xpCost}, have ${bot.experience?.level || 0}` };
        }

        // Take result from output slot
        const outputSlot = anvilWindow.slots[2];
        if (!outputSlot) {
          anvilWindow.close();
          return { success: false, error: 'Repair failed - no output item' };
        }

        await anvilWindow.withdraw(2, outputSlot.type, outputSlot.metadata, 1);
        await new Promise(resolve => setTimeout(resolve, 100));

        anvilWindow.close();

        // Get new durability
        const repairedItem = bot.inventory.items().find(i => i.name === itemToRepair.name);
        const itemNbt = repairedItem?.nbt as ItemNBTWithDamage | undefined;
        const newDurability = repairedItem ? (repairedItem.maxDurability || 0) - (itemNbt?.value?.Damage?.value || 0) : undefined;

        return {
          success: true,
          item: itemToRepair.name,
          material: materialName,
          xpCost,
          newDurability,
        };
      } catch (err) {
        anvilWindow.close();
        throw err;
      }
    });
  }
}
