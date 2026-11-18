/**
 * Record Outcome Tool
 *
 * Record the outcome of a task for learning and pattern analysis.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema, type ToolContext } from '../base-tool.js';
import { getReflectionService, type FailureCategory } from '../../services/reflection.service.js';

const inputSchema = BaseInputSchema.extend({
  task: z
    .string()
    .min(1)
    .describe('Name/description of the task that was attempted'),
  success: z
    .boolean()
    .describe('Whether the task succeeded'),
  duration: z
    .number()
    .min(0)
    .default(0)
    .describe('How long the task took in milliseconds'),
  toolsUsed: z
    .array(z.string())
    .default([])
    .describe('List of tools used during the task'),
  skillUsed: z
    .string()
    .optional()
    .describe('Name of skill used (if any) - will update skill success rate'),
  failureReason: z
    .string()
    .optional()
    .describe('Why the task failed (if it failed)'),
  lessonsLearned: z
    .array(z.string())
    .optional()
    .describe('Lessons learned from this attempt'),
  goal: z
    .string()
    .optional()
    .describe('Higher-level goal this task was part of'),
});

type Input = z.infer<typeof inputSchema>;

interface Output {
  recorded: boolean;
  outcomeId: string;
  failureCategory?: FailureCategory;
  message: string;
}

export class RecordOutcomeTool extends BaseTool<Input, Output> {
  readonly name = 'recordOutcome';
  readonly description =
    'Record the outcome of a task for learning. Call this after completing or failing a task to track patterns and improve future attempts.';
  readonly category = 'skills' as const;
  readonly inputSchema = inputSchema;

  constructor(context: ToolContext) {
    super(context);
  }

  protected async execute(input: Input, _bot: Bot): Promise<Output> {
    const reflection = getReflectionService();

    const outcome = reflection.recordOutcome({
      task: input.task,
      success: input.success,
      duration: input.duration,
      toolsUsed: input.toolsUsed,
      skillUsed: input.skillUsed,
      failureReason: input.failureReason,
      lessonsLearned: input.lessonsLearned,
      goal: input.goal,
      context: {},
    });

    const statusText = input.success ? 'succeeded' : 'failed';
    const categoryText = outcome.failureCategory ? ` (${outcome.failureCategory})` : '';

    return {
      recorded: true,
      outcomeId: outcome.id,
      failureCategory: outcome.failureCategory,
      message: `Recorded: "${input.task}" ${statusText}${categoryText}`,
    };
  }
}
