/**
 * Add Goal Tool
 *
 * Create a new goal to track progress toward an objective.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { addGoal, type Goal, type GoalPriority } from '../../services/goal.service.js';

const InputSchema = BaseInputSchema.extend({
  description: z.string().min(1).max(500).describe('What you are trying to accomplish'),
  priority: z
    .enum(['critical', 'high', 'normal', 'low'])
    .optional()
    .default('normal')
    .describe('Goal priority level'),
  context: z
    .record(z.unknown())
    .optional()
    .default({})
    .describe('Additional context data to store with the goal'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  goal: Goal;
  message: string;
}

export class AddGoalTool extends BaseTool<Input, Output> {
  readonly name = 'addGoal';
  readonly description =
    'Create a new goal to track progress. Use goals to remember what you are working toward across tool calls.';
  readonly category = 'goals' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, _bot: Bot): Promise<Output> {
    const goal = addGoal(
      input.description,
      input.priority as GoalPriority,
      input.context
    );

    return {
      goal,
      message: `Goal created: "${input.description}" (${input.priority} priority)`,
    };
  }
}
