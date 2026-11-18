/**
 * Check Requirements Tool
 *
 * Check what's needed to craft a specific item.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { canCraft, type CraftingRequirement } from '../../services/resource-planner.service.js';

const InputSchema = BaseInputSchema.extend({
  item: z.string().min(1).describe('Item name to check (e.g., "iron_pickaxe", "chest")'),
  count: z
    .number()
    .int()
    .min(1)
    .max(64)
    .optional()
    .default(1)
    .describe('Number of items to craft'),
});

type Input = z.infer<typeof InputSchema>;

interface Output extends CraftingRequirement {
  summary: string;
}

export class CheckRequirementsTool extends BaseTool<Input, Output> {
  readonly name = 'checkRequirements';
  readonly description =
    'Check crafting requirements for an item. Shows what ingredients are needed and what you have.';
  readonly category = 'inventory' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const requirement = canCraft(bot, input.item, input.count);

    let summary: string;

    if (requirement.ingredients.length === 0) {
      summary = `No recipe found for "${input.item}". Check the item name.`;
    } else if (requirement.canCraft) {
      if (requirement.maxCraftable > input.count) {
        summary = `Can craft ${input.count}x ${input.item} (max: ${requirement.maxCraftable})`;
      } else {
        summary = `Can craft ${input.count}x ${input.item}`;
      }
    } else {
      const missing = requirement.missingIngredients
        .map((m) => `${m.missing}x ${m.item}`)
        .join(', ');
      summary = `Cannot craft ${input.count}x ${input.item}. Missing: ${missing}`;
      if (requirement.maxCraftable > 0) {
        summary += `. Can craft ${requirement.maxCraftable} with current materials.`;
      }
    }

    return {
      ...requirement,
      summary,
    };
  }
}
