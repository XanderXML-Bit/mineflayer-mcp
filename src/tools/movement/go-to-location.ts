/**
 * Go To Known Location Tool
 * Navigate to specific coordinates
 */

import { z } from 'zod';
import { Vec3 } from 'vec3';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { configureMovements, attemptUnstuck } from '../../services/navigation.service.js';

import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg;

/** Bot with defense active flag */
interface BotWithDefense extends Bot {
  __defenseActive?: boolean;
}

const InputSchema = BaseInputSchema.extend({
  x: z.number().describe('X coordinate'),
  y: z.number().describe('Y coordinate'),
  z: z.number().describe('Z coordinate'),
  range: z.number().optional().default(1).describe('How close to get to the target'),
  maxMs: z.number().optional().default(60000).describe('Maximum time in milliseconds'),
  noBlockBreaking: z.boolean().optional().default(false).describe('If true, navigate without breaking any blocks. Throws error if no path exists.'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  arrived: boolean;
  distance: number;
  timedOut: boolean;
  noPathWithoutBreaking?: boolean;
}

export class GoToLocationTool extends BaseTool<Input, Output> {
  readonly name = 'goToKnownLocation';
  readonly description = 'Navigate to specific coordinates in the world';
  readonly category = 'movement' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { x, y, z, range, maxMs, noBlockBreaking } = input;

    const target = new Vec3(x, y, z);
    const movements = configureMovements(bot, { canDig: !noBlockBreaking });
    bot.pathfinder.setMovements(movements);
    bot.pathfinder.setGoal(new goals.GoalNear(x, y, z, range ?? 1));

    const start = Date.now();
    let arrived = false;
    let lastProgressAt = start;
    let best = Infinity;
    const timeout = maxMs ?? 60000;
    const unstuckTimeout = noBlockBreaking ? 8000 : 15000; // Shorter timeout for no-break mode
    const noPathTimeout = 5000; // Quick detection for no path in no-break mode

    // Check if defense is active (don't timeout during defense)
    const isDefenseActive = () => Boolean((bot as BotWithDefense).__defenseActive);

    while (Date.now() - start < timeout || isDefenseActive()) {
      const distance = bot.entity.position.distanceTo(target);

      if (distance <= Math.max(1, range ?? 1) + 0.5) {
        arrived = true;
        break;
      }

      // Track progress
      if (distance + 0.25 < best) {
        best = distance;
        lastProgressAt = Date.now();
      }

      // In noBlockBreaking mode, fail fast if no progress (likely no path)
      if (noBlockBreaking && Date.now() - lastProgressAt > noPathTimeout) {
        // Check if we've made ANY progress from start
        const initialDistance = new Vec3(x, y, z).distanceTo(bot.entity.position);
        if (best === Infinity || best >= initialDistance - 1) {
          // No meaningful progress - likely no path exists
          try {
            bot.pathfinder.stop();
          } catch {}

          return {
            arrived: false,
            distance,
            timedOut: false,
            noPathWithoutBreaking: true,
          };
        }
      }

      // Attempt unstuck if no progress (only in normal mode)
      if (!noBlockBreaking && !isDefenseActive() && Date.now() - lastProgressAt > unstuckTimeout) {
        await attemptUnstuck(bot);
        best = Infinity;
        lastProgressAt = Date.now();
      }

      await bot.waitForTicks(5);
    }

    try {
      bot.pathfinder.stop();
    } catch {}

    const finalDistance = bot.entity.position.distanceTo(target);

    return {
      arrived,
      distance: finalDistance,
      timedOut: !arrived,
    };
  }
}
