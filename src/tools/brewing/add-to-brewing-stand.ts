/**
 * Add To Brewing Stand Tool
 * Adds potions/water bottles to a brewing stand
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import type { Block } from 'prismarine-block';
import type { Item } from 'prismarine-item';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { withTask } from '../../services/task.service.js';
import { goals } from 'mineflayer-pathfinder';
import mcData from 'minecraft-data';

/** Bot with brewing stand methods */
interface BotWithBrewingStand extends Bot {
  openBrewingStand(block: Block): Promise<BrewingStandWindow>;
}

/** Brewing stand window interface */
interface BrewingStandWindow {
  slots: (Item | null)[];
  deposit(slot: number, itemType: number, metadata: number | null, count: number): Promise<void>;
  close(): void;
}

const InputSchema = BaseInputSchema.extend({
  itemName: z.string().optional().default('glass_bottle')
    .describe('Item to add (water bottle, potion, or glass_bottle)'),
  slot: z.enum(['all', 'left', 'middle', 'right']).optional().default('all')
    .describe('Which slots to fill'),
  fillWithWater: z.boolean().optional().default(true)
    .describe('If adding glass bottles, try to fill them with water first'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  success: boolean;
  added: { slot: string; item: string }[];
  totalAdded: number;
  error?: string;
}

export class AddToBrewingStandTool extends BaseTool<Input, Output> {
  readonly name = 'addToBrewingStand';
  readonly description = 'Add potions or water bottles to a brewing stand';
  readonly category = 'brewing' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    return withTask(bot, async (signal) => {
      let aborted = false;
      signal.onAbort(() => { aborted = true; });
      const data = mcData(bot.version);

      // Find brewing stand
      const brewingStand = bot.findBlock({
        matching: data.blocksByName['brewing_stand']?.id,
        maxDistance: 32,
      });

      if (!brewingStand) {
        return { success: false, added: [], totalAdded: 0, error: 'No brewing stand found' };
      }

      // Navigate to brewing stand if needed
      const distance = bot.entity.position.distanceTo(brewingStand.position);
      if (distance > 4) {
        const { GoalNear } = goals;
        await bot.pathfinder.goto(new GoalNear(
          brewingStand.position.x,
          brewingStand.position.y,
          brewingStand.position.z,
          2
        ));
      }

      // Find items to add
      const itemNameInput = input.itemName ?? 'glass_bottle';
      let itemName = itemNameInput.toLowerCase();

      // Handle water bottle specially
      if (itemName.includes('water') && itemName.includes('bottle')) {
        itemName = 'potion'; // Water bottles are stored as "potion" with specific NBT
      }

      const itemsToAdd = bot.inventory.items().filter(i => {
        const name = i.name.toLowerCase();
        if (itemName === 'potion' || itemName.includes('water')) {
          // Check for water bottles (potion with no effect)
          return name === 'potion' || name.includes('bottle');
        }
        return name.includes(itemName) || itemName.includes(name);
      });

      if (itemsToAdd.length === 0) {
        return { success: false, added: [], totalAdded: 0, error: `No ${input.itemName} found in inventory` };
      }

      // Open brewing stand
      const brewWindow = await (bot as unknown as BotWithBrewingStand).openBrewingStand(brewingStand);

      if (!brewWindow) {
        return { success: false, added: [], totalAdded: 0, error: 'Failed to open brewing stand' };
      }

      try {
        // Wait for window to load
        await new Promise(resolve => setTimeout(resolve, 200));

        // Determine which slots to fill
        const slotMap: Record<string, number[]> = {
          all: [0, 1, 2],
          left: [0],
          middle: [1],
          right: [2],
        };

        const slotKey = input.slot ?? 'all';
        const slotsToFill = slotMap[slotKey] || [0, 1, 2];
        const slotNames = ['left', 'middle', 'right'];
        const added: { slot: string; item: string }[] = [];

        let itemIndex = 0;
        for (const slotIndex of slotsToFill) {
          if (aborted) break;
          if (itemIndex >= itemsToAdd.length) break;

          // Check if slot is empty
          const currentItem = brewWindow.slots[slotIndex];
          if (currentItem) continue;

          const item = itemsToAdd[itemIndex];
          try {
            await brewWindow.deposit(slotIndex, item.type, null, 1);
            added.push({
              slot: slotNames[slotIndex],
              item: item.name,
            });
            itemIndex++;
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch {
            // Transfer failed
          }
        }

        brewWindow.close();

        return {
          success: added.length > 0,
          added,
          totalAdded: added.length,
        };
      } catch (err) {
        brewWindow.close();
        throw err;
      }
    });
  }
}
