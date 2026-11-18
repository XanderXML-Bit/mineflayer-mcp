/**
 * Fish Tool
 * Start fishing in nearby water
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import type { Entity } from 'prismarine-entity';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { withTask } from '../../services/task.service.js';
import mcData from 'minecraft-data';

/** Entity with owner property for fishing bobber */
type FishingBobberEntity = Entity & {
  owner?: number;
};

/** Collected item entity */
interface CollectedEntity {
  name?: string;
}

const InputSchema = BaseInputSchema.extend({
  duration: z.number().optional().default(60).describe('How long to fish in seconds (default 60)'),
  stopOnCatch: z.boolean().optional().default(false).describe('Stop after catching one item'),
});

type Input = z.infer<typeof InputSchema>;

interface CaughtItem {
  name: string;
  count: number;
}

interface Output {
  success: boolean;
  duration: number;
  itemsCaught: CaughtItem[];
  totalCaught: number;
  error?: string;
}

export class FishTool extends BaseTool<Input, Output> {
  readonly name = 'fish';
  readonly description = 'Start fishing in nearby water';
  readonly category = 'fishing' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    return withTask(bot, async (signal) => {
      let aborted = false;
      signal.onAbort(() => { aborted = true; });

      const _data = mcData(bot.version);

      // Check for fishing rod
      const fishingRod = bot.inventory.items().find(i => i.name === 'fishing_rod');
      if (!fishingRod) {
        return { success: false, duration: 0, itemsCaught: [], totalCaught: 0, error: 'No fishing rod in inventory' };
      }

      // Find nearby water
      const waterBlock = bot.findBlock({
        matching: (block) => block.name === 'water',
        maxDistance: 16,
      });

      if (!waterBlock) {
        return { success: false, duration: 0, itemsCaught: [], totalCaught: 0, error: 'No water nearby' };
      }

      // Look at water
      await bot.lookAt(waterBlock.position.offset(0.5, 0.5, 0.5));

      // Equip fishing rod
      await bot.equip(fishingRod, 'hand');

      const itemsCaught: CaughtItem[] = [];
      const startTime = Date.now();
      const maxDuration = (input.duration ?? 60) * 1000;
      let fishing = false;

      // Set up catch listener
      const onCollect = (collector: Entity, collected: CollectedEntity) => {
        if (collector === bot.entity) {
          const itemName = collected.name || 'unknown';
          const existing = itemsCaught.find(i => i.name === itemName);
          if (existing) {
            existing.count++;
          } else {
            itemsCaught.push({ name: itemName, count: 1 });
          }
        }
      };

      bot.on('playerCollect', onCollect);

      try {
        // Start fishing loop
        while (!aborted && (Date.now() - startTime) < maxDuration) {
          if (!fishing) {
            // Cast the line
            bot.activateItem();
            fishing = true;
          }

          // Wait for a bite or timeout
          try {
            await Promise.race([
              new Promise<void>((resolve) => {
                const checkBite = () => {
                  // Check if fishing line has a fish
                  const fishingBobber = Object.values(bot.entities).find(
                    (e) => e.name === 'fishing_bobber' && (e as FishingBobberEntity).owner === bot.entity.id
                  );
                  if (fishingBobber && (fishingBobber as FishingBobberEntity).metadata?.[8]) {
                    // There's a bite!
                    resolve();
                  }
                };
                const interval = setInterval(checkBite, 100);
                setTimeout(() => {
                  clearInterval(interval);
                  resolve();
                }, 30000); // Max wait time per cast
              }),
              new Promise<void>((resolve) => {
                if (aborted) resolve();
                const checkAbort = setInterval(() => {
                  if (aborted) {
                    clearInterval(checkAbort);
                    resolve();
                  }
                }, 100);
              }),
            ]);
          } catch {
            // Continue fishing
          }

          if (aborted) break;

          // Reel in
          if (fishing) {
            bot.activateItem();
            fishing = false;
            await new Promise(resolve => setTimeout(resolve, 500));
          }

          if (input.stopOnCatch && itemsCaught.length > 0) {
            break;
          }
        }

        // Make sure line is reeled in
        if (fishing) {
          bot.activateItem();
        }

        bot.removeListener('playerCollect', onCollect);

        const actualDuration = Math.round((Date.now() - startTime) / 1000);
        const totalCaught = itemsCaught.reduce((sum, i) => sum + i.count, 0);

        return {
          success: true,
          duration: actualDuration,
          itemsCaught,
          totalCaught,
        };
      } catch (err) {
        bot.removeListener('playerCollect', onCollect);
        throw err;
      }
    });
  }
}
