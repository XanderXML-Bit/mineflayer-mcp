/**
 * Integration Test: AI Learning Workflow
 *
 * Tests the full AI learning cycle inspired by Voyager:
 * 1. Goal decomposition -> ordered steps
 * 2. Skill library -> save/retrieve learned sequences
 * 3. Reflection -> record outcomes, generate insights
 * 4. Curriculum -> suggest next tasks based on state
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SkillLibraryService } from '../../src/services/skill-library.service.js';
import { GoalDecompositionService } from '../../src/services/goal-decomposition.service.js';
import { ReflectionService } from '../../src/services/reflection.service.js';

describe('AI Learning Workflow Integration', () => {
  // Each test owns a fresh temporary directory, so parallel suites never share files.
  let testDir: string;
  let skillsPath: string;
  let reflectionPath: string;

  let skillLib: SkillLibraryService;
  let goalDecomp: GoalDecompositionService;
  let reflection: ReflectionService;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'mc-mcp-ai-learning-'));
    skillsPath = join(testDir, 'test-skills.json');
    reflectionPath = join(testDir, 'test-reflections.json');

    // Initialize services
    skillLib = new SkillLibraryService(skillsPath);
    goalDecomp = new GoalDecompositionService();
    reflection = new ReflectionService(reflectionPath);
  });

  afterEach(async () => {
    await skillLib.shutdown();
    await reflection.shutdown();
    rmSync(testDir, { recursive: true });
  });

  describe('Goal Decomposition', () => {
    it('should decompose iron_pickaxe into ordered steps', () => {
      const plan = goalDecomp.decomposeGoal('iron_pickaxe');

      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.originalGoal).toBe('iron_pickaxe');

      // Should start with basic tasks (wood gathering)
      const firstSteps = plan.steps.slice(0, 3).map(s => s.id);
      expect(firstSteps).toContain('wood_logs');

      // Should end with the goal itself
      const lastStep = plan.steps[plan.steps.length - 1];
      expect(lastStep.id).toBe('iron_pickaxe');
    });

    it('should skip items already in inventory', () => {
      const fullPlan = goalDecomp.decomposeGoal('iron_pickaxe');
      const withInventory = goalDecomp.decomposeGoal('iron_pickaxe', [
        'wood_logs',
        'planks',
        'sticks',
        'crafting_table',
      ]);

      expect(withInventory.steps.length).toBeLessThan(fullPlan.steps.length);
      expect(withInventory.steps.map(s => s.id)).not.toContain('wood_logs');
    });

    it('should calculate difficulty and time estimates', () => {
      const plan = goalDecomp.decomposeGoal('diamond_pickaxe');

      expect(plan.totalDifficulty).toBeGreaterThan(0);
      expect(plan.estimatedTotalTime).toBeGreaterThan(0);
    });

    it('should include related skills from skill library', () => {
      const plan = goalDecomp.decomposeGoal('iron_ingot');

      // Should find mining and smelting related skills
      expect(plan.suggestedSkills.length).toBeGreaterThan(0);
    });

    it('should handle brewing progression goals', () => {
      const plan = goalDecomp.decomposeGoal('awkward_potion');

      expect(plan.steps.length).toBeGreaterThan(5);
      // Should include nether portal prereq
      expect(plan.steps.some(s => s.id === 'nether_portal')).toBe(true);
      expect(plan.steps.some(s => s.id === 'brewing_stand')).toBe(true);
    });

    it('should handle enchanting progression goals', () => {
      const plan = goalDecomp.decomposeGoal('enchanting_setup');

      expect(plan.steps.length).toBeGreaterThan(10);
      expect(plan.steps.some(s => s.id === 'enchanting_table')).toBe(true);
      expect(plan.steps.some(s => s.id === 'bookshelf')).toBe(true);
    });

    it('should handle combat progression goals', () => {
      const plan = goalDecomp.decomposeGoal('combat_ready_diamond');

      expect(plan.steps.length).toBeGreaterThan(15);
      expect(plan.steps.some(s => s.id === 'diamond_armor_full')).toBe(true);
      expect(plan.steps.some(s => s.id === 'bow')).toBe(true);
    });
  });

  describe('Goal Suggestions', () => {
    it('should suggest starting goals with empty inventory', () => {
      const suggestions = goalDecomp.suggestNextGoals([]);

      expect(suggestions.length).toBeGreaterThan(0);
      // Should suggest easy tasks first
      expect(suggestions[0].difficulty).toBeLessThanOrEqual(2);
      // Should include basic gathering
      const ids = suggestions.map(s => s.id);
      expect(ids.some(id => ['wood_logs', 'wheat_seeds', 'flint', 'sand'].includes(id))).toBe(true);
    });

    it('should suggest advanced goals with developed inventory', () => {
      const inventory = [
        'wood_logs',
        'planks',
        'sticks',
        'crafting_table',
        'wooden_pickaxe',
        'cobblestone',
        'furnace',
        'coal',
        'stone_pickaxe',
      ];
      const suggestions = goalDecomp.suggestNextGoals(inventory, 15);

      // Should suggest goals that require stone pickaxe (iron ore, lapis, copper) or other achievable goals
      const ids = suggestions.map(s => s.id);
      // With stone_pickaxe, iron_ore and other mining goals become achievable
      const hasAdvancedGoals = ids.some(id =>
        id.includes('iron') ||
        id.includes('lapis') ||
        id.includes('copper') ||
        id === 'stone_sword' ||
        id === 'stone_axe' ||
        id === 'torch'
      );
      expect(hasAdvancedGoals).toBe(true);
    });
  });

  describe('Skill Library Integration', () => {
    it('should save and retrieve learned skills', () => {
      const skill = skillLib.saveSkill({
        name: 'efficient_iron_mining',
        description: 'Strip mine at Y level 16 for iron',
        tags: ['mining', 'iron', 'strategy'],
        steps: [
          { tool: 'goToLocation', parameters: { y: 16 } },
          { tool: 'mineResource', parameters: { resource: 'iron_ore', count: 10 } },
          { tool: 'listInventory', parameters: {} },
        ],
        prerequisites: ['stone_pickaxe'],
        outcomes: ['raw_iron'],
        category: 'mining',
      });

      expect(skill.name).toBe('efficient_iron_mining');
      expect(skill.complexity).toBe('composite'); // 3+ steps = composite

      const retrieved = skillLib.getSkill('efficient_iron_mining');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.description).toBe('Strip mine at Y level 16 for iron');
    });

    it('should track skill success rates', () => {
      skillLib.saveSkill({
        name: 'diamond_mining',
        description: 'Mine diamonds',
        tags: ['mining', 'diamond'],
        steps: [{ tool: 'mineResource', parameters: { resource: 'diamond', count: 3 } }],
        prerequisites: ['iron_pickaxe'],
        outcomes: ['diamond'],
      });

      // Simulate usage
      skillLib.recordOutcome('diamond_mining', true);
      skillLib.recordOutcome('diamond_mining', true);
      skillLib.recordOutcome('diamond_mining', false);

      const skill = skillLib.getSkill('diamond_mining');
      expect(skill?.timesUsed).toBe(3);
      expect(skill?.successRate).toBeCloseTo(0.67, 1);
    });

    it('should search skills by relevance', () => {
      skillLib.saveSkill({
        name: 'safe_mining',
        description: 'Mine with water bucket for lava protection',
        tags: ['mining', 'safety'],
        steps: [
          { tool: 'equipItem', parameters: { item: 'water_bucket' } },
          { tool: 'mineResource', parameters: { resource: 'diamond', count: 3 } },
        ],
        prerequisites: ['bucket', 'iron_pickaxe'],
        outcomes: ['diamond'],
      });

      const results = skillLib.searchSkills({ query: 'diamond mining safe' });
      expect(results.some(s => s.name === 'safe_mining')).toBe(true);
    });

    it('should include primitive skills from initialization', () => {
      // These should be pre-loaded
      expect(skillLib.getSkill('mine_wood')).not.toBeNull();
      expect(skillLib.getSkill('craft_planks')).not.toBeNull();
      expect(skillLib.getSkill('mine_iron')).not.toBeNull();
    });
  });

  describe('Reflection System', () => {
    it('should record task outcomes', () => {
      reflection.recordOutcome({
        task: 'mine_iron',
        success: true,
        duration: 120000,
        toolsUsed: ['mineResource'],
        context: { y: 16, biome: 'plains' },
      });

      const outcomes = reflection.getRecentOutcomes(5);
      expect(outcomes.length).toBe(1);
      expect(outcomes[0].task).toBe('mine_iron');
      expect(outcomes[0].success).toBe(true);
    });

    it('should categorize failures', () => {
      reflection.recordOutcome({
        task: 'mine_diamond',
        success: false,
        duration: 60000,
        toolsUsed: ['mineResource'],
        failureReason: 'Killed by creeper explosion',
      });

      const stats = reflection.getStats();
      expect(stats.failuresByCategory['mob_attack']).toBeGreaterThan(0);
    });

    it('should track lessons learned', () => {
      reflection.addLesson({
        task: 'mine_diamond',
        lesson: 'Always bring a shield when mining',
        category: 'safety',
      });

      const lessons = reflection.getLessons();
      expect(lessons.some(l => l.lesson.includes('shield'))).toBe(true);
    });

    it('should generate insights from patterns', () => {
      // Record multiple failures of same type
      for (let i = 0; i < 3; i++) {
        reflection.recordOutcome({
          task: `task_${i}`,
          success: false,
          duration: 30000,
          toolsUsed: ['craftItems'],
          failureReason: 'Missing planks',
        });
      }

      const insights = reflection.getInsights();
      expect(insights.length).toBeGreaterThan(0);
      // Should detect resource pattern
      expect(insights.some(i => i.message.toLowerCase().includes('resource'))).toBe(true);
    });

    it('should calculate success rate correctly', () => {
      reflection.recordOutcome({ task: 'task1', success: true, duration: 1000, toolsUsed: [] });
      reflection.recordOutcome({ task: 'task2', success: true, duration: 1000, toolsUsed: [] });
      reflection.recordOutcome({ task: 'task3', success: false, duration: 1000, toolsUsed: [] });
      reflection.recordOutcome({ task: 'task4', success: true, duration: 1000, toolsUsed: [] });

      const stats = reflection.getStats();
      expect(stats.successRate).toBe(0.75);
    });
  });

  describe('Full Learning Cycle', () => {
    it('should complete a learning cycle: plan -> execute -> reflect -> improve', () => {
      // 1. PLAN: Decompose goal
      const plan = goalDecomp.decomposeGoal('stone_pickaxe');
      expect(plan.steps.length).toBeGreaterThan(0);

      // 2. EXECUTE: Simulate execution (each step)
      for (const step of plan.steps) {
        // Record outcome for each step
        const success = Math.random() > 0.2; // 80% success rate simulation
        reflection.recordOutcome({
          task: step.id,
          success,
          duration: step.estimatedTime * 60000,
          toolsUsed: [step.action],
          context: { category: step.category },
        });
      }

      // 3. REFLECT: Check stats and insights
      const stats = reflection.getStats();
      expect(stats.totalTasks).toBe(plan.steps.length);

      // 4. IMPROVE: Save successful sequence as skill
      const successfulSteps = plan.steps.filter(s => {
        const outcomes = reflection.getRecentOutcomes(100);
        return outcomes.find(o => o.task === s.id)?.success;
      });

      if (successfulSteps.length > 0) {
        skillLib.saveSkill({
          name: 'learned_stone_pickaxe',
          description: 'Stone pickaxe crafting sequence',
          tags: ['crafting', 'stone', 'learned'],
          steps: successfulSteps.map(s => ({
            tool: s.action,
            parameters: { target: s.target, count: s.count },
          })),
          prerequisites: ['wood_logs'],
          outcomes: ['stone_pickaxe'],
        });

        const learned = skillLib.getSkill('learned_stone_pickaxe');
        expect(learned).not.toBeNull();
        expect(learned?.tags).toContain('learned');
      }
    });

    it('should improve skill selection based on success rates', () => {
      // Create two mining skills with different success rates
      skillLib.saveSkill({
        name: 'basic_iron_mining',
        description: 'Basic iron mining',
        tags: ['mining', 'iron'],
        steps: [{ tool: 'mineResource', parameters: { resource: 'iron_ore' } }],
        prerequisites: [],
        outcomes: ['raw_iron'],
      });

      skillLib.saveSkill({
        name: 'advanced_iron_mining',
        description: 'Advanced iron mining with torches',
        tags: ['mining', 'iron'],
        steps: [
          { tool: 'placeItemNear', parameters: { item: 'torch' } },
          { tool: 'mineResource', parameters: { resource: 'iron_ore' } },
        ],
        prerequisites: ['torch'],
        outcomes: ['raw_iron'],
      });

      // Simulate different success rates
      skillLib.recordOutcome('basic_iron_mining', false);
      skillLib.recordOutcome('basic_iron_mining', true);
      skillLib.recordOutcome('basic_iron_mining', false);

      skillLib.recordOutcome('advanced_iron_mining', true);
      skillLib.recordOutcome('advanced_iron_mining', true);
      skillLib.recordOutcome('advanced_iron_mining', true);

      // Search should prioritize higher success rate
      const results = skillLib.searchSkills({
        tags: ['iron', 'mining'],
        sortBy: 'successRate',
      });

      expect(results[0].name).toBe('advanced_iron_mining');
      expect(results[0].successRate).toBeGreaterThan(results[1].successRate);
    });
  });

  describe('Tech Tree Coverage', () => {
    it('should have brewing category nodes', () => {
      const brewingNodes = goalDecomp.getNodesByCategory('brewing');
      expect(brewingNodes.length).toBeGreaterThan(0);
      expect(brewingNodes.some(n => n.id === 'brewing_stand')).toBe(true);
      expect(brewingNodes.some(n => n.id === 'awkward_potion')).toBe(true);
    });

    it('should have enchanting category nodes', () => {
      const enchantingNodes = goalDecomp.getNodesByCategory('enchanting');
      expect(enchantingNodes.length).toBeGreaterThan(0);
      expect(enchantingNodes.some(n => n.id === 'enchanting_table')).toBe(true);
      expect(enchantingNodes.some(n => n.id === 'bookshelf')).toBe(true);
    });

    it('should have exploration category nodes', () => {
      const explorationNodes = goalDecomp.getNodesByCategory('exploration');
      expect(explorationNodes.length).toBeGreaterThan(0);
    });

    it('should have combat nodes with proper progression', () => {
      const combatNodes = goalDecomp.getNodesByCategory('combat');
      expect(combatNodes.length).toBeGreaterThan(5);
      expect(combatNodes.some(n => n.id === 'bow')).toBe(true);
      expect(combatNodes.some(n => n.id === 'combat_ready_diamond')).toBe(true);
    });

    it('should have smelting nodes for all ore types', () => {
      const smeltingNodes = goalDecomp.getNodesByCategory('smelting');
      expect(smeltingNodes.some(n => n.id === 'iron_ingot')).toBe(true);
      expect(smeltingNodes.some(n => n.id === 'gold_ingot')).toBe(true);
      expect(smeltingNodes.some(n => n.id === 'copper_ingot')).toBe(true);
    });

    it('should handle all tech tree categories', () => {
      const categories = goalDecomp.getCategories();
      expect(categories).toContain('gathering');
      expect(categories).toContain('crafting');
      expect(categories).toContain('mining');
      expect(categories).toContain('smelting');
      expect(categories).toContain('combat');
      expect(categories).toContain('farming');
      expect(categories).toContain('brewing');
      expect(categories).toContain('enchanting');
      expect(categories).toContain('nether');
      expect(categories).toContain('exploration');
    });
  });
});
