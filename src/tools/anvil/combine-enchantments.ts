/**
 * Combine Enchantments Tool
 * Combine two items to merge their enchantments using an anvil
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import type { Block } from 'prismarine-block';
import type { Item } from 'prismarine-item';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { withTask } from '../../services/task.service.js';
import { goals } from 'mineflayer-pathfinder';
import mcData from 'minecraft-data';

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

/** Enchantment entry in NBT */
interface EnchantmentNBTEntry {
  id?: { value?: string } | string;
  lvl?: { value?: number } | number;
}

/** Item NBT with enchantments */
interface ItemNBTWithEnchantments {
  value?: {
    Enchantments?: {
      value?: EnchantmentNBTEntry[];
    };
  };
}

const InputSchema = BaseInputSchema.extend({
  targetItem: z.string().describe('Name of the item to enhance'),
  sacrificeItem: z.string().describe('Name of the item to sacrifice (enchanted book or same item type)'),
});

type Input = z.infer<typeof InputSchema>;

interface EnchantResult {
  name: string;
  level: number;
}

interface Output {
  success: boolean;
  resultItem?: string;
  enchantments?: EnchantResult[];
  xpCost?: number;
  error?: string;
}

export class CombineEnchantmentsTool extends BaseTool<Input, Output> {
  readonly name = 'combineEnchantments';
  readonly description = 'Combine two items at an anvil to merge enchantments';
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

      // Find target item
      const targetItem = bot.inventory.items().find(i =>
        i.name.toLowerCase().includes(input.targetItem.toLowerCase())
      );

      if (!targetItem) {
        return { success: false, error: `No item matching '${input.targetItem}' found in inventory` };
      }

      // Find sacrifice item
      const sacrificeItem = bot.inventory.items().find(i =>
        i.name.toLowerCase().includes(input.sacrificeItem.toLowerCase()) &&
        i.slot !== targetItem.slot
      );

      if (!sacrificeItem) {
        return { success: false, error: `No item matching '${input.sacrificeItem}' found in inventory` };
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

        // Put target in first slot
        await anvilWindow.putIntoSlot(0, targetItem.type, targetItem.metadata, 1);
        await new Promise(resolve => setTimeout(resolve, 100));

        // Put sacrifice in second slot
        await anvilWindow.putIntoSlot(1, sacrificeItem.type, sacrificeItem.metadata, 1);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Check XP cost
        const xpCost = anvilWindow.xpCost || 0;

        if (xpCost === 0) {
          // No valid combination
          await anvilWindow.withdraw(0, targetItem.type, targetItem.metadata, 1);
          await anvilWindow.withdraw(1, sacrificeItem.type, sacrificeItem.metadata, 1);
          anvilWindow.close();
          return { success: false, error: 'These items cannot be combined' };
        }

        if (xpCost > (bot.experience?.level || 0)) {
          // Take items back
          await anvilWindow.withdraw(0, targetItem.type, targetItem.metadata, 1);
          await anvilWindow.withdraw(1, sacrificeItem.type, sacrificeItem.metadata, 1);
          anvilWindow.close();
          return { success: false, error: `Not enough XP. Need ${xpCost}, have ${bot.experience?.level || 0}` };
        }

        // Take result from output slot
        const outputSlot = anvilWindow.slots[2];
        if (!outputSlot) {
          anvilWindow.close();
          return { success: false, error: 'Combination failed - no output item' };
        }

        await anvilWindow.withdraw(2, outputSlot.type, outputSlot.metadata, 1);
        await new Promise(resolve => setTimeout(resolve, 100));

        anvilWindow.close();

        // Get enchantments on result
        const resultItem = bot.inventory.items().find(i =>
          i.name === targetItem.name && i.slot !== targetItem.slot
        );

        let enchantments: EnchantResult[] = [];
        const itemNbt = resultItem?.nbt as ItemNBTWithEnchantments | undefined;
        if (itemNbt?.value?.Enchantments?.value) {
          const enchList = itemNbt.value.Enchantments.value;
          enchantments = enchList.map((e) => {
            const idValue = typeof e.id === 'object' ? e.id?.value : e.id;
            const lvlValue = typeof e.lvl === 'object' ? e.lvl?.value : e.lvl;
            return {
              name: String(idValue || '').replace('minecraft:', ''),
              level: lvlValue || 1,
            };
          });
        }

        return {
          success: true,
          resultItem: targetItem.name,
          enchantments,
          xpCost,
        };
      } catch (err) {
        anvilWindow.close();
        throw err;
      }
    });
  }
}
