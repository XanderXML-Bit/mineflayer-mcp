/**
 * Go To Player Tool
 * Navigate to another player
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { configureMovements } from '../../services/navigation.service.js';

import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg;

const InputSchema = BaseInputSchema.extend({
  playerName: z.string().describe('Name of the player to navigate to'),
  distance: z.number().optional().default(3).describe('How close to get to the player'),
  noBlockBreaking: z.boolean().optional().default(false).describe('If true, navigate without breaking any blocks'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  following: boolean;
  targetPlayer: string;
}

export class GoToPlayerTool extends BaseTool<Input, Output> {
  readonly name = 'goToSomeone';
  readonly description = 'Navigate to another player in the game';
  readonly category = 'movement' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { playerName, distance, noBlockBreaking } = input;

    const player = bot.players[playerName]?.entity;
    if (!player) {
      throw new Error(`Player '${playerName}' not found or not visible`);
    }

    const movements = configureMovements(bot, { canDig: !noBlockBreaking });
    bot.pathfinder.setMovements(movements);
    bot.pathfinder.setGoal(new goals.GoalFollow(player, distance ?? 3));

    return {
      following: true,
      targetPlayer: playerName,
    };
  }
}
