/**
 * Get Lessons Tool
 *
 * Retrieve lessons learned from past experiences.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema, type ToolContext } from '../base-tool.js';
import { getReflectionService } from '../../services/reflection.service.js';

const inputSchema = BaseInputSchema.extend({
  limit: z
    .number()
    .min(1)
    .max(50)
    .default(10)
    .describe('Maximum number of lessons to return'),
});

type Input = z.infer<typeof inputSchema>;

interface Output {
  lessons: string[];
  totalLessons: number;
  message: string;
}

export class GetLessonsTool extends BaseTool<Input, Output> {
  readonly name = 'getLessons';
  readonly description =
    'Get lessons learned from past experiences. These are extracted from failed tasks and recorded insights.';
  readonly category = 'skills' as const;
  readonly inputSchema = inputSchema;

  constructor(context: ToolContext) {
    super(context);
  }

  protected async execute(input: Input, _bot: Bot): Promise<Output> {
    const reflection = getReflectionService();

    const allLessons = reflection.getLessons();
    const lessons = allLessons.slice(0, input.limit);

    return {
      lessons,
      totalLessons: allLessons.length,
      message: lessons.length > 0
        ? `${lessons.length} lessons available (${allLessons.length} total)`
        : 'No lessons recorded yet. Record task outcomes with lessonsLearned to build knowledge.',
    };
  }
}
