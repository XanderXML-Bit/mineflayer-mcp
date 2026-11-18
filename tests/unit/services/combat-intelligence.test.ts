/**
 * Combat Intelligence Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  assessThreats,
  getCombatReadiness,
  getArmorRating,
  getBestWeapon,
  recordCombatResult,
  getCombatStats,
  clearCombatStats,
} from '../../../src/services/combat-intelligence.service.js';
import { shutdownMemoryService, getMemoryService } from '../../../src/services/memory.service.js';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Mock entity factory
const createMockEntity = (name: string, distance: number, health: number = 20) => ({
  id: Math.floor(Math.random() * 10000),
  name,
  type: 'mob',
  position: {
    distanceTo: () => distance,
  },
  health,
  maxHealth: 20,
});

// Mock bot factory
const createMockBot = (overrides: any = {}) => {
  const position = { x: 0, y: 64, z: 0, distanceTo: () => 0 };

  return {
    entity: { position },
    health: overrides.health ?? 20,
    food: overrides.food ?? 20,
    inventory: {
      items: () => overrides.items ?? [],
      slots: Array(46)
        .fill(null)
        .map((_, i) => {
          if (i === 5 && overrides.helmet) return { name: overrides.helmet };
          if (i === 6 && overrides.chestplate) return { name: overrides.chestplate };
          if (i === 7 && overrides.leggings) return { name: overrides.leggings };
          if (i === 8 && overrides.boots) return { name: overrides.boots };
          if (i === 45 && overrides.offhand) return { name: overrides.offhand };
          return null;
        }),
    },
    entities: overrides.entities ?? {},
  };
};

describe('CombatIntelligenceService', () => {
  // Seed the memory singleton with an owned temporary directory instead of the default ./data path.
  let memoryDir: string;

  beforeEach(() => {
    shutdownMemoryService();
    memoryDir = mkdtempSync(join(tmpdir(), 'mc-mcp-combat-'));
    getMemoryService(memoryDir);
  });

  afterEach(() => {
    shutdownMemoryService();
    rmSync(memoryDir, { recursive: true });
  });

  describe('getArmorRating', () => {
    it('should return 0 for no armor', () => {
      const bot = createMockBot({});
      expect(getArmorRating(bot as any)).toBe(0);
    });

    it('should calculate armor rating correctly', () => {
      const bot = createMockBot({
        helmet: 'iron_helmet', // 2
        chestplate: 'iron_chestplate', // 6
        leggings: 'iron_leggings', // 5
        boots: 'iron_boots', // 2
      });
      expect(getArmorRating(bot as any)).toBe(15);
    });

    it('should handle partial armor', () => {
      const bot = createMockBot({
        chestplate: 'diamond_chestplate', // 8
        boots: 'leather_boots', // 1
      });
      expect(getArmorRating(bot as any)).toBe(9);
    });
  });

  describe('getBestWeapon', () => {
    it('should return null for no weapons', () => {
      const bot = createMockBot({ items: [] });
      expect(getBestWeapon(bot as any)).toBeNull();
    });

    it('should find the best weapon', () => {
      const bot = createMockBot({
        items: [
          { name: 'wooden_sword' },
          { name: 'diamond_sword' },
          { name: 'iron_sword' },
        ],
      });
      const best = getBestWeapon(bot as any);

      expect(best?.name).toBe('diamond_sword');
      expect(best?.damage).toBe(7);
    });

    it('should consider axes as weapons', () => {
      const bot = createMockBot({
        items: [{ name: 'netherite_axe' }],
      });
      const best = getBestWeapon(bot as any);

      expect(best?.name).toBe('netherite_axe');
      expect(best?.damage).toBe(10);
    });
  });

  describe('assessThreats', () => {
    it('should return no threats for empty area', () => {
      const bot = createMockBot({ entities: {} });
      const assessment = assessThreats(bot as any);

      expect(assessment.overallThreat).toBe('none');
      expect(assessment.threats).toHaveLength(0);
      expect(assessment.recommendation).toBe('ignore');
    });

    it('should detect hostile mobs', () => {
      const zombie = createMockEntity('zombie', 5);
      const bot = createMockBot({
        entities: { [zombie.id]: zombie },
      });
      const assessment = assessThreats(bot as any);

      expect(assessment.threats).toHaveLength(1);
      expect(assessment.threats[0].name).toBe('zombie');
    });

    it('should ignore passive mobs', () => {
      const cow = createMockEntity('cow', 5);
      const bot = createMockBot({
        entities: { [cow.id]: cow },
      });
      const assessment = assessThreats(bot as any);

      expect(assessment.threats).toHaveLength(0);
    });

    it('should return critical for dangerous mobs', () => {
      const creeper = createMockEntity('creeper', 3);
      const bot = createMockBot({
        entities: { [creeper.id]: creeper },
      });
      const assessment = assessThreats(bot as any);

      expect(assessment.overallThreat).toBe('critical');
      expect(assessment.recommendation).toBe('flee');
    });

    it('should sort threats by distance', () => {
      const far = createMockEntity('zombie', 15);
      const near = createMockEntity('skeleton', 5);
      const bot = createMockBot({
        entities: { [far.id]: far, [near.id]: near },
      });
      const assessment = assessThreats(bot as any);

      expect(assessment.nearestThreat?.name).toBe('skeleton');
    });

    it('should provide escape routes when threats present', () => {
      const zombie = createMockEntity('zombie', 5);
      const bot = createMockBot({
        entities: { [zombie.id]: zombie },
      });
      const assessment = assessThreats(bot as any);

      expect(assessment.escapeRoutes.length).toBeGreaterThan(0);
    });
  });

  describe('getCombatReadiness', () => {
    it('should be ready with full health and equipment', () => {
      const bot = createMockBot({
        health: 20,
        food: 20,
        helmet: 'diamond_helmet',
        chestplate: 'diamond_chestplate',
        leggings: 'diamond_leggings',
        boots: 'diamond_boots',
        items: [{ name: 'diamond_sword' }],
      });
      const readiness = getCombatReadiness(bot as any);

      expect(readiness.ready).toBe(true);
      expect(readiness.issues).toHaveLength(0);
    });

    it('should report low health', () => {
      const bot = createMockBot({
        health: 5,
        food: 20,
        items: [{ name: 'diamond_sword' }],
        chestplate: 'diamond_chestplate',
      });
      const readiness = getCombatReadiness(bot as any);

      expect(readiness.ready).toBe(false);
      expect(readiness.issues.some((i) => i.toLowerCase().includes('health'))).toBe(true);
    });

    it('should report low food', () => {
      const bot = createMockBot({
        health: 20,
        food: 3,
        items: [{ name: 'diamond_sword' }],
        chestplate: 'diamond_chestplate',
      });
      const readiness = getCombatReadiness(bot as any);

      expect(readiness.ready).toBe(false);
      expect(readiness.issues.some((i) => i.toLowerCase().includes('food'))).toBe(true);
    });

    it('should report no weapon', () => {
      const bot = createMockBot({
        health: 20,
        food: 20,
        items: [],
        chestplate: 'diamond_chestplate',
      });
      const readiness = getCombatReadiness(bot as any);

      expect(readiness.ready).toBe(false);
      expect(readiness.issues.some((i) => i.toLowerCase().includes('weapon'))).toBe(true);
    });

    it('should detect shield in offhand', () => {
      const bot = createMockBot({
        health: 20,
        food: 20,
        offhand: 'shield',
        items: [{ name: 'iron_sword' }],
        chestplate: 'iron_chestplate',
      });
      const readiness = getCombatReadiness(bot as any);

      expect(readiness.shieldEquipped).toBe(true);
    });
  });

  describe('Combat Statistics', () => {
    beforeEach(() => {
      // Reset stats before each test
      clearCombatStats();
    });

    it('should record combat wins', () => {
      recordCombatResult(true, 'zombie', 'iron_sword');
      const stats = getCombatStats();

      expect(stats.wins).toBe(1);
      expect(stats.totalFights).toBe(1);
    });

    it('should record combat losses', () => {
      recordCombatResult(false, 'creeper');
      const stats = getCombatStats();

      expect(stats.losses).toBe(1);
      expect(stats.deathsBy['creeper']).toBe(1);
    });

    it('should calculate win rate', () => {
      recordCombatResult(true, 'zombie', 'sword');
      recordCombatResult(true, 'skeleton', 'sword');
      recordCombatResult(false, 'creeper');
      const stats = getCombatStats();

      expect(stats.winRate).toBe(67); // 2 wins out of 3
    });
  });
});
