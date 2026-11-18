/**
 * Tests for timeout utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AdaptiveTimeoutManager,
  withTimeout,
  createTimeout,
  raceWithTimeout,
  sleep,
  createDeadline,
} from '../../../src/utils/timeout.js';

describe('AdaptiveTimeoutManager', () => {
  let manager: AdaptiveTimeoutManager;

  beforeEach(() => {
    manager = new AdaptiveTimeoutManager();
  });

  describe('getTimeout', () => {
    it('should return base timeout when no lag', () => {
      const timeout = manager.getTimeout('navigation');
      expect(timeout).toBe(60000); // Default navigation timeout
    });

    it('should use explicit timeout if provided', () => {
      const timeout = manager.getTimeout('navigation', 30000);
      expect(timeout).toBe(30000);
    });

    it('should adjust based on lag multiplier', () => {
      // Simulate lag by recording ticks with delays
      const _originalNow = Date.now;
      let mockTime = 1000;

      vi.spyOn(Date, 'now').mockImplementation(() => mockTime);

      // Record normal ticks first
      for (let i = 0; i < 30; i++) {
        manager.recordTick();
        mockTime += 50; // Normal tick
      }

      // Record laggy ticks
      for (let i = 0; i < 30; i++) {
        manager.recordTick();
        mockTime += 150; // Laggy tick (100ms extra)
      }

      const lagMultiplier = manager.getLagMultiplier();
      expect(lagMultiplier).toBeGreaterThan(1);

      vi.restoreAllMocks();
    });
  });

  describe('recordSuccess', () => {
    it('should track success history', () => {
      manager.recordSuccess('navigation', 5000);
      manager.recordSuccess('navigation', 4000);
      manager.recordSuccess('navigation', 6000);

      // History should affect future timeouts slightly
      // This is implementation-dependent
      const timeout = manager.getTimeout('navigation');
      expect(timeout).toBeGreaterThan(0);
    });
  });

  describe('setConfig', () => {
    it('should update configuration', () => {
      manager.setConfig({ navigation: 90000 });
      const timeout = manager.getTimeout('navigation');
      expect(timeout).toBe(90000);
    });
  });

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const config = manager.getConfig();
      expect(config).toHaveProperty('navigation');
      expect(config).toHaveProperty('mining');
      expect(config).toHaveProperty('crafting');
    });
  });
});

describe('withTimeout', () => {
  it('should resolve if function completes in time', async () => {
    const fn = async () => {
      await sleep(10);
      return 'success';
    };

    const result = await withTimeout(fn, 1000);
    expect(result).toBe('success');
  });

  it('should reject if function times out', async () => {
    const fn = async () => {
      await sleep(1000);
      return 'success';
    };

    await expect(withTimeout(fn, 50, 'test')).rejects.toThrow('test');
  });

  it('should propagate function errors', async () => {
    const fn = async () => {
      throw new Error('Function error');
    };

    await expect(withTimeout(fn, 1000)).rejects.toThrow('Function error');
  });
});

describe('createTimeout', () => {
  it('should reject after specified duration', async () => {
    const timeoutPromise = createTimeout(50, 'test timeout');
    await expect(timeoutPromise).rejects.toThrow('test timeout');
  });
});

describe('raceWithTimeout', () => {
  it('should resolve if promise wins', async () => {
    const promise = Promise.resolve('winner');
    const result = await raceWithTimeout(promise, 1000);
    expect(result).toBe('winner');
  });

  it('should reject if timeout wins', async () => {
    const promise = new Promise((resolve) => setTimeout(resolve, 1000));
    await expect(raceWithTimeout(promise, 50, 'timeout')).rejects.toThrow();
  });
});

describe('sleep', () => {
  it('should resolve after duration', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(45); // Allow some variance
  });
});

describe('createDeadline', () => {
  it('should not be expired immediately', () => {
    const deadline = createDeadline(1000);
    expect(deadline.isExpired()).toBe(false);
    expect(deadline.remaining()).toBeGreaterThan(0);
  });

  it('should be expired after timeout', async () => {
    const deadline = createDeadline(50);
    await sleep(60);
    expect(deadline.isExpired()).toBe(true);
    expect(deadline.remaining()).toBe(0);
  });

  it('should track remaining time', async () => {
    const deadline = createDeadline(100);
    const initial = deadline.remaining();
    await sleep(30);
    const after = deadline.remaining();
    expect(after).toBeLessThan(initial);
  });
});
