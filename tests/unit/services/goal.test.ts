/**
 * Goal Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  addGoal,
  getGoal,
  updateGoal,
  completeGoal,
  failGoal,
  pauseGoal,
  resumeGoal,
  deleteGoal,
  getActiveGoals,
  getPendingGoals,
  getGoalHistory,
  getGoalStats,
  clearAllGoals,
} from '../../../src/services/goal.service.js';
import { shutdownMemoryService, getMemoryService } from '../../../src/services/memory.service.js';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('GoalService', () => {
  // Seed the memory singleton with an owned temporary directory instead of the default ./data path.
  let memoryDir: string;

  beforeEach(() => {
    shutdownMemoryService();
    memoryDir = mkdtempSync(join(tmpdir(), 'mc-mcp-goal-'));
    getMemoryService(memoryDir);
    clearAllGoals();
  });

  afterEach(() => {
    clearAllGoals();
    shutdownMemoryService();
    rmSync(memoryDir, { recursive: true });
  });

  describe('addGoal', () => {
    it('should create a new goal', () => {
      const goal = addGoal('Mine 64 diamonds');

      expect(goal.id).toBeDefined();
      expect(goal.description).toBe('Mine 64 diamonds');
      expect(goal.status).toBe('active');
      expect(goal.priority).toBe('normal');
      expect(goal.progress).toBe(0);
    });

    it('should create goal with custom priority', () => {
      const goal = addGoal('Urgent task', 'critical');
      expect(goal.priority).toBe('critical');
    });

    it('should create goal with context', () => {
      const goal = addGoal('Build house', 'normal', { location: { x: 0, y: 64, z: 0 } });
      expect(goal.context).toEqual({ location: { x: 0, y: 64, z: 0 } });
    });

    it('should start with empty subgoals', () => {
      const goal = addGoal('Complete project', 'normal');
      expect(goal.subgoals).toEqual([]);
    });
  });

  describe('getGoal', () => {
    it('should retrieve a goal by ID', () => {
      const created = addGoal('Test goal');
      const retrieved = getGoal(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.description).toBe('Test goal');
    });

    it('should return null for non-existent ID', () => {
      const goal = getGoal('non-existent');
      expect(goal).toBeNull();
    });
  });

  describe('updateGoal', () => {
    it('should update progress', () => {
      const goal = addGoal('Mining goal');
      const updated = updateGoal(goal.id, { progress: 50 });

      expect(updated?.progress).toBe(50);
    });

    it('should update description', () => {
      const goal = addGoal('Old description');
      const updated = updateGoal(goal.id, { description: 'New description' });

      expect(updated?.description).toBe('New description');
    });

    it('should add subgoals', () => {
      const goal = addGoal('Main goal');
      const updated = updateGoal(goal.id, { subgoals: ['Sub 1', 'Sub 2'] });

      expect(updated?.subgoals).toEqual(['Sub 1', 'Sub 2']);
    });

    it('should return null for non-existent goal', () => {
      const result = updateGoal('fake-id', { progress: 50 });
      expect(result).toBeNull();
    });
  });

  describe('completeGoal', () => {
    it('should mark goal as completed', () => {
      const goal = addGoal('Complete me');
      const completed = completeGoal(goal.id);

      expect(completed?.status).toBe('completed');
      expect(completed?.progress).toBe(100);
    });

    it('should return null for non-existent goal', () => {
      const result = completeGoal('fake-id');
      expect(result).toBeNull();
    });
  });

  describe('failGoal', () => {
    it('should mark goal as failed', () => {
      const goal = addGoal('Will fail');
      const failed = failGoal(goal.id, 'Ran out of resources');

      expect(failed?.status).toBe('failed');
    });
  });

  describe('pauseGoal and resumeGoal', () => {
    it('should pause and resume goal', () => {
      const goal = addGoal('Pausable goal');

      const paused = pauseGoal(goal.id);
      expect(paused?.status).toBe('paused');

      const resumed = resumeGoal(goal.id);
      expect(resumed?.status).toBe('active');
    });
  });

  describe('deleteGoal', () => {
    it('should delete a goal', () => {
      const goal = addGoal('Delete me');
      const result = deleteGoal(goal.id);

      expect(result).toBe(true);
      expect(getGoal(goal.id)).toBeNull();
    });

    it('should return false for non-existent goal', () => {
      const result = deleteGoal('fake-id');
      expect(result).toBe(false);
    });
  });

  describe('getActiveGoals', () => {
    it('should return only active goals', () => {
      addGoal('Active 1');
      addGoal('Active 2');
      const goal3 = addGoal('Will complete');
      completeGoal(goal3.id);

      const active = getActiveGoals();
      expect(active.length).toBe(2);
      expect(active.every((g) => g.status === 'active')).toBe(true);
    });
  });

  describe('getPendingGoals', () => {
    it('should return active and paused goals', () => {
      addGoal('Active');
      const paused = addGoal('Paused');
      pauseGoal(paused.id);
      const completed = addGoal('Completed');
      completeGoal(completed.id);

      const pending = getPendingGoals();
      expect(pending.length).toBe(2);
    });
  });

  describe('getGoalHistory', () => {
    it('should return completed and failed goals', () => {
      addGoal('Active');
      const completed = addGoal('Completed');
      completeGoal(completed.id);
      const failed = addGoal('Failed');
      failGoal(failed.id);

      const history = getGoalHistory();
      expect(history.length).toBe(2);
    });
  });

  describe('getGoalStats', () => {
    it('should return correct statistics', () => {
      addGoal('Active 1');
      addGoal('Active 2');
      const completed = addGoal('Completed');
      completeGoal(completed.id);
      const failed = addGoal('Failed');
      failGoal(failed.id);

      const stats = getGoalStats();
      expect(stats.activeCount).toBe(2);
      expect(stats.completedCount).toBe(1);
      expect(stats.failedCount).toBe(1);
    });
  });
});
