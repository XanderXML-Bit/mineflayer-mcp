/**
 * Retrieve From Brewing Stand Tool
 * Retrieves potions from a brewing stand
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
  withdraw(slot: number, itemType: number, metadata: number | null, count: number): Promise<void>;
  close(): void;
}

const InputSchema = BaseInputSchema.extend({
  slot: z.enum(['all', 'left', 'middle', 'right']).optional().default('all')
    .describe('Which potion slots to retrieve from'),
});

type Input = z.infer<typeof InputSchema>;

interface PotionInfo {
  slot: string;
  name: string;
  count: number;
}

interface Output {
  success: boolean;
  retrieved: PotionInfo[];
  totalRetrieved: number;
  error?: string;
}

export class RetrieveFromBrewingStandTool extends BaseTool<Input, Output> {
  readonly name = 'retrieveFromBrewingStand';
  readonly description = 'Retrieve potions from a brewing stand';
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
        return { success: false, retrieved: [], totalRetrieved: 0, error: 'No brewing stand found' };
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

      // Open brewing stand
      const brewWindow = await (bot as unknown as BotWithBrewingStand).openBrewingStand(brewingStand);

      if (!brewWindow) {
        return { success: false, retrieved: [], totalRetrieved: 0, error: 'Failed to open brewing stand' };
      }

      try {
        // Wait for window to load
        await new Promise(resolve => setTimeout(resolve, 200));

        // Determine which slots to retrieve from
        const slotMap: Record<string, number[]> = {
          all: [0, 1, 2],
          left: [0],
          middle: [1],
          right: [2],
        };

        const slotKey = input.slot ?? 'all';
        const slotsToRetrieve = slotMap[slotKey] || [0, 1, 2];
        const slotNames = ['left', 'middle', 'right'];
        const retrieved: PotionInfo[] = [];

        for (const slotIndex of slotsToRetrieve) {
          if (aborted) break;

          const item = brewWindow.slots[slotIndex];
          if (item) {
            try {
              // Shift-click to move to inventory
              await brewWindow.withdraw(slotIndex, item.type, null, item.count);
              retrieved.push({
                slot: slotNames[slotIndex],
                name: item.name,
                count: item.count,
              });
              await new Promise(resolve => setTimeout(resolve, 100));
            } catch {
              // Slot might be empty or transfer failed
            }
          }
        }

        brewWindow.close();

        return {
          success: retrieved.length > 0,
          retrieved,
          totalRetrieved: retrieved.reduce((sum, p) => sum + p.count, 0),
        };
      } catch (err) {
        brewWindow.close();
        throw err;
      }
    });
  }
}
