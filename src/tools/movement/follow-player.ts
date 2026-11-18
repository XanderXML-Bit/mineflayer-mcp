/**
 * Follow Player Tool
 * Continuously follow a player
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import type { Entity } from 'prismarine-entity';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { configureMovements } from '../../services/navigation.service.js';

import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg;

/** Entity with username property */
interface PlayerEntity extends Entity {
  username?: string;
}

const InputSchema = BaseInputSchema.extend({
  playerName: z.string().optional().describe('Name of player to follow (nearest if not specified)'),
  distance: z.number().optional().default(2).describe('Distance to maintain from player'),
  noBlockBreaking: z.boolean().optional().default(false).describe('If true, navigate without breaking any blocks'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  following: boolean;
  targetPlayer: string;
}

export class FollowPlayerTool extends BaseTool<Input, Output> {
  readonly name = 'followPlayer';
  readonly description = 'Continuously follow a player';
  readonly category = 'movement' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { playerName, distance, noBlockBreaking } = input;

    let target: Entity | null = null;

    if (playerName) {
      target = bot.players[playerName]?.entity ?? null;
    }

    if (!target) {
      // Find nearest player
      target = bot.nearestEntity(
        (e) => e.type === 'player' && (e as PlayerEntity).username !== bot.username
      );
    }

    if (!target) {
      throw new Error('No player to follow');
    }

    const movements = configureMovements(bot, { canDig: !noBlockBreaking });
    bot.pathfinder.setMovements(movements);
    bot.pathfinder.setGoal(new goals.GoalFollow(target, distance ?? 2), true);

    return {
      following: true,
      targetPlayer: (target as PlayerEntity).username || target.name || 'unknown',
    };
  }
}
