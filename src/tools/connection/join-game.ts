/**
 * joinGame tool - Connect a bot to a Minecraft server
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool } from '../base-tool.js';

/** Game state object type */
interface GameStateObj {
  gameMode?: number;
}

/** Error with code property */
interface ErrorWithCode extends Error {
  code?: string;
}

/** Input schema for joinGame */
const JoinGameInputSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(16, 'Username cannot exceed 16 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
    .describe('Username for the bot (3-16 alphanumeric characters)'),
  host: z.string().default('localhost').describe('Minecraft server host'),
  port: z.number().default(25565).describe('Minecraft server port'),
});

type JoinGameInput = z.infer<typeof JoinGameInputSchema>;

/** Output for joinGame */
interface JoinGameOutput {
  username: string;
  host: string;
  port: number;
  version: string;
  gameMode: string;
}

/**
 * JoinGame tool class
 */
export class JoinGameTool extends BaseTool<JoinGameInput, JoinGameOutput> {
  readonly name = 'joinGame';
  readonly description = 'Connect a new bot to a Minecraft server. Returns bot info and initial status.';
  readonly category = 'connection' as const;
  readonly inputSchema = JoinGameInputSchema;

  protected async execute(input: JoinGameInput, _bot: Bot): Promise<JoinGameOutput> {
    // Note: We don't use the _bot parameter here since we're creating a new one
    // The base class tries to get a bot, but for joinGame we create one

    // Get bot manager from context
    const { botManager } = this.context;
    if (!botManager) {
      throw new Error('Bot manager not available in context');
    }

    // Create the bot
    const bot = await botManager.create({
      username: input.username,
      host: input.host,
      port: input.port,
    });

    // Determine game mode
    let gameMode = 'unknown';
    try {
      const gameState = bot.game as unknown as GameStateObj | undefined;
      const gameModeNum = gameState?.gameMode ?? bot.player?.gamemode;
      switch (gameModeNum) {
        case 0:
          gameMode = 'survival';
          break;
        case 1:
          gameMode = 'creative';
          break;
        case 2:
          gameMode = 'adventure';
          break;
        case 3:
          gameMode = 'spectator';
          break;
      }
    } catch {}

    return {
      username: bot.username,
      host: input.host || 'localhost',
      port: input.port || 25565,
      version: bot.version,
      gameMode,
    };
  }

  /**
   * Override run to handle the special case where we don't have a bot yet
   */
  async run(rawInput: unknown) {
    // Validate input
    const parseResult = this.inputSchema.safeParse(rawInput);
    if (!parseResult.success) {
      return {
        ok: false as const,
        error: `Invalid input: ${parseResult.error.message}`,
        code: 'INVALID_INPUT',
      };
    }

    const input = parseResult.data;

    try {
      // Execute directly (don't try to get existing bot)
      const result = await this.execute(input, null as unknown as Bot);

      // Get the newly created bot for status
      const bot = this.context.getBotOrThrow(input.username);
      const { getBotStatus } = await import('../../services/status.service.js');
      const status = getBotStatus(bot);

      return {
        ok: true as const,
        data: result,
        bot: input.username,
        status,
      };
    } catch (error) {
      this.log.error('Tool execution failed', { error });

      return {
        ok: false as const,
        error: error instanceof Error ? error.message : String(error),
        code: (error as ErrorWithCode)?.code,
      };
    }
  }
}
