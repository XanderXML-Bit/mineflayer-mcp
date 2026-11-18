/**
 * Resource Planner Service Tests
 */

import { describe, it, expect } from 'vitest';
import {
  getResourceStatus,
  checkToolDurability,
  getFoodSupply,
  canCraft,
  whatCanICraft,
} from '../../../src/services/resource-planner.service.js';

// Mock item factory
const createMockItem = (name: string, count: number = 1, durability?: { current: number; max: number }) => ({
  name,
  count,
  slot: Math.floor(Math.random() * 36),
  type: Math.floor(Math.random() * 1000),
  maxDurability: durability?.max ?? 0,
  nbt: durability
    ? { value: { Damage: { value: durability.max - durability.current } } }
    : undefined,
});

// Mock bot factory
const createMockBot = (items: any[] = []) => ({
  inventory: {
    items: () => items,
    slots: Array(46).fill(null),
  },
  version: '1.20.1',
});

describe('ResourcePlannerService', () => {
  describe('getResourceStatus', () => {
    it('should return empty status for empty inventory', () => {
      const bot = createMockBot([]);
      const status = getResourceStatus(bot as any);

      expect(status.tools).toHaveLength(0);
      expect(status.food.items).toHaveLength(0);
      expect(status.materials).toHaveLength(0);
    });

    it('should identify tools with durability', () => {
      const items = [
        createMockItem('iron_pickaxe', 1, { current: 125, max: 250 }),
        createMockItem('diamond_sword', 1, { current: 1000, max: 1561 }),
      ];
      const bot = createMockBot(items);
      const status = getResourceStatus(bot as any);

      expect(status.tools).toHaveLength(2);
      expect(status.tools[0].durabilityPercent).toBe(50);
    });

    it('should identify food items', () => {
      const items = [
        createMockItem('cooked_beef', 32),
        createMockItem('bread', 16),
        createMockItem('golden_apple', 2),
      ];
      const bot = createMockBot(items);
      const status = getResourceStatus(bot as any);

      expect(status.food.items).toHaveLength(3);
      expect(status.food.totalFood).toBeGreaterThan(0);
    });

    it('should count materials', () => {
      const items = [
        createMockItem('cobblestone', 64),
        createMockItem('cobblestone', 64),
        createMockItem('oak_log', 32),
      ];
      const bot = createMockBot(items);
      const status = getResourceStatus(bot as any);

      expect(status.materials.find((m) => m.item === 'cobblestone')?.count).toBe(128);
      expect(status.materials.find((m) => m.item === 'oak_log')?.count).toBe(32);
    });

    it('should generate alerts for low durability tools', () => {
      const items = [
        createMockItem('iron_pickaxe', 1, { current: 10, max: 250 }), // 4% - critical
      ];
      const bot = createMockBot(items);
      const status = getResourceStatus(bot as any);

      expect(status.lowSupplyAlerts.some((a) => a.includes('iron_pickaxe'))).toBe(true);
    });

    it('should generate alerts for low food', () => {
      const items = [createMockItem('apple', 1)]; // Only 4 food points = ~0 meals
      const bot = createMockBot(items);
      const status = getResourceStatus(bot as any);

      expect(status.lowSupplyAlerts.some((a) => a.includes('food') || a.includes('meal'))).toBe(true);
    });
  });

  describe('checkToolDurability', () => {
    it('should return tools sorted by durability', () => {
      const items = [
        createMockItem('iron_pickaxe', 1, { current: 200, max: 250 }), // 80%
        createMockItem('diamond_sword', 1, { current: 100, max: 1561 }), // ~6%
        createMockItem('stone_axe', 1, { current: 50, max: 131 }), // ~38%
      ];
      const bot = createMockBot(items);
      const tools = checkToolDurability(bot as any);

      expect(tools[0].item).toBe('diamond_sword'); // Lowest first
      expect(tools[0].critical).toBe(true);
    });

    it('should mark warning and critical flags correctly', () => {
      const items = [
        createMockItem('iron_pickaxe', 1, { current: 20, max: 250 }), // 8% - critical (<10%)
        createMockItem('iron_shovel', 1, { current: 40, max: 250 }), // 16% - warning (<20%)
        createMockItem('iron_axe', 1, { current: 200, max: 250 }), // 80% - good
      ];
      const bot = createMockBot(items);
      const tools = checkToolDurability(bot as any);

      const pickaxe = tools.find((t) => t.item === 'iron_pickaxe');
      const shovel = tools.find((t) => t.item === 'iron_shovel');
      const axe = tools.find((t) => t.item === 'iron_axe');

      expect(pickaxe?.critical).toBe(true);
      expect(shovel?.warning).toBe(true);
      expect(shovel?.critical).toBe(false);
      expect(axe?.warning).toBe(false);
    });
  });

  describe('getFoodSupply', () => {
    it('should calculate total food points', () => {
      const items = [
        createMockItem('cooked_beef', 10), // 8 food each = 80
        createMockItem('bread', 5), // 5 food each = 25
      ];
      const bot = createMockBot(items);
      const supply = getFoodSupply(bot as any);

      expect(supply.totalFood).toBe(105);
    });

    it('should calculate meals remaining', () => {
      const items = [
        createMockItem('cooked_beef', 6), // 48 food points
      ];
      const bot = createMockBot(items);
      const supply = getFoodSupply(bot as any);

      expect(supply.mealsRemaining).toBe(8); // 48 / 6 = 8
    });

    it('should include saturation values', () => {
      const items = [createMockItem('golden_carrot', 5)];
      const bot = createMockBot(items);
      const supply = getFoodSupply(bot as any);

      expect(supply.totalSaturation).toBeGreaterThan(0);
    });
  });

  describe('canCraft', () => {
    it('should return canCraft false when no recipe exists', () => {
      const bot = createMockBot([]);
      const result = canCraft(bot as any, 'nonexistent_item');

      expect(result.canCraft).toBe(false);
    });

    // Note: Full crafting tests would require minecraft-data mock
  });

  describe('whatCanICraft', () => {
    it('should return empty array for empty inventory', () => {
      const bot = createMockBot([]);
      const craftable = whatCanICraft(bot as any);

      expect(craftable).toEqual([]);
    });

    // Note: Full crafting tests would require minecraft-data mock
  });
});
