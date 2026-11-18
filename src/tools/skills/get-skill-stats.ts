/**
 * Get Skill Stats Tool
 *
 * Get statistics about the skill library.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema, type ToolContext } from '../base-tool.js';
import { getSkillLibrary } from '../../services/skill-library.service.js';

const inputSchema = BaseInputSchema.extend({});

type Input = z.infer<typeof inputSchema>;

interface Output {
  totalSkills: number;
  primitiveCount: number;
  compositeCount: number;
  avgSuccessRate: number;
  mostUsed: string[];
  categories: string[];
  message: string;
}

export class GetSkillStatsTool extends BaseTool<Input, Output> {
  readonly name = 'getSkillStats';
  readonly description = 'Get statistics about the skill library including total skills, categories, and most used skills.';
  readonly category = 'skills' as const;
  readonly inputSchema = inputSchema;

  constructor(context: ToolContext) {
    super(context);
  }

  protected async execute(_input: Input, _bot: Bot): Promise<Output> {
    const library = getSkillLibrary();
    const stats = library.getStats();

    return {
      ...stats,
      avgSuccessRate: Math.round(stats.avgSuccessRate * 100) / 100,
      message: `Skill library: ${stats.totalSkills} skills (${stats.primitiveCount} primitive, ${stats.compositeCount} composite), ${Math.round(stats.avgSuccessRate * 100)}% avg success`,
    };
  }
}
