/**
 * Auto-Mine Tool
 * Automatically mine resources in a specified area
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { withTask } from '../../services/task.service.js';
import { configureMovements } from '../../services/navigation.service.js';
import mcData from 'minecraft-data';
import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg;

const InputSchema = BaseInputSchema.extend({
  targetBlock: z.string().describe('Type of block to mine (e.g., "iron_ore", "diamond_ore", "coal_ore")'),
  count: z.number().optional().default(64).describe('Number of blocks to mine'),
  radius: z.number().optional().default(32).describe('Search radius for blocks'),
  returnToStart: z.boolean().optional().default(true).describe('Return to starting position when done'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  success: boolean;
  mined: number;
  collected: number;
  targetReached: boolean;
  position?: { x: number; y: number; z: number };
  error?: string;
}

export class AutoMineTool extends BaseTool<Input, Output> {
  readonly name = 'autoMine';
  readonly description = 'Automatically mine a specific resource in the area';
  readonly category = 'automation' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    return withTask(bot, async (signal) => {
      let aborted = false;
      signal.onAbort(() => { aborted = true; });

      const { targetBlock, count, radius, returnToStart } = input;
      const data = mcData(bot.version);
      const startPos = bot.entity.position.clone();

      // Find the block type
      const blockData = data.blocksByName[targetBlock];
      if (!blockData) {
        return { success: false, mined: 0, collected: 0, targetReached: false, error: `Unknown block type: ${targetBlock}` };
      }

      // Check for pickaxe
      const pickaxe = bot.inventory.items().find(i => i.name.includes('pickaxe'));
      if (!pickaxe) {
        return { success: false, mined: 0, collected: 0, targetReached: false, error: 'Need a pickaxe to mine' };
      }

      let mined = 0;
      let collected = 0;
      const startInventory = new Map<string, number>();
      for (const item of bot.inventory.items()) {
        startInventory.set(item.name, (startInventory.get(item.name) || 0) + item.count);
      }

      // Configure pathfinder
      const movements = configureMovements(bot);
      movements.canDig = true;
      movements.allowParkour = false;
      movements.allowSprinting = true;
      bot.pathfinder.setMovements(movements);

      const targetCount = count ?? 64;
      const searchRadius = radius ?? 32;

      while (mined < targetCount && !aborted) {
        // Find nearest target block
        const block = bot.findBlock({
          matching: blockData.id,
          maxDistance: searchRadius,
          useExtraInfo: true,
        });

        if (!block) {
          break; // No more blocks in range
        }

        // Navigate to block
        const { GoalNear } = goals;
        try {
          await bot.pathfinder.goto(new GoalNear(block.position.x, block.position.y, block.position.z, 3));
        } catch {
          // Try to continue anyway
        }

        if (aborted) break;

        // Equip pickaxe
        await bot.equip(pickaxe, 'hand');

        // Mine the block
        const currentBlock = bot.blockAt(block.position);
        if (currentBlock && currentBlock.type === blockData.id) {
          try {
            await bot.dig(currentBlock);
            mined++;

            // Wait a bit for drops
            await new Promise(resolve => setTimeout(resolve, 200));

            // Try to pick up nearby items
            const nearbyItems = Object.values(bot.entities).filter(e =>
              e.objectType === 'Item' &&
              e.position.distanceTo(bot.entity.position) < 5
            );

            for (const item of nearbyItems) {
              if (aborted) break;
              try {
                await bot.pathfinder.goto(new GoalNear(item.position.x, item.position.y, item.position.z, 0.5));
                await new Promise(resolve => setTimeout(resolve, 100));
              } catch {
                // Continue
              }
            }
          } catch {
            // Block mining failed, try next
          }
        }
      }

      // Count collected items
      for (const item of bot.inventory.items()) {
        const prevCount = startInventory.get(item.name) || 0;
        if (item.count > prevCount) {
          collected += item.count - prevCount;
        }
      }

      // Return to start if requested
      if (returnToStart && !aborted) {
        const { GoalNear } = goals;
        try {
          await bot.pathfinder.goto(new GoalNear(startPos.x, startPos.y, startPos.z, 2));
        } catch {
          // Continue anyway
        }
      }

      return {
        success: mined > 0,
        mined,
        collected,
        targetReached: mined >= targetCount,
        position: {
          x: Math.floor(bot.entity.position.x),
          y: Math.floor(bot.entity.position.y),
          z: Math.floor(bot.entity.position.z),
        },
        error: mined === 0 ? `No ${targetBlock} found within ${searchRadius} blocks` : undefined,
      };
    });
  }
}
