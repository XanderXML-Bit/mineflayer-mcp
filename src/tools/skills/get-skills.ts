/**
 * Get Skills Tool
 *
 * Search for relevant skills by query, tags, or category.
 * Returns skills that match the search criteria, sorted by relevance.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema, type ToolContext } from '../base-tool.js';
import { getSkillLibrary } from '../../services/skill-library.service.js';

const inputSchema = BaseInputSchema.extend({
  query: z
    .string()
    .optional()
    .describe('Search query to find relevant skills (searches name, description, tags, outcomes)'),
  tags: z
    .array(z.string())
    .optional()
    .describe('Filter by specific tags'),
  category: z
    .string()
    .optional()
    .describe('Filter by category (e.g., "crafting", "gathering", "combat")'),
  minSuccessRate: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('Minimum success rate (0-1)'),
  limit: z
    .number()
    .min(1)
    .max(20)
    .default(5)
    .describe('Maximum number of skills to return'),
  sortBy: z
    .enum(['relevance', 'successRate', 'timesUsed', 'recent'])
    .default('relevance')
    .describe('How to sort results'),
});

type Input = z.infer<typeof inputSchema>;

interface SkillSummary {
  name: string;
  description: string;
  tags: string[];
  complexity: string;
  stepCount: number;
  successRate: number;
  timesUsed: number;
  prerequisites: string[];
  outcomes: string[];
  category?: string;
}

interface Output {
  found: number;
  skills: SkillSummary[];
  message: string;
}

export class GetSkillsTool extends BaseTool<Input, Output> {
  readonly name = 'getSkills';
  readonly description =
    'Search for relevant skills by query, tags, or category. Use this before attempting a task to see if you have learned skills that can help.';
  readonly category = 'skills' as const;
  readonly inputSchema = inputSchema;

  constructor(context: ToolContext) {
    super(context);
  }

  protected async execute(input: Input, _bot: Bot): Promise<Output> {
    const library = getSkillLibrary();

    const skills = library.searchSkills({
      query: input.query,
      tags: input.tags,
      category: input.category,
      minSuccessRate: input.minSuccessRate,
      limit: input.limit,
      sortBy: input.sortBy,
    });

    const summaries: SkillSummary[] = skills.map(s => ({
      name: s.name,
      description: s.description,
      tags: s.tags,
      complexity: s.complexity,
      stepCount: s.steps.length,
      successRate: Math.round(s.successRate * 100) / 100,
      timesUsed: s.timesUsed,
      prerequisites: s.prerequisites,
      outcomes: s.outcomes,
      category: s.category,
    }));

    const queryDesc = input.query ? `"${input.query}"` : 'all skills';
    const message =
      skills.length > 0
        ? `Found ${skills.length} skill(s) matching ${queryDesc}`
        : `No skills found matching ${queryDesc}. Consider creating one after completing the task.`;

    return {
      found: skills.length,
      skills: summaries,
      message,
    };
  }
}
