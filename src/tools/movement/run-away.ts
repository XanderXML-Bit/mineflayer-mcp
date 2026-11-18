/**
 * Run Away Tool
 * Run away from threats
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { configureMovements } from '../../services/navigation.service.js';

import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg;

const InputSchema = BaseInputSchema.extend({
  distance: z.number().optional().default(16).describe('Distance to run away'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  running: boolean;
}

export class RunAwayTool extends BaseTool<Input, Output> {
  readonly name = 'runAway';
  readonly description = 'Run away from nearby threats';
  readonly category = 'movement' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { distance } = input;

    // Find nearest threat (mob or nearest entity)
    const threat = bot.nearestEntity((e) => e.type === 'mob') || bot.nearestEntity();

    const currentPos = bot.entity.position.clone();
    const threatPos = threat?.position || currentPos.offset(1, 0, 0);

    // Calculate direction away from threat
    const direction = currentPos.minus(threatPos).normalize();
    const targetPos = currentPos.plus(direction.scaled(distance ?? 16));

    const movements = configureMovements(bot);
    bot.pathfinder.setMovements(movements);
    bot.pathfinder.setGoal(
      new goals.GoalNear(
        Math.floor(targetPos.x),
        Math.floor(targetPos.y),
        Math.floor(targetPos.z),
        2
      )
    );

    return { running: true };
  }
}
