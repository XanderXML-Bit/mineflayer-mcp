/**
 * Recall Tool
 *
 * Retrieve information from persistent memory.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { getMemoryService } from '../../services/memory.service.js';

const InputSchema = BaseInputSchema.extend({
  key: z.string().min(1).describe('Key of the memory to recall'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  found: boolean;
  key: string;
  value: unknown;
  category: string | null;
  timestamp: number | null;
  metadata: Record<string, unknown> | null;
  age: string | null;
}

export class RecallTool extends BaseTool<Input, Output> {
  readonly name = 'recall';
  readonly description = 'Retrieve a specific memory by key. Returns the stored value and metadata.';
  readonly category = 'memory' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, _bot: Bot): Promise<Output> {
    const memoryService = getMemoryService();
    const entry = memoryService.recall(input.key);

    if (!entry) {
      return {
        found: false,
        key: input.key,
        value: null,
        category: null,
        timestamp: null,
        metadata: null,
        age: null,
      };
    }

    // Calculate age
    const ageMs = Date.now() - entry.timestamp;
    const ageMinutes = Math.floor(ageMs / 60000);
    const ageHours = Math.floor(ageMinutes / 60);
    const ageDays = Math.floor(ageHours / 24);

    let age: string;
    if (ageDays > 0) {
      age = `${ageDays} day(s) ago`;
    } else if (ageHours > 0) {
      age = `${ageHours} hour(s) ago`;
    } else if (ageMinutes > 0) {
      age = `${ageMinutes} minute(s) ago`;
    } else {
      age = 'just now';
    }

    return {
      found: true,
      key: entry.key,
      value: entry.value,
      category: entry.category,
      timestamp: entry.timestamp,
      metadata: entry.metadata || null,
      age,
    };
  }
}
