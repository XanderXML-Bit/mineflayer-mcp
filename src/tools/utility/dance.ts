/**
 * Dance Tool
 * Make the bot dance by alternating movement controls
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';

const InputSchema = BaseInputSchema.extend({
  durationMs: z.number().optional().default(3000).describe('Duration to dance in milliseconds'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  ok: boolean;
}

export class DanceTool extends BaseTool<Input, Output> {
  readonly name = 'dance';
  readonly description = 'Make the bot dance by alternating movement controls';
  readonly category = 'utility' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { durationMs } = input;
    const duration = durationMs ?? 3000;
    const start = Date.now();

    while (Date.now() - start < duration) {
      bot.setControlState('left', true);
      await bot.waitForTicks(5);
      bot.setControlState('left', false);

      bot.setControlState('right', true);
      await bot.waitForTicks(5);
      bot.setControlState('right', false);

      bot.setControlState('sneak', true);
      await bot.waitForTicks(5);
      bot.setControlState('sneak', false);
    }

    return { ok: true };
  }
}
