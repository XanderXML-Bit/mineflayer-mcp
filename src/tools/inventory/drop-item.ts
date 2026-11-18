/**
 * Drop Item Tool
 * Drop items from inventory
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';

const InputSchema = BaseInputSchema.extend({
  itemName: z.string().describe('Name of the item to drop'),
  count: z.number().optional().describe('Number of items to drop (all if not specified)'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  ok: boolean;
  dropped: number;
}

export class DropItemTool extends BaseTool<Input, Output> {
  readonly name = 'dropItem';
  readonly description = 'Drop items from inventory';
  readonly category = 'inventory' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { itemName, count } = input;

    const items = bot.inventory.items().filter((i) => i.name === itemName);
    if (items.length === 0) {
      throw new Error(`Item '${itemName}' not found in inventory`);
    }

    let totalDropped = 0;
    let remaining = count;

    for (const item of items) {
      if (remaining !== undefined && remaining <= 0) break;

      const toDrop = remaining !== undefined ? Math.min(remaining, item.count) : item.count;
      await bot.toss(item.type, null, toDrop);
      totalDropped += toDrop;

      if (remaining !== undefined) {
        remaining -= toDrop;
      }
    }

    return { ok: true, dropped: totalDropped };
  }
}
