/**
 * Update Goal Tool
 *
 * Update an existing goal's progress, status, or details.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import {
  updateGoal,
  pauseGoal,
  resumeGoal,
  addSubgoal,
  type Goal,
} from '../../services/goal.service.js';

const InputSchema = BaseInputSchema.extend({
  id: z.string().min(1).describe('Goal ID to update'),
  progress: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .describe('New progress percentage (0-100)'),
  description: z.string().optional().describe('Updated goal description'),
  priority: z.enum(['critical', 'high', 'normal', 'low']).optional().describe('Updated priority'),
  action: z
    .enum(['update', 'pause', 'resume', 'add_subgoal'])
    .optional()
    .default('update')
    .describe('Action to perform'),
  subgoal: z.string().optional().describe('Subgoal text (for add_subgoal action)'),
  context: z.record(z.unknown()).optional().describe('Additional context data'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  success: boolean;
  goal?: Goal;
  message: string;
}

export class UpdateGoalTool extends BaseTool<Input, Output> {
  readonly name = 'updateGoal';
  readonly description =
    'Update a goal progress, status, or details. Use to track incremental progress or pause/resume goals.';
  readonly category = 'goals' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, _bot: Bot): Promise<Output> {
    let goal: Goal | null = null;
    let message: string;

    switch (input.action) {
      case 'pause':
        goal = pauseGoal(input.id);
        message = goal ? `Goal paused: ${goal.description}` : `Goal not found: ${input.id}`;
        break;

      case 'resume':
        goal = resumeGoal(input.id);
        message = goal ? `Goal resumed: ${goal.description}` : `Goal not found or not paused: ${input.id}`;
        break;

      case 'add_subgoal':
        if (!input.subgoal) {
          return {
            success: false,
            message: 'Subgoal text is required for add_subgoal action',
          };
        }
        goal = addSubgoal(input.id, input.subgoal);
        message = goal
          ? `Subgoal added: ${input.subgoal}`
          : `Goal not found: ${input.id}`;
        break;

      case 'update':
      default: {
        const updates: Partial<Pick<Goal, 'progress' | 'description' | 'priority' | 'context'>> = {};
        if (input.progress !== undefined) updates.progress = input.progress;
        if (input.description !== undefined) updates.description = input.description;
        if (input.priority !== undefined) updates.priority = input.priority;
        if (input.context !== undefined) updates.context = input.context;

        goal = updateGoal(input.id, updates);
        if (goal) {
          const parts: string[] = [];
          if (input.progress !== undefined) parts.push(`progress: ${input.progress}%`);
          if (input.description !== undefined) parts.push('description updated');
          if (input.priority !== undefined) parts.push(`priority: ${input.priority}`);
          message = `Goal updated (${parts.join(', ')})`;
        } else {
          message = `Goal not found: ${input.id}`;
        }
        break;
      }
    }

    return {
      success: !!goal,
      goal: goal ?? undefined,
      message,
    };
  }
}
