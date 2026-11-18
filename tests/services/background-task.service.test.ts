/**
 * Background Task Service Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  backgroundTaskManager,
} from '../../src/services/background-task.service.js';

describe('BackgroundTaskManager', () => {
  beforeEach(() => {
    // Clean up any existing tasks
    backgroundTaskManager.cleanup(0);
  });

  describe('startTask', () => {
    it('should create a task and return a task ID', async () => {
      const taskId = await backgroundTaskManager.startTask(
        'test-task',
        'TestBot',
        async () => 'result'
      );

      expect(taskId).toMatch(/^task_\d+_\d+$/);
    });

    it('should execute the task and store the result', async () => {
      const taskId = await backgroundTaskManager.startTask(
        'test-task',
        'TestBot',
        async () => ({ success: true, data: 42 })
      );

      // Wait for task to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const task = backgroundTaskManager.getTask(taskId);
      expect(task).toBeDefined();
      expect(task?.status).toBe('completed');
      expect(task?.result).toEqual({ success: true, data: 42 });
    });

    it('should track progress updates', async () => {
      const progressUpdates: number[] = [];

      const taskId = await backgroundTaskManager.startTask(
        'progress-task',
        'TestBot',
        async (_signal, updateProgress) => {
          updateProgress({ percent: 25, message: 'Starting' });
          await new Promise(r => setTimeout(r, 10));
          updateProgress({ percent: 50, message: 'Halfway' });
          await new Promise(r => setTimeout(r, 10));
          updateProgress({ percent: 75, message: 'Almost done' });
          return 'done';
        }
      );

      // Listen for progress events
      backgroundTaskManager.on('task:progress', (task) => {
        if (task.id === taskId) {
          progressUpdates.push(task.progress.percent);
        }
      });

      // Wait for task to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(progressUpdates).toContain(25);
      expect(progressUpdates).toContain(50);
      expect(progressUpdates).toContain(75);
    });

    it('should handle task failures', async () => {
      const taskId = await backgroundTaskManager.startTask(
        'failing-task',
        'TestBot',
        async () => {
          throw new Error('Task failed intentionally');
        }
      );

      // Wait for task to fail
      await new Promise(resolve => setTimeout(resolve, 100));

      const task = backgroundTaskManager.getTask(taskId);
      expect(task?.status).toBe('failed');
      expect(task?.error).toBe('Task failed intentionally');
    });
  });

  describe('cancelTask', () => {
    it('should cancel a running task', async () => {
      let wasCancelled = false;

      const taskId = await backgroundTaskManager.startTask(
        'cancellable-task',
        'TestBot',
        async (signal) => {
          while (!signal.aborted) {
            await new Promise(r => setTimeout(r, 10));
          }
          wasCancelled = true;
          throw new Error('Cancelled');
        }
      );

      // Wait for task to start
      await new Promise(resolve => setTimeout(resolve, 50));

      const success = backgroundTaskManager.cancelTask(taskId);
      expect(success).toBe(true);

      // Wait for cancellation to process
      await new Promise(resolve => setTimeout(resolve, 100));

      const task = backgroundTaskManager.getTask(taskId);
      expect(task?.status).toBe('cancelled');
      expect(wasCancelled).toBe(true);
    });

    it('should return false for non-existent task', () => {
      const success = backgroundTaskManager.cancelTask('non-existent-id');
      expect(success).toBe(false);
    });
  });

  describe('getTasksForBot', () => {
    it('should return only tasks for the specified bot', async () => {
      await backgroundTaskManager.startTask('task1', 'Bot1', async () => 1);
      await backgroundTaskManager.startTask('task2', 'Bot2', async () => 2);
      await backgroundTaskManager.startTask('task3', 'Bot1', async () => 3);

      // Wait for tasks to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const bot1Tasks = backgroundTaskManager.getTasksForBot('Bot1');
      expect(bot1Tasks.length).toBe(2);
      expect(bot1Tasks.every(t => t.botUsername === 'Bot1')).toBe(true);
    });
  });

  describe('getRunningTasks', () => {
    it('should return only running and pending tasks', async () => {
      // Create a long-running task
      backgroundTaskManager.startTask(
        'long-task',
        'TestBot',
        async () => {
          await new Promise(r => setTimeout(r, 500));
          return 'done';
        }
      );

      // Create a quick task
      await backgroundTaskManager.startTask('quick-task', 'TestBot', async () => 'quick');

      // Wait for quick task to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const runningTasks = backgroundTaskManager.getRunningTasks();
      expect(runningTasks.some(t => t.name === 'long-task')).toBe(true);
      expect(runningTasks.some(t => t.name === 'quick-task')).toBe(false);
    });
  });

  describe('getTaskSummary', () => {
    it('should return correct task counts', async () => {
      // Create various tasks
      await backgroundTaskManager.startTask('success1', 'TestBot', async () => 1);
      await backgroundTaskManager.startTask('success2', 'TestBot', async () => 2);
      await backgroundTaskManager.startTask('fail', 'TestBot', async () => {
        throw new Error('fail');
      });

      // Wait for tasks to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const summary = backgroundTaskManager.getTaskSummary('TestBot');
      expect(summary.completed).toBeGreaterThanOrEqual(2);
      expect(summary.failed).toBeGreaterThanOrEqual(1);
    });
  });

  describe('cleanup', () => {
    it('should remove old completed tasks', async () => {
      await backgroundTaskManager.startTask('old-task', 'TestBot', async () => 'done');

      // Wait for task to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const beforeCleanup = backgroundTaskManager.getAllTasks().length;

      // Cleanup with 0 maxAge (removes all completed)
      const cleaned = backgroundTaskManager.cleanup(0);

      const afterCleanup = backgroundTaskManager.getAllTasks().length;

      expect(cleaned).toBeGreaterThan(0);
      expect(afterCleanup).toBeLessThan(beforeCleanup);
    });
  });
});
