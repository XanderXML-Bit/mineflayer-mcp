/**
 * Plan Goal Tool
 *
 * Decomposes a high-level goal into ordered steps using Minecraft's tech tree.
 * Returns the sequence of prerequisites and actions needed to achieve the goal.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema, type ToolContext } from '../base-tool.js';
import { getGoalDecomposition } from '../../services/goal-decomposition.service.js';

const inputSchema = BaseInputSchema.extend({
  goal: z
    .string()
    .describe('The goal to plan for (e.g., "diamond_pickaxe", "iron_armor", "nether_portal")'),
  currentInventory: z
    .array(z.string())
    .default([])
    .describe('Items already in inventory to skip (e.g., ["planks", "sticks"])'),
});

type Input = z.infer<typeof inputSchema>;

interface SimplifiedStep {
  step: number;
  action: string;
  description: string;
  category: string;
  difficulty: number;
  estimatedMinutes: number;
  toolRequired?: string;
  relatedSkill?: string;
}

interface Output {
  goal: string;
  totalSteps: number;
  totalDifficulty: number;
  estimatedMinutes: number;
  steps: SimplifiedStep[];
  suggestedSkills: string[];
  message: string;
}

export class PlanGoalTool extends BaseTool<Input, Output> {
  readonly name = 'planGoal';
  readonly description =
    'Break down a high-level goal into ordered steps. Uses Minecraft tech tree knowledge to plan the sequence of prerequisites and actions needed.';
  readonly category = 'goals' as const;
  readonly inputSchema = inputSchema;

  constructor(context: ToolContext) {
    super(context);
  }

  protected async execute(input: Input, _bot: Bot): Promise<Output> {
    const decomposer = getGoalDecomposition();

    // First try to find matching goals if the input isn't an exact ID
    let goalId = input.goal.toLowerCase().replace(/ /g, '_');
    const node = decomposer.getNode(goalId);

    if (!node) {
      // Try to find matching goals
      const matches = decomposer.findGoals(input.goal);
      if (matches.length > 0) {
        goalId = matches[0].id;
      }
    }

    const result = decomposer.decomposeGoal(goalId, input.currentInventory);

    if (result.steps.length === 0) {
      return {
        goal: input.goal,
        totalSteps: 0,
        totalDifficulty: 0,
        estimatedMinutes: 0,
        steps: [],
        suggestedSkills: [],
        message: `Unknown goal "${input.goal}". Try: wooden_pickaxe, iron_pickaxe, diamond_pickaxe, iron_armor, nether_portal, enchanting_table`,
      };
    }

    // Simplify steps for output
    const simplifiedSteps: SimplifiedStep[] = result.steps.map((step, index) => ({
      step: index + 1,
      action: step.action,
      description: step.description,
      category: step.category,
      difficulty: step.difficulty,
      estimatedMinutes: step.estimatedTime,
      toolRequired: step.toolRequired,
      relatedSkill: step.relatedSkill?.name,
    }));

    return {
      goal: goalId,
      totalSteps: result.steps.length,
      totalDifficulty: result.totalDifficulty,
      estimatedMinutes: result.estimatedTotalTime,
      steps: simplifiedSteps,
      suggestedSkills: result.suggestedSkills.map((s) => s.name),
      message: `Plan for "${goalId}": ${result.steps.length} steps, difficulty ${result.totalDifficulty}, ~${Math.round(result.estimatedTotalTime)} minutes`,
    };
  }
}
