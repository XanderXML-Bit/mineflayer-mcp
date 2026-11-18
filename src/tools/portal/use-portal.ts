/**
 * Use Portal Tool
 * Enter a nether or end portal
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { withTask } from '../../services/task.service.js';
import { goals } from 'mineflayer-pathfinder';
import mcData from 'minecraft-data';

/** Bot game with dimension */
interface GameWithDimension {
  dimension?: string;
}

const InputSchema = BaseInputSchema.extend({
  portalType: z.enum(['nether', 'end']).optional().default('nether')
    .describe('Type of portal to use'),
  waitForTransport: z.boolean().optional().default(true)
    .describe('Wait for dimension change to complete'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  success: boolean;
  fromDimension?: string;
  toDimension?: string;
  newPosition?: { x: number; y: number; z: number };
  error?: string;
}

export class UsePortalTool extends BaseTool<Input, Output> {
  readonly name = 'usePortal';
  readonly description = 'Enter a nether or end portal to travel between dimensions';
  readonly category = 'navigation' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    return withTask(bot, async (signal) => {
      let aborted = false;
      signal.onAbort(() => { aborted = true; });

      const { portalType, waitForTransport } = input;
      const data = mcData(bot.version);

      const fromDimension = (bot.game as GameWithDimension).dimension || 'overworld';

      // Find portal
      const portalBlockName = portalType === 'nether' ? 'nether_portal' : 'end_portal';
      const portalBlockId = data.blocksByName[portalBlockName]?.id;

      if (!portalBlockId) {
        return { success: false, error: `Portal block not found in game data` };
      }

      const portal = bot.findBlock({
        matching: portalBlockId,
        maxDistance: 64,
      });

      if (!portal) {
        return { success: false, error: `No ${portalType} portal found nearby` };
      }

      // Navigate to portal
      const distance = bot.entity.position.distanceTo(portal.position);
      if (distance > 2) {
        const { GoalNear } = goals;
        try {
          await bot.pathfinder.goto(new GoalNear(
            portal.position.x,
            portal.position.y,
            portal.position.z,
            1
          ));
        } catch {
          // Try to get closer anyway
        }
      }

      // Step into the portal
      const portalPos = portal.position;

      // Move directly into portal block
      try {
        await bot.lookAt(portalPos.offset(0.5, 0.5, 0.5));

        // Walk forward into portal
        bot.setControlState('forward', true);
        await new Promise(resolve => setTimeout(resolve, 1000));
        bot.setControlState('forward', false);
      } catch {
        // Continue anyway
      }

      if (!waitForTransport) {
        return {
          success: true,
          fromDimension,
          toDimension: 'pending',
        };
      }

      // Wait for dimension change
      const startTime = Date.now();
      const maxWait = 10000; // 10 seconds

      while (!aborted && (Date.now() - startTime) < maxWait) {
        const currentDimension = (bot.game as GameWithDimension).dimension || 'unknown';

        if (currentDimension !== fromDimension) {
          // Successfully transported!
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for world to load

          return {
            success: true,
            fromDimension,
            toDimension: currentDimension,
            newPosition: {
              x: Math.round(bot.entity.position.x),
              y: Math.round(bot.entity.position.y),
              z: Math.round(bot.entity.position.z),
            },
          };
        }

        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Check one more time
      const finalDimension = (bot.game as GameWithDimension).dimension || 'unknown';
      if (finalDimension !== fromDimension) {
        return {
          success: true,
          fromDimension,
          toDimension: finalDimension,
          newPosition: {
            x: Math.round(bot.entity.position.x),
            y: Math.round(bot.entity.position.y),
            z: Math.round(bot.entity.position.z),
          },
        };
      }

      return {
        success: false,
        fromDimension,
        error: 'Portal transport timed out. May need to stand in portal longer.',
      };
    });
  }
}
