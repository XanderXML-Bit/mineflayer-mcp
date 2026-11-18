/**
 * Death Recovery Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  recordDeath,
  getLastDeath,
  markRecovered,
  getDeathHistory,
  getDeathStats,
  itemsLikelyAvailable,
  incrementRecoveryAttempts,
  clearDeathHistory,
} from '../../../src/services/death-recovery.service.js';
import { shutdownMemoryService, getMemoryService } from '../../../src/services/memory.service.js';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Mock bot
const createMockBot = (position = { x: 100, y: 64, z: -50 }) => ({
  entity: { position },
  game: { dimension: 'overworld' },
});

describe('DeathRecoveryService', () => {
  // Seed the memory singleton with an owned temporary directory instead of the default ./data path.
  let memoryDir: string;

  beforeEach(() => {
    shutdownMemoryService();
    memoryDir = mkdtempSync(join(tmpdir(), 'mc-mcp-death-'));
    getMemoryService(memoryDir);
    clearDeathHistory();
  });

  afterEach(() => {
    clearDeathHistory();
    shutdownMemoryService();
    rmSync(memoryDir, { recursive: true });
  });

  describe('recordDeath', () => {
    it('should record a death', () => {
      const bot = createMockBot();
      recordDeath(bot as any, 'zombie');

      const death = getLastDeath();
      expect(death).not.toBeNull();
      expect(death?.cause).toBe('zombie');
      expect(death?.position).toEqual({ x: 100, y: 64, z: -50 });
      expect(death?.recovered).toBe(false);
    });

    it('should record dimension', () => {
      const bot = createMockBot();
      (bot.game as any).dimension = 'the_nether';
      recordDeath(bot as any, 'blaze');

      const death = getLastDeath();
      expect(death?.dimension).toBe('nether');
    });
  });

  describe('getLastDeath', () => {
    it('should return null when no deaths', () => {
      const death = getLastDeath();
      expect(death).toBeNull();
    });

    it('should return most recent unrecovered death', () => {
      const bot = createMockBot({ x: 0, y: 0, z: 0 });
      recordDeath(bot as any, 'first');

      const bot2 = createMockBot({ x: 100, y: 100, z: 100 });
      recordDeath(bot2 as any, 'second');

      const death = getLastDeath();
      expect(death?.cause).toBe('second');
    });
  });

  describe('markRecovered', () => {
    it('should mark death as recovered', () => {
      const bot = createMockBot();
      recordDeath(bot as any, 'skeleton');

      const result = markRecovered();
      expect(result).toBe(true);

      const death = getLastDeath();
      expect(death).toBeNull(); // No unrecovered deaths
    });

    it('should return false when no pending death', () => {
      const result = markRecovered();
      expect(result).toBe(false);
    });
  });

  describe('getDeathHistory', () => {
    it('should return all deaths', () => {
      const bot = createMockBot();
      recordDeath(bot as any, 'zombie');
      recordDeath(bot as any, 'creeper');
      recordDeath(bot as any, 'skeleton');

      const history = getDeathHistory();
      expect(history.length).toBe(3);
    });

    it('should be sorted by timestamp (newest first)', () => {
      const bot = createMockBot();
      recordDeath(bot as any, 'first');
      recordDeath(bot as any, 'second');
      recordDeath(bot as any, 'third');

      const history = getDeathHistory();
      expect(history[0].cause).toBe('third');
    });
  });

  describe('getDeathStats', () => {
    it('should return correct statistics', () => {
      const bot = createMockBot();
      recordDeath(bot as any, 'zombie');
      recordDeath(bot as any, 'zombie');
      recordDeath(bot as any, 'skeleton');
      markRecovered(); // Only marks most recent (skeleton)

      const stats = getDeathStats();
      expect(stats.totalDeaths).toBe(3);
      expect(stats.recoveredCount).toBe(1);
      expect(stats.causeBreakdown['zombie']).toBe(2);
      expect(stats.causeBreakdown['skeleton']).toBe(1);
    });
  });

  describe('itemsLikelyAvailable', () => {
    it('should return available=true for recent death', () => {
      const bot = createMockBot();
      recordDeath(bot as any, 'zombie');

      const result = itemsLikelyAvailable();
      expect(result.available).toBe(true);
      expect(result.timeRemaining).toBeGreaterThan(0);
    });

    it('should return available=false when no death', () => {
      const result = itemsLikelyAvailable();
      expect(result.available).toBe(false);
    });
  });

  describe('incrementRecoveryAttempts', () => {
    it('should increment attempts counter', () => {
      const bot = createMockBot();
      recordDeath(bot as any, 'zombie');

      expect(incrementRecoveryAttempts()).toBe(1);
      expect(incrementRecoveryAttempts()).toBe(2);
      expect(incrementRecoveryAttempts()).toBe(3);

      const death = getLastDeath();
      expect(death?.recoveryAttempts).toBe(3);
    });

    it('should return 0 when no pending death', () => {
      const result = incrementRecoveryAttempts();
      expect(result).toBe(0);
    });
  });
});
