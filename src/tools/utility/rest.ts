/**
 * Rest Tool
 * Wait for a specified duration
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';

const InputSchema = BaseInputSchema.extend({
  ms: z.number().optional().default(2000).describe('Time to wait in milliseconds'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  ok: boolean;
}

export class RestTool extends BaseTool<Input, Output> {
  readonly name = 'rest';
  readonly description = 'Wait for a specified duration';
  readonly category = 'utility' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, _bot: Bot): Promise<Output> {
    const { ms } = input;
    await new Promise((resolve) => setTimeout(resolve, ms ?? 2000));
    return { ok: true };
  }
}
