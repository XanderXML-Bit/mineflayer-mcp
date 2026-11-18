/**
 * List Goals Tool
 *
 * View all goals with their status and progress.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import {
  getActiveGoals,
  getPendingGoals,
  getGoalHistory,
  getAllGoals,
  getGoalStats,
  type Goal,
} from '../../services/goal.service.js';

const InputSchema = BaseInputSchema.extend({
  filter: z
    .enum(['active', 'pending', 'history', 'all'])
    .optional()
    .default('pending')
    .describe('Which goals to show: active, pending (active+paused), history (completed+failed), or all'),
  limit: z.number().int().min(1).max(50).optional().default(20).describe('Maximum goals to return'),
});

type Input = z.infer<typeof InputSchema>;

interface GoalSummary {
  id: string;
  description: string;
  priority: string;
  status: string;
  progress: number;
  subgoals: string[];
  age: string;
}

interface Output {
  goals: GoalSummary[];
  stats: {
    activeCount: number;
    pausedCount: number;
    completedCount: number;
    failedCount: number;
    averageProgress: number;
  };
  summary: string;
}

export class ListGoalsTool extends BaseTool<Input, Output> {
  readonly name = 'listGoals';
  readonly description =
    'List all goals with status and progress. Use to review what you are working on and what has been completed.';
  readonly category = 'goals' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, _bot: Bot): Promise<Output> {
    let goals: Goal[];

    switch (input.filter) {
      case 'active':
        goals = getActiveGoals();
        break;
      case 'history':
        goals = getGoalHistory(input.limit);
        break;
      case 'all':
        goals = getAllGoals();
        break;
      case 'pending':
      default:
        goals = getPendingGoals();
        break;
    }

    goals = goals.slice(0, input.limit);

    const stats = getGoalStats();

    const goalSummaries: GoalSummary[] = goals.map((g) => ({
      id: g.id,
      description: g.description,
      priority: g.priority,
      status: g.status,
      progress: g.progress,
      subgoals: g.subgoals,
      age: this.formatAge(g.createdAt),
    }));

    // Build summary string
    let summary: string;
    if (goalSummaries.length === 0) {
      summary = `No ${input.filter} goals.`;
    } else {
      const parts: string[] = [];
      if (stats.activeCount > 0) parts.push(`${stats.activeCount} active`);
      if (stats.pausedCount > 0) parts.push(`${stats.pausedCount} paused`);
      if (stats.completedCount > 0) parts.push(`${stats.completedCount} completed`);
      if (stats.failedCount > 0) parts.push(`${stats.failedCount} failed`);
      summary = `Goals: ${parts.join(', ')}. Average progress: ${stats.averageProgress}%`;
    }

    return {
      goals: goalSummaries,
      stats,
      summary,
    };
  }

  private formatAge(timestamp: number): string {
    const ms = Date.now() - timestamp;
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }
}
