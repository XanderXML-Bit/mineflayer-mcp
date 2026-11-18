/**
 * Rename Item Tool
 * Rename an item using an anvil
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

const InputSchema = BaseInputSchema.extend({
  itemName: z.string().describe('Name of the item to rename'),
  newName: z.string().describe('New name for the item'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  success: boolean;
  originalItem?: string;
  newName?: string;
  xpCost?: number;
  error?: string;
}

export class RenameItemTool extends BaseTool<Input, Output> {
  readonly name = 'renameItem';
  readonly description = 'Rename an item at an anvil';
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

      // Find item to rename
      const itemToRename = bot.inventory.items().find(i =>
        i.name.toLowerCase().includes(input.itemName.toLowerCase())
      );

      if (!itemToRename) {
        return { success: false, error: `No item matching '${input.itemName}' found in inventory` };
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
        await anvilWindow.putIntoSlot(0, itemToRename.type, itemToRename.metadata, 1);
        await new Promise(resolve => setTimeout(resolve, 100));

        // Set the name
        await anvilWindow.rename(input.newName);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Check XP cost
        const xpCost = anvilWindow.xpCost || 1;
        if (xpCost > (bot.experience?.level || 0)) {
          // Take item back
          await anvilWindow.withdraw(0, itemToRename.type, itemToRename.metadata, 1);
          anvilWindow.close();
          return { success: false, error: `Not enough XP. Need ${xpCost}, have ${bot.experience?.level || 0}` };
        }

        // Take result from output slot
        const outputSlot = anvilWindow.slots[2];
        if (!outputSlot) {
          anvilWindow.close();
          return { success: false, error: 'Rename failed - no output item' };
        }

        await anvilWindow.withdraw(2, outputSlot.type, outputSlot.metadata, 1);
        await new Promise(resolve => setTimeout(resolve, 100));

        anvilWindow.close();

        return {
          success: true,
          originalItem: itemToRename.name,
          newName: input.newName,
          xpCost,
        };
      } catch (err) {
        anvilWindow.close();
        throw err;
      }
    });
  }
}
