/**
 * Suggest Curriculum Tool
 *
 * Automatic curriculum generation inspired by Voyager.
 * Combines goal decomposition, skill library, and reflection insights
 * to suggest what the AI should work on next.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema, type ToolContext } from '../base-tool.js';
import { getGoalDecomposition, type TechTreeNode } from '../../services/goal-decomposition.service.js';
import { getSkillLibrary } from '../../services/skill-library.service.js';
import { getReflectionService } from '../../services/reflection.service.js';

const inputSchema = BaseInputSchema.extend({
  focus: z
    .enum(['exploration', 'progression', 'mastery', 'balanced'])
    .default('balanced')
    .describe('Learning focus: exploration (try new things), progression (advance tech tree), mastery (improve weak areas), balanced (mix)'),
  limit: z
    .number()
    .min(1)
    .max(10)
    .default(5)
    .describe('Maximum number of suggestions'),
});

type Input = z.infer<typeof inputSchema>;

interface CurriculumSuggestion {
  task: string;
  description: string;
  reason: string;
  difficulty: number;
  category: string;
  relatedSkill?: string;
  skillSuccessRate?: number;
  priority: 'high' | 'medium' | 'low';
}

interface Output {
  suggestions: CurriculumSuggestion[];
  currentState: {
    inventoryItems: number;
    skillCount: number;
    avgSkillSuccess: number;
    recentFailures: string[];
  };
  focus: string;
  message: string;
}

export class SuggestCurriculumTool extends BaseTool<Input, Output> {
  readonly name = 'suggestCurriculum';
  readonly description =
    'Get personalized task suggestions based on current state, learned skills, and past performance. Implements automatic curriculum generation.';
  readonly category = 'goals' as const;
  readonly inputSchema = inputSchema;

  constructor(context: ToolContext) {
    super(context);
  }

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const decomposer = getGoalDecomposition();
    const skillLib = getSkillLibrary();
    const reflection = getReflectionService();

    // Gather current state
    const inventoryItems = new Set<string>();
    if (bot.inventory) {
      for (const item of bot.inventory.items()) {
        inventoryItems.add(item.name.toLowerCase());
      }
    }
    const inventoryArray = Array.from(inventoryItems);

    const skillStats = skillLib.getStats();
    const reflectionStats = reflection.getStats();
    const insights = reflection.getInsights();

    // Get achievable goals from tech tree
    const achievableGoals = decomposer.suggestNextGoals(inventoryArray, 20);

    // Get all skills
    const allSkills = skillLib.getAllSkills();

    // Recent failures for context
    const recentOutcomes = reflection.getRecentOutcomes(10);
    const recentFailures = recentOutcomes
      .filter(o => !o.success)
      .map(o => o.task)
      .slice(0, 3);

    // Build suggestions based on focus
    const suggestions: CurriculumSuggestion[] = [];

    switch (input.focus) {
      case 'exploration':
        this.addExplorationSuggestions(suggestions, achievableGoals, allSkills, inventoryArray);
        break;
      case 'progression':
        this.addProgressionSuggestions(suggestions, achievableGoals, inventoryArray);
        break;
      case 'mastery':
        this.addMasterySuggestions(suggestions, allSkills, reflectionStats, insights);
        break;
      case 'balanced':
      default:
        this.addBalancedSuggestions(suggestions, achievableGoals, allSkills, reflectionStats, insights, inventoryArray);
        break;
    }

    // Sort by priority and limit
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || a.difficulty - b.difficulty);
    const finalSuggestions = suggestions.slice(0, input.limit);

    return {
      suggestions: finalSuggestions,
      currentState: {
        inventoryItems: inventoryItems.size,
        skillCount: skillStats.totalSkills,
        avgSkillSuccess: Math.round(skillStats.avgSuccessRate * 100) / 100,
        recentFailures,
      },
      focus: input.focus,
      message: finalSuggestions.length > 0
        ? `${finalSuggestions.length} tasks suggested (${input.focus} focus). Top: "${finalSuggestions[0].task}"`
        : 'No suggestions available. Try gathering basic resources first.',
    };
  }

  private addExplorationSuggestions(
    suggestions: CurriculumSuggestion[],
    goals: TechTreeNode[],
    skills: Array<{ name: string; successRate: number; timesUsed: number }>,
    inventory: string[]
  ): void {
    // Suggest goals we haven't tried before
    const usedSkillNames = new Set(skills.filter(s => s.timesUsed > 0).map(s => s.name));

    for (const goal of goals) {
      if (goal.relatedSkills.length > 0 && !goal.relatedSkills.some(s => usedSkillNames.has(s))) {
        suggestions.push({
          task: goal.id,
          description: goal.description,
          reason: 'Try something new - related skills not yet used',
          difficulty: goal.difficulty,
          category: goal.category,
          relatedSkill: goal.relatedSkills[0],
          priority: 'medium',
        });
      }
    }

    // Also suggest unexplored categories
    const exploredCategories = new Set(inventory.map(i => this.categorizeItem(i)));
    for (const goal of goals) {
      if (!exploredCategories.has(goal.category) && !suggestions.find(s => s.task === goal.id)) {
        suggestions.push({
          task: goal.id,
          description: goal.description,
          reason: `Explore ${goal.category} category`,
          difficulty: goal.difficulty,
          category: goal.category,
          priority: 'low',
        });
      }
    }
  }

  private addProgressionSuggestions(
    suggestions: CurriculumSuggestion[],
    goals: TechTreeNode[],
    inventory: string[]
  ): void {
    // Prioritize tech tree progression
    const _hasPickaxeTier = this.getPickaxeTier(inventory);

    for (const goal of goals) {
      let priority: 'high' | 'medium' | 'low' = 'medium';
      let reason = 'Advance through tech tree';

      // High priority for tool upgrades
      if (goal.id.includes('pickaxe') || goal.id.includes('axe') || goal.id.includes('sword')) {
        priority = 'high';
        reason = 'Upgrade tools for better efficiency';
      }

      // High priority for furnace if we don't have one
      if (goal.id === 'furnace' && !inventory.includes('furnace')) {
        priority = 'high';
        reason = 'Essential for smelting ores';
      }

      // Medium priority for armor
      if (goal.id.includes('armor') || goal.id.includes('helmet') || goal.id.includes('chestplate')) {
        priority = 'medium';
        reason = 'Improve defense for survival';
      }

      suggestions.push({
        task: goal.id,
        description: goal.description,
        reason,
        difficulty: goal.difficulty,
        category: goal.category,
        relatedSkill: goal.relatedSkills[0],
        priority,
      });
    }
  }

  private addMasterySuggestions(
    suggestions: CurriculumSuggestion[],
    skills: Array<{ name: string; successRate: number; timesUsed: number; description: string; tags: string[] }>,
    stats: { failuresByCategory: Record<string, number> },
    insights: Array<{ type: string; message: string; relevantTo?: string[] }>
  ): void {
    // Find skills with low success rates that have been tried
    const weakSkills = skills
      .filter(s => s.timesUsed >= 2 && s.successRate < 0.7)
      .sort((a, b) => a.successRate - b.successRate);

    for (const skill of weakSkills.slice(0, 3)) {
      suggestions.push({
        task: `practice_${skill.name}`,
        description: `Practice "${skill.name}" to improve success rate`,
        reason: `Current success rate is ${Math.round(skill.successRate * 100)}%`,
        difficulty: 3,
        category: 'mastery',
        relatedSkill: skill.name,
        skillSuccessRate: skill.successRate,
        priority: 'high',
      });
    }

    // Address common failure categories
    const topFailures = Object.entries(stats.failuresByCategory)
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2);

    for (const [category, count] of topFailures) {
      let task = '';
      let description = '';

      switch (category) {
        case 'resource_missing':
          task = 'gather_resources';
          description = 'Build up resource stockpile before complex tasks';
          break;
        case 'tool_broken':
          task = 'craft_backup_tools';
          description = 'Craft spare tools to prevent mid-task failures';
          break;
        case 'mob_attack':
          task = 'improve_combat_gear';
          description = 'Upgrade armor and weapons for better survival';
          break;
        case 'navigation_failed':
          task = 'clear_path';
          description = 'Practice navigation in easier terrain';
          break;
        default:
          continue;
      }

      suggestions.push({
        task,
        description,
        reason: `${count} recent ${category.replace('_', ' ')} failures`,
        difficulty: 2,
        category: 'mastery',
        priority: 'high',
      });
    }

    // Add insight-based suggestions
    for (const insight of insights.filter(i => i.type === 'tip' || i.type === 'warning')) {
      if (insight.relevantTo && insight.relevantTo.length > 0) {
        suggestions.push({
          task: `address_${insight.relevantTo[0]}`,
          description: insight.message,
          reason: 'Based on pattern analysis',
          difficulty: 3,
          category: 'mastery',
          priority: insight.type === 'warning' ? 'high' : 'medium',
        });
      }
    }
  }

  private addBalancedSuggestions(
    suggestions: CurriculumSuggestion[],
    goals: TechTreeNode[],
    skills: Array<{ name: string; successRate: number; timesUsed: number; description: string; tags: string[] }>,
    stats: { failuresByCategory: Record<string, number> },
    insights: Array<{ type: string; message: string; relevantTo?: string[] }>,
    inventory: string[]
  ): void {
    // Mix of all approaches
    this.addProgressionSuggestions(suggestions, goals.slice(0, 3), inventory);
    this.addMasterySuggestions(suggestions, skills, stats, insights);
    this.addExplorationSuggestions(suggestions, goals.slice(3), skills, inventory);
  }

  private getPickaxeTier(inventory: string[]): number {
    if (inventory.some(i => i.includes('netherite_pickaxe'))) return 5;
    if (inventory.some(i => i.includes('diamond_pickaxe'))) return 4;
    if (inventory.some(i => i.includes('iron_pickaxe'))) return 3;
    if (inventory.some(i => i.includes('stone_pickaxe'))) return 2;
    if (inventory.some(i => i.includes('wooden_pickaxe'))) return 1;
    return 0;
  }

  private categorizeItem(itemName: string): string {
    if (itemName.includes('pickaxe') || itemName.includes('axe') || itemName.includes('shovel')) return 'tools';
    if (itemName.includes('sword') || itemName.includes('bow')) return 'weapons';
    if (itemName.includes('helmet') || itemName.includes('chestplate') || itemName.includes('leggings') || itemName.includes('boots')) return 'armor';
    if (itemName.includes('ore') || itemName.includes('raw_')) return 'ores';
    if (itemName.includes('ingot')) return 'metals';
    if (itemName.includes('planks') || itemName.includes('log')) return 'wood';
    return 'misc';
  }
}
