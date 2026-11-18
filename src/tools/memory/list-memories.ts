/**
 * List Memories Tool
 *
 * List all stored memories, optionally filtered by category.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { getMemoryService, type MemoryCategory, type MemoryEntry } from '../../services/memory.service.js';

const InputSchema = BaseInputSchema.extend({
  category: z
    .enum(['spatial', 'resource', 'entity', 'task', 'general'])
    .optional()
    .describe('Filter by category (optional)'),
  search: z.string().optional().describe('Search query to filter memories'),
  limit: z.number().optional().default(50).describe('Maximum number of memories to return'),
});

type Input = z.infer<typeof InputSchema>;

interface MemorySummary {
  key: string;
  category: string;
  preview: string;
  age: string;
}

interface Output {
  count: number;
  totalCount: number;
  categories: Record<string, number>;
  memories: MemorySummary[];
}

export class ListMemoriesTool extends BaseTool<Input, Output> {
  readonly name = 'listMemories';
  readonly description = 'List all stored memories. Can filter by category or search query.';
  readonly category = 'memory' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, _bot: Bot): Promise<Output> {
    const memoryService = getMemoryService();

    let entries: MemoryEntry[];

    if (input.search) {
      entries = memoryService.search(input.search, input.category as MemoryCategory | undefined);
    } else {
      entries = memoryService.list(input.category as MemoryCategory | undefined, input.limit);
    }

    // Calculate category counts
    const allEntries = memoryService.list(undefined, 1000);
    const categories: Record<string, number> = {};
    for (const entry of allEntries) {
      categories[entry.category] = (categories[entry.category] || 0) + 1;
    }

    // Convert to summaries
    const memories: MemorySummary[] = entries.slice(0, input.limit).map((entry) => {
      // Create preview of value
      let preview: string;
      if (typeof entry.value === 'string') {
        preview = entry.value.slice(0, 100);
      } else if (typeof entry.value === 'object' && entry.value !== null) {
        const obj = entry.value as Record<string, unknown>;
        // Special handling for coordinates
        if ('x' in obj && 'y' in obj && 'z' in obj) {
          preview = `(${obj.x}, ${obj.y}, ${obj.z})`;
        } else {
          preview = JSON.stringify(entry.value).slice(0, 100);
        }
      } else {
        preview = String(entry.value);
      }

      // Calculate age
      const ageMs = Date.now() - entry.timestamp;
      const ageMinutes = Math.floor(ageMs / 60000);
      const ageHours = Math.floor(ageMinutes / 60);
      const ageDays = Math.floor(ageHours / 24);

      let age: string;
      if (ageDays > 0) {
        age = `${ageDays}d`;
      } else if (ageHours > 0) {
        age = `${ageHours}h`;
      } else if (ageMinutes > 0) {
        age = `${ageMinutes}m`;
      } else {
        age = 'now';
      }

      return {
        key: entry.key,
        category: entry.category,
        preview,
        age,
      };
    });

    return {
      count: memories.length,
      totalCount: memoryService.count(),
      categories,
      memories,
    };
  }
}
