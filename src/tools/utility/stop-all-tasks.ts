/**
 * StopAllTasks Tool
 * Stop all running tasks (navigation, combat, etc.) for a bot
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';

/** Helper to get pathfinder safely */
function getPathfinder(bot: Bot): { stop?(): void } | undefined {
  return (bot as unknown as { pathfinder?: { stop?(): void } }).pathfinder;
}

/** Helper to get pvp safely */
function getPvp(bot: Bot): { stop(): void } | undefined {
  return (bot as unknown as { pvp?: { stop(): void } }).pvp;
}

/** Helper to get task state safely */
function getTask(bot: Bot): { running: boolean; abort: (() => void) | null } | undefined {
  return (bot as unknown as { __task?: { running: boolean; abort: (() => void) | null } }).__task;
}

const InputSchema = BaseInputSchema.extend({
  stopAll: z
    .boolean()
    .optional()
    .default(false)
    .describe('If true, stop tasks for all bots. If false, only the specified bot.'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  ok: boolean;
  stoppedBots: string[];
  message: string;
}

export class StopAllTasksTool extends BaseTool<Input, Output> {
  readonly name = 'stopAllTasks';
  readonly description = 'Stop all running tasks (navigation, combat, etc.) for the bot';
  readonly category = 'utility' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const stoppedBots: string[] = [];

    if (input.stopAll) {
      // Stop all bots
      const allBots = this.context.getAllBots();
      for (const [username, b] of allBots) {
        this.stopBotTasks(b);
        stoppedBots.push(username);
      }
    } else {
      // Stop only the specified bot
      this.stopBotTasks(bot);
      stoppedBots.push(bot.username);
    }

    return {
      ok: true,
      stoppedBots,
      message: `Stopped tasks for ${stoppedBots.length} bot(s)`,
    };
  }

  private stopBotTasks(bot: Bot): void {
    // Stop pathfinder navigation
    try {
      getPathfinder(bot)?.stop?.();
    } catch {}

    // Stop PVP combat
    try {
      getPvp(bot)?.stop?.();
    } catch {}

    // Clear task mutex if using withTask pattern
    const task = getTask(bot);
    if (task?.abort) {
      try {
        task.abort();
      } catch {}
    }

    // Reset task state
    if (task) {
      task.running = false;
      task.abort = null;
    }
  }
}
