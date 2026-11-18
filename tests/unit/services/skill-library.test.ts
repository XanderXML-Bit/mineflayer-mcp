/**
 * Tests for skill-library.service.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SkillLibraryService } from '../../../src/services/skill-library.service.js';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('SkillLibraryService', () => {
  // Each test owns a fresh temporary directory, so parallel suites never share files.
  let testDir: string;
  let testFilePath: string;
  let service: SkillLibraryService;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'mc-mcp-skills-'));
    testFilePath = join(testDir, 'test-skills.json');
    service = new SkillLibraryService(testFilePath);
  });

  afterEach(async () => {
    await service.shutdown();
    rmSync(testDir, { recursive: true });
  });

  describe('initialization', () => {
    it('should initialize with primitive skills', () => {
      const stats = service.getStats();
      expect(stats.totalSkills).toBeGreaterThan(0);
      expect(stats.primitiveCount).toBeGreaterThan(0);
    });

    it('should have basic mining skills', () => {
      const skill = service.getSkill('mine_wood');
      expect(skill).not.toBeNull();
      expect(skill?.complexity).toBe('primitive');
      expect(skill?.tags).toContain('mining');
    });

    it('should have basic crafting skills', () => {
      const skill = service.getSkill('craft_planks');
      expect(skill).not.toBeNull();
      expect(skill?.steps.length).toBeGreaterThan(0);
    });
  });

  describe('saveSkill', () => {
    it('should save a new skill', () => {
      const skill = service.saveSkill({
        name: 'test_skill',
        description: 'A test skill for unit testing',
        tags: ['test', 'unit'],
        steps: [
          { tool: 'testTool', parameters: { foo: 'bar' } },
        ],
        prerequisites: ['item1'],
        outcomes: ['result1'],
      });

      expect(skill.name).toBe('test_skill');
      expect(skill.complexity).toBe('primitive'); // 1 step = primitive
      expect(skill.successRate).toBe(0.5); // Default for new skills
      expect(skill.timesUsed).toBe(0);
    });

    it('should mark multi-step skills as composite', () => {
      const skill = service.saveSkill({
        name: 'composite_skill',
        description: 'A composite skill with multiple steps',
        tags: ['test'],
        steps: [
          { tool: 'step1', parameters: {} },
          { tool: 'step2', parameters: {} },
          { tool: 'step3', parameters: {} },
        ],
        prerequisites: [],
        outcomes: [],
      });

      expect(skill.complexity).toBe('composite');
    });

    it('should update existing skill', () => {
      service.saveSkill({
        name: 'update_test',
        description: 'Original description',
        tags: ['original'],
        steps: [{ tool: 'tool1', parameters: {} }],
        prerequisites: [],
        outcomes: [],
      });

      const updated = service.saveSkill({
        name: 'update_test',
        description: 'Updated description',
        tags: ['updated'],
        steps: [{ tool: 'tool2', parameters: {} }],
        prerequisites: [],
        outcomes: [],
      });

      expect(updated.description).toBe('Updated description');
      expect(updated.tags).toContain('updated');
    });
  });

  describe('getSkill', () => {
    it('should return skill by name', () => {
      service.saveSkill({
        name: 'get_test',
        description: 'Test skill',
        tags: ['test'],
        steps: [{ tool: 'tool1', parameters: {} }],
        prerequisites: [],
        outcomes: [],
      });

      const skill = service.getSkill('get_test');
      expect(skill).not.toBeNull();
      expect(skill?.name).toBe('get_test');
    });

    it('should return null for non-existent skill', () => {
      const skill = service.getSkill('non_existent_skill');
      expect(skill).toBeNull();
    });
  });

  describe('searchSkills', () => {
    beforeEach(() => {
      // Add test skills
      service.saveSkill({
        name: 'search_mining',
        description: 'Mining related skill',
        tags: ['mining', 'resource'],
        steps: [{ tool: 'mine', parameters: {} }],
        prerequisites: [],
        outcomes: ['ore'],
        category: 'gathering',
      });

      service.saveSkill({
        name: 'search_crafting',
        description: 'Crafting related skill',
        tags: ['crafting', 'tools'],
        steps: [{ tool: 'craft', parameters: {} }],
        prerequisites: [],
        outcomes: ['tool'],
        category: 'crafting',
      });
    });

    it('should search by query', () => {
      const results = service.searchSkills({ query: 'mining' });
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(s => s.name === 'search_mining')).toBe(true);
    });

    it('should search by tags', () => {
      const results = service.searchSkills({ tags: ['crafting'] });
      expect(results.some(s => s.name === 'search_crafting')).toBe(true);
    });

    it('should filter by category', () => {
      const results = service.searchSkills({ category: 'gathering' });
      expect(results.every(s => s.category === 'gathering')).toBe(true);
    });

    it('should filter by minimum success rate', () => {
      // Record some successes to increase rate
      service.recordOutcome('search_mining', true);
      service.recordOutcome('search_mining', true);
      service.recordOutcome('search_crafting', false);

      const results = service.searchSkills({ minSuccessRate: 0.6 });
      expect(results.some(s => s.name === 'search_mining')).toBe(true);
    });

    it('should limit results', () => {
      const results = service.searchSkills({ limit: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should sort by success rate', () => {
      service.recordOutcome('search_mining', true);
      service.recordOutcome('search_mining', true);

      const results = service.searchSkills({ sortBy: 'successRate' });
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].successRate).toBeGreaterThanOrEqual(results[i].successRate);
      }
    });
  });

  describe('recordOutcome', () => {
    it('should record successful outcome', () => {
      const _skill = service.saveSkill({
        name: 'outcome_test',
        description: 'Test',
        tags: ['test'],
        steps: [{ tool: 'tool1', parameters: {} }],
        prerequisites: [],
        outcomes: [],
      });

      service.recordOutcome('outcome_test', true);
      const updated = service.getSkill('outcome_test');

      expect(updated?.timesUsed).toBe(1);
      expect(updated?.timesSucceeded).toBe(1);
      expect(updated?.successRate).toBe(1);
    });

    it('should record failed outcome', () => {
      service.saveSkill({
        name: 'fail_test',
        description: 'Test',
        tags: ['test'],
        steps: [{ tool: 'tool1', parameters: {} }],
        prerequisites: [],
        outcomes: [],
      });

      service.recordOutcome('fail_test', false);
      const updated = service.getSkill('fail_test');

      expect(updated?.timesUsed).toBe(1);
      expect(updated?.timesSucceeded).toBe(0);
      expect(updated?.successRate).toBe(0);
    });

    it('should calculate correct success rate', () => {
      service.saveSkill({
        name: 'rate_test',
        description: 'Test',
        tags: ['test'],
        steps: [{ tool: 'tool1', parameters: {} }],
        prerequisites: [],
        outcomes: [],
      });

      service.recordOutcome('rate_test', true);
      service.recordOutcome('rate_test', true);
      service.recordOutcome('rate_test', false);
      service.recordOutcome('rate_test', true);

      const skill = service.getSkill('rate_test');
      expect(skill?.timesUsed).toBe(4);
      expect(skill?.timesSucceeded).toBe(3);
      expect(skill?.successRate).toBe(0.75);
    });

    it('should return false for non-existent skill', () => {
      const result = service.recordOutcome('non_existent', true);
      expect(result).toBe(false);
    });
  });

  describe('deleteSkill', () => {
    it('should delete existing skill', () => {
      service.saveSkill({
        name: 'delete_test',
        description: 'Test',
        tags: ['test'],
        steps: [{ tool: 'tool1', parameters: {} }],
        prerequisites: [],
        outcomes: [],
      });

      const result = service.deleteSkill('delete_test');
      expect(result).toBe(true);
      expect(service.getSkill('delete_test')).toBeNull();
    });

    it('should return false for non-existent skill', () => {
      const result = service.deleteSkill('non_existent');
      expect(result).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const initialStats = service.getStats();
      const initialCount = initialStats.totalSkills;

      service.saveSkill({
        name: 'stats_primitive',
        description: 'Test',
        tags: ['test'],
        steps: [{ tool: 'tool1', parameters: {} }],
        prerequisites: [],
        outcomes: [],
      });

      service.saveSkill({
        name: 'stats_composite',
        description: 'Test',
        tags: ['test'],
        steps: [
          { tool: 'tool1', parameters: {} },
          { tool: 'tool2', parameters: {} },
          { tool: 'tool3', parameters: {} },
        ],
        prerequisites: [],
        outcomes: [],
        category: 'test_category',
      });

      const stats = service.getStats();
      expect(stats.totalSkills).toBe(initialCount + 2);
      expect(stats.categories).toContain('test_category');
    });

    it('should track most used skills', () => {
      service.saveSkill({
        name: 'most_used',
        description: 'Test',
        tags: ['test'],
        steps: [{ tool: 'tool1', parameters: {} }],
        prerequisites: [],
        outcomes: [],
      });

      service.recordOutcome('most_used', true);
      service.recordOutcome('most_used', true);
      service.recordOutcome('most_used', true);

      const stats = service.getStats();
      expect(stats.mostUsed).toContain('most_used');
    });
  });

  describe('getAllSkills', () => {
    it('should return all skills', () => {
      const skills = service.getAllSkills();
      expect(Array.isArray(skills)).toBe(true);
      expect(skills.length).toBe(service.getStats().totalSkills);
    });
  });

  describe('getCategories', () => {
    it('should return all categories', () => {
      service.saveSkill({
        name: 'cat_test',
        description: 'Test',
        tags: ['test'],
        steps: [{ tool: 'tool1', parameters: {} }],
        prerequisites: [],
        outcomes: [],
        category: 'unique_category',
      });

      const categories = service.getCategories();
      expect(categories).toContain('unique_category');
    });
  });
});
