/**
 * Pickup Loot Within Radius Tool
 * Pick up all dropped items within a radius
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { configureMovements } from '../../services/navigation.service.js';

import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg;

const InputSchema = BaseInputSchema.extend({
  radius: z.number().optional().default(8).describe('Radius to search for items'),
  maxMs: z.number().optional().default(60000).describe('Maximum time in milliseconds'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  ok: boolean;
  pickedUp: number;
}

export class PickupLootTool extends BaseTool<Input, Output> {
  readonly name = 'pickupLootWithinRadius';
  readonly description = 'Pick up all dropped items within a radius';
  readonly category = 'utility' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { radius, maxMs } = input;

    const searchRadius = Math.max(1, Math.min(20, radius ?? 8));
    const maxDuration = maxMs ?? 60000;
    const start = Date.now();
    let count = 0;

    const movements = configureMovements(bot);
    bot.pathfinder.setMovements(movements);

    while (Date.now() - start < maxDuration) {
      const item = bot.nearestEntity(
        (e) =>
          e.type === 'object' &&
          e.position &&
          e.position.distanceTo(bot.entity.position) <= searchRadius
      );

      if (!item) break;

      bot.pathfinder.setGoal(new goals.GoalFollow(item, 1));
      await bot.waitForTicks(20);
      count++;
    }

    return { ok: true, pickedUp: count };
  }
}
