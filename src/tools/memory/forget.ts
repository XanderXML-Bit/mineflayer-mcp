/**
 * Forget Tool
 *
 * Delete information from persistent memory.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { getMemoryService } from '../../services/memory.service.js';

const InputSchema = BaseInputSchema.extend({
  key: z.string().min(1).describe('Key of the memory to forget'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  deleted: boolean;
  key: string;
  message: string;
}

export class ForgetTool extends BaseTool<Input, Output> {
  readonly name = 'forget';
  readonly description = 'Delete a specific memory by key.';
  readonly category = 'memory' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, _bot: Bot): Promise<Output> {
    const memoryService = getMemoryService();
    const deleted = memoryService.forget(input.key);

    return {
      deleted,
      key: input.key,
      message: deleted
        ? `Forgot memory "${input.key}"`
        : `Memory "${input.key}" not found`,
    };
  }
}
