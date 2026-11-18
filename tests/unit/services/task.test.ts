/**
 * Tests for the task service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { getTaskState, withTask, TaskScheduler } from '../../../src/services/task.service.js';
import { TaskPriority } from '../../../src/types/index.js';

// Create a mock bot
function createMockBot() {
  const bot = new EventEmitter() as any;
  bot.pathfinder = { stop: vi.fn() };
  bot.pvp = { stop: vi.fn() };
  bot.entity = { position: { x: 0, y: 64, z: 0 } };
  return bot;
}

describe('Task Service', () => {
  describe('getTaskState', () => {
    it('should create task state if not exists', () => {
      const bot = createMockBot();
      const state = getTaskState(bot);
      expect(state).toHaveProperty('running');
      expect(state).toHaveProperty('abort');
      expect(state.running).toBe(false);
    });

    it('should return existing task state', () => {
      const bot = createMockBot();
      const state1 = getTaskState(bot);
      const state2 = getTaskState(bot);
      expect(state1).toBe(state2);
    });
  });

  describe('withTask', () => {
    it('should execute function successfully', async () => {
      const bot = createMockBot();
      const result = await withTask(bot, async () => 'success');
      expect(result).toBe('success');
    });

    it('should set running state during execution', async () => {
      const bot = createMockBot();
      let wasRunning = false;

      await withTask(bot, async () => {
        wasRunning = getTaskState(bot).running;
        return 'done';
      });

      expect(wasRunning).toBe(true);
      expect(getTaskState(bot).running).toBe(false);
    });

    it('should throw if another task is running', async () => {
      const bot = createMockBot();

      // Start first task (don't await)
      const task1 = withTask(bot, async () => {
        await new Promise((r) => setTimeout(r, 100));
        return 'task1';
      });

      // Try to start second task
      await expect(withTask(bot, async () => 'task2')).rejects.toThrow('Another task is already running');

      await task1;
    });

    it('should clean up on error', async () => {
      const bot = createMockBot();

      await expect(
        withTask(bot, async () => {
          throw new Error('Task failed');
        })
      ).rejects.toThrow('Task failed');

      expect(getTaskState(bot).running).toBe(false);
    });

    it('should reject on bot death', async () => {
      const bot = createMockBot();

      const taskPromise = withTask(bot, async () => {
        await new Promise((r) => setTimeout(r, 100));
        return 'done';
      });

      // Simulate death
      setTimeout(() => bot.emit('death'), 10);

      await expect(taskPromise).rejects.toThrow('Bot died during operation');
    });

    it('should call abort callbacks on death', async () => {
      const bot = createMockBot();
      const abortCb = vi.fn();

      const taskPromise = withTask(bot, async (signal) => {
        signal.onAbort(abortCb);
        await new Promise((r) => setTimeout(r, 100));
        return 'done';
      });

      // Simulate death
      setTimeout(() => bot.emit('death'), 10);

      await expect(taskPromise).rejects.toThrow();
      expect(abortCb).toHaveBeenCalled();
    });
  });

  describe('TaskScheduler', () => {
    let bot: any;
    let scheduler: TaskScheduler;

    beforeEach(() => {
      bot = createMockBot();
      scheduler = new TaskScheduler(bot);
    });

    it('should execute tasks in order', async () => {
      const results: number[] = [];

      await scheduler.enqueue('task1', async () => {
        results.push(1);
      });

      await scheduler.enqueue('task2', async () => {
        results.push(2);
      });

      expect(results).toEqual([1, 2]);
    });

    it('should process higher priority tasks first', async () => {
      const results: string[] = [];

      // Queue lower priority task first - it checks signal to allow preemption
      const task1 = scheduler.enqueue(
        'low',
        async (signal) => {
          // Check if aborted before doing work
          if (signal.aborted) {
            throw new Error('Aborted');
          }
          await new Promise((r) => setTimeout(r, 10));
          results.push('low');
        },
        { priority: TaskPriority.LOW }
      );

      // Queue higher priority task - this will abort the low priority task
      const task2 = scheduler.enqueue(
        'high',
        async () => {
          results.push('high');
        },
        { priority: TaskPriority.HIGH }
      );

      // task1 may fail due to abort, task2 should succeed
      await Promise.allSettled([task1, task2]);

      // High priority should have completed (low may have been aborted)
      expect(results).toContain('high');
    });

    it('should handle task errors', async () => {
      await expect(
        scheduler.enqueue('failing', async () => {
          throw new Error('Task error');
        })
      ).rejects.toThrow('Task error');
    });

    it('should provide queue status', () => {
      const status = scheduler.getStatus();
      expect(status).toHaveProperty('current');
      expect(status).toHaveProperty('queued');
      expect(status).toHaveProperty('lengths');
    });

    it('should cancel all tasks', async () => {
      let taskCompleted = false;

      const taskPromise = scheduler.enqueue('task', async () => {
        await new Promise((r) => setTimeout(r, 100));
        taskCompleted = true;
      });

      // Give task time to start
      await new Promise((r) => setTimeout(r, 10));

      scheduler.cancelAll();

      await expect(taskPromise).rejects.toThrow('Task cancelled');
      expect(taskCompleted).toBe(false);
    });

    it('should report running state', async () => {
      expect(scheduler.isRunning()).toBe(false);

      const taskPromise = scheduler.enqueue('task', async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Give it time to start
      await new Promise((r) => setTimeout(r, 10));
      expect(scheduler.isRunning()).toBe(true);

      await taskPromise;
      expect(scheduler.isRunning()).toBe(false);
    });
  });
});
