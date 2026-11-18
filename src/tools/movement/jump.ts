/**
 * Jump Tool
 * Make the bot jump
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';

const InputSchema = BaseInputSchema.extend({
  duration: z.number().optional().default(500).describe('Jump duration in milliseconds'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  jumped: boolean;
}

export class JumpTool extends BaseTool<Input, Output> {
  readonly name = 'jump';
  readonly description = 'Make the bot jump for a specified duration';
  readonly category = 'movement' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { duration } = input;

    bot.setControlState('jump', true);
    await new Promise((r) => setTimeout(r, duration ?? 500));
    bot.setControlState('jump', false);

    return { jumped: true };
  }
}
