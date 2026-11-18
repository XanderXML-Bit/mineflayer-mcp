/**
 * Get Insights Tool
 *
 * Get AI-generated insights from task outcome patterns.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema, type ToolContext } from '../base-tool.js';
import { getReflectionService, type Insight } from '../../services/reflection.service.js';

const inputSchema = BaseInputSchema.extend({});

type Input = z.infer<typeof inputSchema>;

interface Output {
  insights: Insight[];
  stats: {
    totalTasks: number;
    successRate: number;
    topFailureCategory: string | null;
  };
  message: string;
}

export class GetInsightsTool extends BaseTool<Input, Output> {
  readonly name = 'getInsights';
  readonly description =
    'Get insights from past task outcomes. Returns patterns, warnings, and tips based on recorded successes and failures.';
  readonly category = 'skills' as const;
  readonly inputSchema = inputSchema;

  constructor(context: ToolContext) {
    super(context);
  }

  protected async execute(_input: Input, _bot: Bot): Promise<Output> {
    const reflection = getReflectionService();

    const insights = reflection.getInsights();
    const stats = reflection.getStats();

    // Find top failure category
    let topFailureCategory: string | null = null;
    let maxFailures = 0;
    for (const [category, count] of Object.entries(stats.failuresByCategory)) {
      if (count > maxFailures) {
        maxFailures = count;
        topFailureCategory = category;
      }
    }

    const insightSummary = insights.length > 0
      ? `Found ${insights.length} insights: ${insights.map(i => i.type).join(', ')}`
      : 'No significant patterns detected yet. Keep recording outcomes.';

    return {
      insights,
      stats: {
        totalTasks: stats.totalTasks,
        successRate: Math.round(stats.successRate * 100) / 100,
        topFailureCategory: maxFailures > 0 ? topFailureCategory : null,
      },
      message: insightSummary,
    };
  }
}
