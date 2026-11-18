/**
 * Complete Goal Tool
 *
 * Mark a goal as completed or failed.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import {
  completeGoal,
  failGoal,
  deleteGoal,
  type Goal,
} from '../../services/goal.service.js';

const InputSchema = BaseInputSchema.extend({
  id: z.string().min(1).describe('Goal ID to complete/fail/delete'),
  action: z
    .enum(['complete', 'fail', 'delete'])
    .optional()
    .default('complete')
    .describe('Action: complete, fail, or delete the goal'),
  reason: z.string().optional().describe('Reason for failure (for fail action)'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  success: boolean;
  goal?: Goal;
  message: string;
}

export class CompleteGoalTool extends BaseTool<Input, Output> {
  readonly name = 'completeGoal';
  readonly description =
    'Mark a goal as completed, failed, or delete it. Use when you finish an objective or need to abandon it.';
  readonly category = 'goals' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, _bot: Bot): Promise<Output> {
    let goal: Goal | null = null;
    let success: boolean;
    let message: string;

    switch (input.action) {
      case 'fail':
        goal = failGoal(input.id, input.reason ?? 'manually failed');
        success = !!goal;
        message = goal
          ? `Goal failed: ${goal.description}${input.reason ? ` (${input.reason})` : ''}`
          : `Goal not found: ${input.id}`;
        break;

      case 'delete':
        success = deleteGoal(input.id);
        message = success
          ? `Goal deleted: ${input.id}`
          : `Goal not found: ${input.id}`;
        break;

      case 'complete':
      default:
        goal = completeGoal(input.id);
        success = !!goal;
        message = goal
          ? `Goal completed: ${goal.description}`
          : `Goal not found: ${input.id}`;
        break;
    }

    return {
      success,
      goal: goal ?? undefined,
      message,
    };
  }
}
