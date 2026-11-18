/**
 * Look Around Tool
 * Deprecated - use scanArea instead
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';

const InputSchema = BaseInputSchema.extend({});

type Input = z.infer<typeof InputSchema>;

interface Output {
  deprecated: boolean;
  message: string;
}

export class LookAroundTool extends BaseTool<Input, Output> {
  readonly name = 'lookAround';
  readonly description = '[Deprecated] Use scanArea instead. This tool is kept for backward compatibility.';
  readonly category = 'observation' as const;
  readonly inputSchema = InputSchema;

  protected async execute(_input: Input, _bot: Bot): Promise<Output> {
    return {
      deprecated: true,
      message: 'This tool is deprecated. Please use scanArea for observing the environment.',
    };
  }
}
