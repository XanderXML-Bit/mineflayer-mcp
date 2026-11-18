/**
 * What Can I Craft Tool
 *
 * List all items that can be crafted from current inventory.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { whatCanICraft, type CraftableItem } from '../../services/resource-planner.service.js';

const InputSchema = BaseInputSchema.extend({
  filter: z
    .string()
    .optional()
    .describe('Filter results by item name (partial match)'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(20)
    .describe('Maximum number of items to return'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  craftable: CraftableItem[];
  totalCraftable: number;
  summary: string;
}

export class WhatCanICraftTool extends BaseTool<Input, Output> {
  readonly name = 'whatCanICraft';
  readonly description =
    'List all items that can be crafted from your current inventory. Shows max craftable count and required ingredients.';
  readonly category = 'inventory' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    let craftable = whatCanICraft(bot);

    // Apply filter if provided
    if (input.filter) {
      const filterLower = input.filter.toLowerCase();
      craftable = craftable.filter((item) => item.item.toLowerCase().includes(filterLower));
    }

    const totalCraftable = craftable.length;

    // Apply limit
    craftable = craftable.slice(0, input.limit);

    let summary: string;
    if (totalCraftable === 0) {
      summary = input.filter
        ? `No craftable items matching "${input.filter}"`
        : 'No items can be crafted from current inventory';
    } else {
      const topItems = craftable
        .slice(0, 3)
        .map((c) => `${c.maxCount}x ${c.item}`)
        .join(', ');
      summary = `Can craft ${totalCraftable} different items. Top: ${topItems}`;
      if (totalCraftable > input.limit) {
        summary += `. Showing ${input.limit} of ${totalCraftable}.`;
      }
    }

    return {
      craftable,
      totalCraftable,
      summary,
    };
  }
}
