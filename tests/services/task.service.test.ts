/**
 * Tests for task service
 */

import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import {
  getTaskState,
  TaskInterruptedError,
  TaskStalledError,
} from '../../src/services/task.service.js';

// Mock bot for testing
function createMockBot() {
  const emitter = new EventEmitter();

  return {
    ...emitter,
    entity: {
      position: { x: 0, y: 64, z: 0, floored: () => ({ x: 0, y: 64, z: 0 }) },
    },
    health: 20,
    food: 20,
    inventory: {
      items: () => [],
      slots: {},
    },
    heldItem: null,
    pathfinder: {
      stop: vi.fn(),
    },
    pvp: {
      stop: vi.fn(),
    },
  } as any;
}

describe('Task Service', () => {
  describe('getTaskState', () => {
    it('should create task state if not exists', () => {
      const bot = createMockBot();
      const state = getTaskState(bot);

      expect(state).toBeDefined();
      expect(state.running).toBe(false);
      expect(state.abort).toBeNull();
    });

    it('should return same state on subsequent calls', () => {
      const bot = createMockBot();
      const state1 = getTaskState(bot);
      const state2 = getTaskState(bot);

      expect(state1).toBe(state2);
    });
  });

  describe('TaskInterruptedError', () => {
    it('should create with interrupt condition', () => {
      const condition = {
        name: 'damage_taken',
        priority: 'critical' as const,
        message: 'Bot took damage',
        data: { damage: 5 },
      };

      const error = new TaskInterruptedError(condition);

      expect(error.name).toBe('TaskInterruptedError');
      expect(error.condition).toBe(condition);
      expect(error.message).toContain('Bot took damage');
    });

    it('should use custom message if provided', () => {
      const condition = {
        name: 'test',
        priority: 'high' as const,
        message: 'Default message',
      };

      const error = new TaskInterruptedError(condition, 'Custom message');

      expect(error.message).toBe('Custom message');
    });
  });

  describe('TaskStalledError', () => {
    it('should create with stall duration', () => {
      const error = new TaskStalledError(15000);

      expect(error.name).toBe('TaskStalledError');
      expect(error.stallDurationMs).toBe(15000);
      expect(error.message).toContain('15');
    });

    it('should use custom message if provided', () => {
      const error = new TaskStalledError(10000, 'Custom stall message');

      expect(error.message).toBe('Custom stall message');
    });
  });
});
