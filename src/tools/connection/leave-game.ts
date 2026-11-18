/**
 * leaveGame tool - Disconnect a bot from the Minecraft server
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool } from '../base-tool.js';

/** Error with code property */
interface ErrorWithCode extends Error {
  code?: string;
}

/** Input schema for leaveGame */
const LeaveGameInputSchema = z.object({
  username: z.string().optional().describe('Bot username (optional if only one bot is active)'),
  all: z.boolean().default(false).describe('Disconnect all bots if true'),
});

type LeaveGameInput = z.infer<typeof LeaveGameInputSchema>;

/** Output for leaveGame */
interface LeaveGameOutput {
  disconnected: string[];
  count: number;
}

/**
 * LeaveGame tool class
 */
export class LeaveGameTool extends BaseTool<LeaveGameInput, LeaveGameOutput> {
  readonly name = 'leaveGame';
  readonly description = 'Disconnect a bot (or all bots) from the Minecraft server.';
  readonly category = 'connection' as const;
  readonly inputSchema = LeaveGameInputSchema;

  protected async execute(input: LeaveGameInput, _bot: Bot): Promise<LeaveGameOutput> {
    // Get bot manager from context
    const { botManager } = this.context;
    if (!botManager) {
      throw new Error('Bot manager not available in context');
    }

    const disconnected: string[] = [];

    if (input.all) {
      // Disconnect all bots
      const usernames = botManager.getUsernames();
      await botManager.destroyAll();
      disconnected.push(...usernames);
    } else if (input.username) {
      // Disconnect specific bot
      const success = await botManager.destroy(input.username);
      if (success) {
        disconnected.push(input.username);
      } else {
        throw new Error(`Bot '${input.username}' not found`);
      }
    } else {
      // Disconnect the default bot (first one)
      const usernames = botManager.getUsernames();
      if (usernames.length > 0) {
        const success = await botManager.destroy(usernames[0]);
        if (success) {
          disconnected.push(usernames[0]);
        }
      } else {
        throw new Error('No active bots to disconnect');
      }
    }

    return {
      disconnected,
      count: disconnected.length,
    };
  }

  /**
   * Override run since this tool doesn't need an active bot for 'all' mode
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
      const result = await this.execute(input, null as unknown as Bot);

      return {
        ok: true as const,
        data: result,
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
