/**
 * Stop Attack Tool
 * Stop the current attack
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';

/** Bot with PVP plugin */
interface BotWithPvp extends Bot {
  pvp?: { stop(): void };
}

const InputSchema = BaseInputSchema.extend({});

type Input = z.infer<typeof InputSchema>;

interface Output {
  ok: boolean;
}

export class StopAttackTool extends BaseTool<Input, Output> {
  readonly name = 'stopAttack';
  readonly description = 'Stop the current attack';
  readonly category = 'combat' as const;
  readonly inputSchema = InputSchema;

  protected async execute(_input: Input, bot: Bot): Promise<Output> {
    try {
      const pvpBot = bot as BotWithPvp;
      pvpBot.pvp?.stop?.();
    } catch {
      // Ignore stop errors
    }

    return { ok: true };
  }
}
