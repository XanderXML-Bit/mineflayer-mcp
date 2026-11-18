/**
 * Suggest Next Goals Tool
 *
 * Suggests what goals the AI should work on next based on current inventory.
 * Implements automatic curriculum generation inspired by Voyager.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema, type ToolContext } from '../base-tool.js';
import { getGoalDecomposition } from '../../services/goal-decomposition.service.js';

const inputSchema = BaseInputSchema.extend({
  currentInventory: z
    .array(z.string())
    .default([])
    .describe('Items already acquired (e.g., ["planks", "sticks", "wooden_pickaxe"])'),
  limit: z
    .number()
    .min(1)
    .max(20)
    .default(5)
    .describe('Maximum number of suggestions to return'),
  category: z
    .string()
    .optional()
    .describe('Filter by category (e.g., "crafting", "mining", "combat", "farming")'),
});

type Input = z.infer<typeof inputSchema>;

interface GoalSuggestion {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: number;
  estimatedMinutes: number;
  prerequisites: string[];
  relatedSkills: string[];
}

interface Output {
  suggestions: GoalSuggestion[];
  inventoryCount: number;
  availableCategories: string[];
  message: string;
}

export class SuggestNextGoalsTool extends BaseTool<Input, Output> {
  readonly name = 'suggestNextGoals';
  readonly description =
    'Suggest what goals to work on next based on current inventory. Returns achievable goals where all prerequisites are met.';
  readonly category = 'goals' as const;
  readonly inputSchema = inputSchema;

  constructor(context: ToolContext) {
    super(context);
  }

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const decomposer = getGoalDecomposition();

    // Combine provided inventory with actual bot inventory
    const inventoryItems = new Set(input.currentInventory.map((i) => i.toLowerCase().replace(/ /g, '_')));

    // Add items from bot's actual inventory
    if (bot.inventory) {
      for (const item of bot.inventory.items()) {
        inventoryItems.add(item.name.toLowerCase());
      }
    }

    const inventoryArray = Array.from(inventoryItems);

    // Get suggestions
    let suggestions = decomposer.suggestNextGoals(inventoryArray, input.limit * 2);

    // Filter by category if specified
    if (input.category) {
      const cat = input.category.toLowerCase();
      suggestions = suggestions.filter((s) => s.category === cat);
    }

    // Limit results
    suggestions = suggestions.slice(0, input.limit);

    // Get available categories
    const availableCategories = decomposer.getCategories();

    // Format output
    const formattedSuggestions: GoalSuggestion[] = suggestions.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      category: s.category,
      difficulty: s.difficulty,
      estimatedMinutes: s.estimatedTime,
      prerequisites: s.prerequisites,
      relatedSkills: s.relatedSkills,
    }));

    return {
      suggestions: formattedSuggestions,
      inventoryCount: inventoryItems.size,
      availableCategories,
      message:
        suggestions.length > 0
          ? `Found ${suggestions.length} achievable goals. Top suggestion: "${suggestions[0].name}" (difficulty: ${suggestions[0].difficulty})`
          : 'No achievable goals found. Try gathering basic resources like wood first.',
    };
  }
}
