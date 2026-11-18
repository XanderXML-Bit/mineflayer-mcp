/**
 * Return to Last Death Location Tool
 * Navigates back to where the bot last died and picks up dropped items
 */

import { z } from 'zod';
import { Vec3 } from 'vec3';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { configureMovements } from '../../services/navigation.service.js';

// Import pathfinder
import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg;

/** Bot with last death position */
interface BotWithDeathPosition extends Bot {
  __lastDeathPosition?: { x: number | null; y: number | null; z: number | null };
}

const InputSchema = BaseInputSchema.extend({
  pickupRadius: z.number().optional().default(10).describe('Radius to search for dropped items'),
  timeout: z.number().optional().default(60000).describe('Navigation timeout in milliseconds'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  arrived: boolean;
  pickedUp: number;
  deathPosition?: { x: number; y: number; z: number };
}

export class ReturnToDeathTool extends BaseTool<Input, Output> {
  readonly name = 'returnToLastDeathLocation';
  readonly description = 'Navigate back to where the bot last died and attempt to pick up dropped items';
  readonly category = 'observation' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { pickupRadius, timeout } = input;

    // Get last death position
    const lastDeath = (bot as BotWithDeathPosition).__lastDeathPosition;
    if (!lastDeath || lastDeath.x === null || lastDeath.x === undefined) {
      throw new Error('No last death position recorded');
    }

    const target = new Vec3(Number(lastDeath.x), Number(lastDeath.y), Number(lastDeath.z));

    // Navigate to death location
    const movements = configureMovements(bot);
    bot.pathfinder.setMovements(movements);
    bot.pathfinder.setGoal(new goals.GoalNear(target.x, target.y, target.z, 2));

    // Wait for arrival
    const begin = Date.now();
    const maxMs = timeout ?? 60000;

    while (Date.now() - begin < maxMs) {
      const distance = bot.entity.position.distanceTo(target);
      if (distance <= 3) break;
      await bot.waitForTicks(5);
    }

    const arrived = bot.entity.position.distanceTo(target) <= 3;

    // Collect dropped items if arrived
    let pickedUp = 0;
    if (arrived) {
      const itemPickupDeadline = Date.now() + 20000;
      const searchRadius = pickupRadius ?? 10;

      while (Date.now() < itemPickupDeadline) {
        // Find nearest dropped item
        const item = bot.nearestEntity(
          (e) =>
            e.type === 'object' && e.position && e.position.distanceTo(target) <= searchRadius
        );

        if (!item) break;

        // Move to item
        bot.pathfinder.setGoal(new goals.GoalFollow(item, 1));

        // Brief wait to pick it up
        await bot.waitForTicks(20);
        pickedUp++;
      }
    }

    return {
      arrived,
      pickedUp,
      deathPosition: {
        x: target.x,
        y: target.y,
        z: target.z,
      },
    };
  }
}
