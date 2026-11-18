/**
 * Index Nearby Storage Tool
 *
 * Scan and index all storage containers within radius.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { withTask } from '../../services/task.service.js';
import {
  findNearbyStorage,
  indexStorage,
  type StorageLocation,
} from '../../services/storage-index.service.js';

const InputSchema = BaseInputSchema.extend({
  radius: z
    .number()
    .int()
    .min(1)
    .max(32)
    .optional()
    .default(16)
    .describe('Search radius in blocks'),
  maxContainers: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(10)
    .describe('Maximum containers to index'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  indexed: StorageLocation[];
  found: number;
  skipped: number;
  summary: string;
}

export class IndexNearbyStorageTool extends BaseTool<Input, Output> {
  readonly name = 'indexNearbyStorage';
  readonly description =
    'Scan and index nearby chests, barrels, and other storage containers. Saves contents to memory for later searching.';
  readonly category = 'storage' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    return withTask(bot, async () => {
      // Find nearby storage blocks
      const storageBlocks = findNearbyStorage(bot, input.radius);
      const found = storageBlocks.length;

      if (found === 0) {
        return {
          indexed: [],
          found: 0,
          skipped: 0,
          summary: `No storage containers found within ${input.radius} blocks`,
        };
      }

      // Index up to maxContainers
      const indexed: StorageLocation[] = [];
      const toIndex = storageBlocks.slice(0, input.maxContainers);

      for (const block of toIndex) {
        try {
          const location = await indexStorage(bot, block.position);
          if (location) {
            indexed.push(location);
          }
          // Small delay between containers
          await new Promise((r) => setTimeout(r, 500));
        } catch {
          // Skip containers that fail
        }
      }

      const skipped = found - indexed.length;

      let summary: string;
      if (indexed.length === 0) {
        summary = `Found ${found} containers but couldn't index any`;
      } else {
        const totalItems = indexed.reduce((sum, l) => sum + l.totalItems, 0);
        summary = `Indexed ${indexed.length} containers with ${totalItems} total items`;
        if (skipped > 0) {
          summary += `. ${skipped} containers skipped.`;
        }
      }

      return {
        indexed,
        found,
        skipped,
        summary,
      };
    });
  }
}
