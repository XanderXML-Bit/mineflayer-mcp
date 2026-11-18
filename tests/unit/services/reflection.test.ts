/**
 * Tests for reflection.service.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ReflectionService } from '../../../src/services/reflection.service.js';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('ReflectionService', () => {
  // Each test owns a fresh temporary directory, so parallel suites never share files.
  let testDir: string;
  let testFilePath: string;
  let service: ReflectionService;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'mc-mcp-reflection-'));
    testFilePath = join(testDir, 'test-reflections.json');
    service = new ReflectionService(testFilePath);
  });

  afterEach(async () => {
    await service.shutdown();
    rmSync(testDir, { recursive: true });
  });

  describe('recordOutcome', () => {
    it('should record a successful outcome', () => {
      const outcome = service.recordOutcome({
        task: 'mine_wood',
        success: true,
        duration: 5000,
        toolsUsed: ['mineResource'],
        context: {},
      });

      expect(outcome.id).toBeDefined();
      expect(outcome.timestamp).toBeDefined();
      expect(outcome.success).toBe(true);
    });

    it('should record a failed outcome with categorization', () => {
      const outcome = service.recordOutcome({
        task: 'craft_pickaxe',
        success: false,
        duration: 2000,
        toolsUsed: ['craftItems'],
        failureReason: "Don't have enough planks",
        context: {},
      });

      expect(outcome.success).toBe(false);
      expect(outcome.failureCategory).toBe('resource_missing');
    });

    it('should extract lessons from failed outcomes', () => {
      service.recordOutcome({
        task: 'mine_diamond',
        success: false,
        duration: 60000,
        toolsUsed: ['mineResource'],
        failureReason: 'Fell into lava',
        lessonsLearned: ['Always carry water bucket when mining at low Y levels'],
        context: {},
      });

      const lessons = service.getLessons();
      expect(lessons).toContain('Always carry water bucket when mining at low Y levels');
    });
  });

  describe('categorizeFailure', () => {
    const testCases: Array<{ reason: string; expected: string }> = [
      { reason: 'Inventory is full', expected: 'inventory_full' },
      { reason: "Don't have required materials", expected: 'resource_missing' },
      { reason: 'Tool broke during mining', expected: 'tool_broken' },
      { reason: 'Killed by a creeper', expected: 'mob_attack' },
      { reason: 'Fell into lava', expected: 'environmental' },
      { reason: "Couldn't find path to destination", expected: 'navigation_failed' },
      { reason: 'Task timed out', expected: 'timeout' },
      { reason: 'Block not found nearby', expected: 'target_not_found' },
      { reason: 'Protected spawn area', expected: 'permission_denied' },
      { reason: 'Something went wrong', expected: 'unknown' },
    ];

    for (const { reason, expected } of testCases) {
      it(`should categorize "${reason}" as ${expected}`, () => {
        const outcome = service.recordOutcome({
          task: 'test_task',
          success: false,
          duration: 1000,
          toolsUsed: [],
          failureReason: reason,
          context: {},
        });

        expect(outcome.failureCategory).toBe(expected);
      });
    }
  });

  describe('getRecentOutcomes', () => {
    it('should return recent outcomes', () => {
      service.recordOutcome({
        task: 'task1',
        success: true,
        duration: 1000,
        toolsUsed: [],
        context: {},
      });
      service.recordOutcome({
        task: 'task2',
        success: false,
        duration: 2000,
        toolsUsed: [],
        context: {},
      });

      const recent = service.getRecentOutcomes(10);
      expect(recent.length).toBe(2);
      expect(recent[0].task).toBe('task2'); // Most recent first
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        service.recordOutcome({
          task: `task${i}`,
          success: true,
          duration: 1000,
          toolsUsed: [],
          context: {},
        });
      }

      const recent = service.getRecentOutcomes(3);
      expect(recent.length).toBe(3);
    });
  });

  describe('getOutcomesForTask', () => {
    it('should filter outcomes by task name', () => {
      service.recordOutcome({
        task: 'mine_wood',
        success: true,
        duration: 1000,
        toolsUsed: [],
        context: {},
      });
      service.recordOutcome({
        task: 'mine_stone',
        success: true,
        duration: 2000,
        toolsUsed: [],
        context: {},
      });
      service.recordOutcome({
        task: 'craft_planks',
        success: true,
        duration: 500,
        toolsUsed: [],
        context: {},
      });

      const mineOutcomes = service.getOutcomesForTask('mine');
      expect(mineOutcomes.length).toBe(2);
    });
  });

  describe('getStats', () => {
    it('should calculate success rate correctly', () => {
      service.recordOutcome({
        task: 'task1',
        success: true,
        duration: 1000,
        toolsUsed: [],
        context: {},
      });
      service.recordOutcome({
        task: 'task2',
        success: true,
        duration: 1000,
        toolsUsed: [],
        context: {},
      });
      service.recordOutcome({
        task: 'task3',
        success: false,
        duration: 1000,
        toolsUsed: [],
        context: {},
      });
      service.recordOutcome({
        task: 'task4',
        success: true,
        duration: 1000,
        toolsUsed: [],
        context: {},
      });

      const stats = service.getStats();
      expect(stats.totalTasks).toBe(4);
      expect(stats.successCount).toBe(3);
      expect(stats.failureCount).toBe(1);
      expect(stats.successRate).toBe(0.75);
    });

    it('should count tool usage', () => {
      service.recordOutcome({
        task: 'task1',
        success: true,
        duration: 1000,
        toolsUsed: ['goToLocation', 'mineResource'],
        context: {},
      });
      service.recordOutcome({
        task: 'task2',
        success: true,
        duration: 1000,
        toolsUsed: ['mineResource', 'craftItems'],
        context: {},
      });

      const stats = service.getStats();
      const mineResourceUsage = stats.mostUsedTools.find((t) => t.tool === 'mineResource');
      expect(mineResourceUsage?.count).toBe(2);
    });

    it('should track failure categories', () => {
      service.recordOutcome({
        task: 'task1',
        success: false,
        duration: 1000,
        toolsUsed: [],
        failureReason: 'Inventory full',
        context: {},
      });
      service.recordOutcome({
        task: 'task2',
        success: false,
        duration: 1000,
        toolsUsed: [],
        failureReason: 'Inventory has no space',
        context: {},
      });

      const stats = service.getStats();
      expect(stats.failuresByCategory.inventory_full).toBe(2);
    });

    it('should identify most failed tasks', () => {
      // Add multiple outcomes for same task
      service.recordOutcome({ task: 'hard_task', success: false, duration: 1000, toolsUsed: [], context: {} });
      service.recordOutcome({ task: 'hard_task', success: false, duration: 1000, toolsUsed: [], context: {} });
      service.recordOutcome({ task: 'hard_task', success: true, duration: 1000, toolsUsed: [], context: {} });
      service.recordOutcome({ task: 'easy_task', success: true, duration: 1000, toolsUsed: [], context: {} });
      service.recordOutcome({ task: 'easy_task', success: true, duration: 1000, toolsUsed: [], context: {} });

      const stats = service.getStats();
      const hardTask = stats.mostFailedTasks.find((t) => t.task === 'hard_task');
      expect(hardTask).toBeDefined();
      expect(hardTask?.failureRate).toBeCloseTo(0.667, 2);
    });
  });

  describe('getInsights', () => {
    it('should warn about low success rate', () => {
      // Add 5 failures and 2 successes
      for (let i = 0; i < 5; i++) {
        service.recordOutcome({ task: 'task', success: false, duration: 1000, toolsUsed: [], context: {} });
      }
      for (let i = 0; i < 2; i++) {
        service.recordOutcome({ task: 'task', success: true, duration: 1000, toolsUsed: [], context: {} });
      }

      const insights = service.getInsights();
      const lowSuccessWarning = insights.find(
        (i) => i.type === 'warning' && i.message.includes('success rate is low')
      );
      expect(lowSuccessWarning).toBeDefined();
    });

    it('should identify resource missing pattern', () => {
      // Add 3 resource-related failures
      for (let i = 0; i < 3; i++) {
        service.recordOutcome({
          task: `task${i}`,
          success: false,
          duration: 1000,
          toolsUsed: [],
          failureReason: "Don't have enough materials",
          context: {},
        });
      }

      const insights = service.getInsights();
      const resourcePattern = insights.find(
        (i) => i.type === 'pattern' && i.message.includes('missing resources')
      );
      expect(resourcePattern).toBeDefined();
    });

    it('should suggest tips for tool breakage', () => {
      // Add 2 tool breakage failures
      service.recordOutcome({
        task: 'mine1',
        success: false,
        duration: 1000,
        toolsUsed: [],
        failureReason: 'Pickaxe broke',
        context: {},
      });
      service.recordOutcome({
        task: 'mine2',
        success: false,
        duration: 1000,
        toolsUsed: [],
        failureReason: 'Tool durability ran out',
        context: {},
      });

      const insights = service.getInsights();
      const toolTip = insights.find(
        (i) => i.type === 'tip' && i.message.includes('durability')
      );
      expect(toolTip).toBeDefined();
    });
  });

  describe('lessons', () => {
    it('should add lessons manually', () => {
      service.addLesson('Always check inventory before crafting');

      const lessons = service.getLessons();
      expect(lessons).toContain('Always check inventory before crafting');
    });

    it('should not duplicate lessons', () => {
      service.addLesson('Test lesson');
      service.addLesson('Test lesson');

      const lessons = service.getLessons();
      const count = lessons.filter((l) => l === 'Test lesson').length;
      expect(count).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear all data', () => {
      service.recordOutcome({
        task: 'task1',
        success: true,
        duration: 1000,
        toolsUsed: [],
        context: {},
      });
      service.addLesson('Test lesson');

      service.clear();

      expect(service.getRecentOutcomes().length).toBe(0);
      expect(service.getLessons().length).toBe(0);
    });
  });
});
