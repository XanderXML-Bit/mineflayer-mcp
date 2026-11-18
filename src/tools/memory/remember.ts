/**
 * Remember Tool
 *
 * Store information in persistent memory.
 * Useful for remembering locations, resources, and other important data.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { getMemoryService, type MemoryCategory } from '../../services/memory.service.js';

const InputSchema = BaseInputSchema.extend({
  key: z.string().min(1).describe('Unique key for this memory (e.g., "home_base", "diamond_mine")'),
  value: z.any().describe('Value to store (can be coordinates, notes, or any data)'),
  category: z
    .enum(['spatial', 'resource', 'entity', 'task', 'general'])
    .optional()
    .default('general')
    .describe('Category: spatial (locations), resource (items), entity (players/mobs), task (history), general'),
  metadata: z
    .record(z.any())
    .optional()
    .describe('Optional metadata (e.g., { biome: "plains", notes: "safe area" })'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  key: string;
  category: MemoryCategory;
  overwritten: boolean;
  message: string;
}

export class RememberTool extends BaseTool<Input, Output> {
  readonly name = 'remember';
  readonly description =
    'Store information in persistent memory. Useful for remembering locations, resources, and important data that persists across sessions.';
  readonly category = 'memory' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, _bot: Bot): Promise<Output> {
    const memoryService = getMemoryService();

    const { overwritten } = memoryService.remember(
      input.key,
      input.value,
      input.category as MemoryCategory,
      input.metadata
    );

    return {
      key: input.key,
      category: input.category as MemoryCategory,
      overwritten,
      message: overwritten
        ? `Updated memory "${input.key}"`
        : `Stored new memory "${input.key}"`,
    };
  }
}
