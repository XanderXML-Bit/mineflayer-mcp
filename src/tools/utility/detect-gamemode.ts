/**
 * Detect Gamemode Tool
 * Get the current game mode of the bot
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';

const InputSchema = BaseInputSchema.extend({});

type Input = z.infer<typeof InputSchema>;

interface Output {
  ok: boolean;
  gameMode: string;
}

export class DetectGamemodeTool extends BaseTool<Input, Output> {
  readonly name = 'detectGamemode';
  readonly description = 'Get the current game mode of the bot';
  readonly category = 'utility' as const;
  readonly inputSchema = InputSchema;

  protected async execute(_input: Input, bot: Bot): Promise<Output> {
    const gmNum = Number(bot.game?.gameMode);
    const map: Record<number, string> = {
      0: 'survival',
      1: 'creative',
      2: 'adventure',
      3: 'spectator',
    };

    return {
      ok: true,
      gameMode: map[gmNum] ?? String(gmNum),
    };
  }
}
