/**
 * Tests for cooking-helpers.ts
 */

import { describe, it, expect } from 'vitest';
import {
  isLikelyFood,
  isLikelyOre,
  chooseDeviceForItem,
  hasFood,
  getBestFood,
  getFuel,
  calculateFuelNeeded,
} from '../../../src/utils/cooking-helpers.js';

describe('Cooking Helpers', () => {
  describe('isLikelyFood', () => {
    it('should identify common food items', () => {
      expect(isLikelyFood('apple')).toBe(true);
      expect(isLikelyFood('bread')).toBe(true);
      expect(isLikelyFood('carrot')).toBe(true);
      expect(isLikelyFood('cooked_beef')).toBe(true);
      expect(isLikelyFood('steak')).toBe(true);
    });

    it('should identify raw meats', () => {
      expect(isLikelyFood('raw_beef')).toBe(true);
      expect(isLikelyFood('raw_porkchop')).toBe(true);
      expect(isLikelyFood('raw_chicken')).toBe(true);
      expect(isLikelyFood('raw_mutton')).toBe(true);
    });

    it('should identify cooked foods', () => {
      expect(isLikelyFood('cooked_chicken')).toBe(true);
      expect(isLikelyFood('cooked_porkchop')).toBe(true);
      expect(isLikelyFood('cooked_salmon')).toBe(true);
      expect(isLikelyFood('cooked_cod')).toBe(true);
    });

    it('should identify fish items', () => {
      expect(isLikelyFood('cod')).toBe(true);
      expect(isLikelyFood('salmon')).toBe(true);
      expect(isLikelyFood('raw_cod')).toBe(true);
      expect(isLikelyFood('raw_salmon')).toBe(true);
    });

    it('should identify special food items', () => {
      expect(isLikelyFood('golden_apple')).toBe(true);
      expect(isLikelyFood('golden_carrot')).toBe(true);
      expect(isLikelyFood('enchanted_golden_apple')).toBe(true);
    });

    it('should identify vegetables', () => {
      expect(isLikelyFood('potato')).toBe(true);
      expect(isLikelyFood('baked_potato')).toBe(true);
      expect(isLikelyFood('sweet_berries')).toBe(true);
    });

    it('should reject non-food items', () => {
      expect(isLikelyFood('stone')).toBe(false);
      expect(isLikelyFood('diamond')).toBe(false);
      expect(isLikelyFood('iron_ore')).toBe(false);
      expect(isLikelyFood('coal')).toBe(false);
      expect(isLikelyFood('wooden_pickaxe')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isLikelyFood('APPLE')).toBe(true);
      expect(isLikelyFood('CoOkEd_BeEf')).toBe(true);
      expect(isLikelyFood('Raw_Chicken')).toBe(true);
    });
  });

  describe('isLikelyOre', () => {
    it('should identify raw ores', () => {
      expect(isLikelyOre('raw_iron')).toBe(true);
      expect(isLikelyOre('raw_gold')).toBe(true);
      expect(isLikelyOre('raw_copper')).toBe(true);
    });

    it('should identify ore blocks', () => {
      expect(isLikelyOre('iron_ore')).toBe(true);
      expect(isLikelyOre('gold_ore')).toBe(true);
      expect(isLikelyOre('copper_ore')).toBe(true);
    });

    it('should identify deepslate ores', () => {
      expect(isLikelyOre('deepslate_iron_ore')).toBe(true);
      expect(isLikelyOre('deepslate_gold_ore')).toBe(true);
      expect(isLikelyOre('deepslate_copper_ore')).toBe(true);
    });

    it('should identify nether ores', () => {
      expect(isLikelyOre('ancient_debris')).toBe(true);
    });

    it('should reject non-ore items', () => {
      expect(isLikelyOre('iron_ingot')).toBe(false);
      expect(isLikelyOre('gold_ingot')).toBe(false);
      expect(isLikelyOre('diamond')).toBe(false);
      expect(isLikelyOre('coal')).toBe(false);
    });

    it('should reject food items', () => {
      expect(isLikelyOre('apple')).toBe(false);
      expect(isLikelyOre('bread')).toBe(false);
      expect(isLikelyOre('steak')).toBe(false);
    });
  });

  describe('chooseDeviceForItem', () => {
    it('should choose smoker for food', () => {
      expect(chooseDeviceForItem('raw_beef')).toBe('smoker');
      expect(chooseDeviceForItem('raw_chicken')).toBe('smoker');
      expect(chooseDeviceForItem('potato')).toBe('smoker');
    });

    it('should choose blast_furnace for ores', () => {
      expect(chooseDeviceForItem('raw_iron')).toBe('blast_furnace');
      expect(chooseDeviceForItem('raw_gold')).toBe('blast_furnace');
      expect(chooseDeviceForItem('iron_ore')).toBe('blast_furnace');
    });

    it('should default to furnace for other items', () => {
      expect(chooseDeviceForItem('sand')).toBe('furnace');
      expect(chooseDeviceForItem('clay')).toBe('furnace');
      expect(chooseDeviceForItem('cobblestone')).toBe('furnace');
    });

    it('should honor explicit preference', () => {
      expect(chooseDeviceForItem('raw_beef', 'furnace')).toBe('furnace');
      expect(chooseDeviceForItem('raw_iron', 'furnace')).toBe('furnace');
      expect(chooseDeviceForItem('sand', 'smoker')).toBe('smoker');
      expect(chooseDeviceForItem('sand', 'blast_furnace')).toBe('blast_furnace');
      expect(chooseDeviceForItem('sand', 'campfire')).toBe('campfire');
    });

    it('should handle empty preference', () => {
      expect(chooseDeviceForItem('raw_beef', '')).toBe('smoker');
      expect(chooseDeviceForItem('raw_iron', '')).toBe('blast_furnace');
    });

    it('should handle undefined preference', () => {
      expect(chooseDeviceForItem('raw_beef', undefined)).toBe('smoker');
      expect(chooseDeviceForItem('raw_iron', undefined)).toBe('blast_furnace');
    });
  });

  describe('hasFood', () => {
    it('should return true when bot has food', () => {
      const mockBot = {
        inventory: {
          items: () => [
            { name: 'diamond', count: 5 },
            { name: 'apple', count: 3 },
          ],
        },
      } as any;

      expect(hasFood(mockBot)).toBe(true);
    });

    it('should return false when bot has no food', () => {
      const mockBot = {
        inventory: {
          items: () => [
            { name: 'diamond', count: 5 },
            { name: 'iron_ore', count: 10 },
          ],
        },
      } as any;

      expect(hasFood(mockBot)).toBe(false);
    });

    it('should return false for empty inventory', () => {
      const mockBot = {
        inventory: {
          items: () => [],
        },
      } as any;

      expect(hasFood(mockBot)).toBe(false);
    });
  });

  describe('getBestFood', () => {
    it('should prioritize golden_carrot', () => {
      const mockBot = {
        inventory: {
          items: () => [
            { name: 'apple', count: 5 },
            { name: 'golden_carrot', count: 3 },
            { name: 'bread', count: 10 },
          ],
        },
      } as any;

      expect(getBestFood(mockBot)?.name).toBe('golden_carrot');
    });

    it('should prioritize cooked_beef over raw', () => {
      const mockBot = {
        inventory: {
          items: () => [
            { name: 'raw_beef', count: 5 },
            { name: 'cooked_beef', count: 3 },
          ],
        },
      } as any;

      expect(getBestFood(mockBot)?.name).toBe('cooked_beef');
    });

    it('should return any food when no priority matches', () => {
      const mockBot = {
        inventory: {
          items: () => [
            { name: 'suspicious_stew', count: 1 },
          ],
        },
      } as any;

      expect(getBestFood(mockBot)?.name).toBe('suspicious_stew');
    });

    it('should return null when no food', () => {
      const mockBot = {
        inventory: {
          items: () => [
            { name: 'diamond', count: 5 },
          ],
        },
      } as any;

      expect(getBestFood(mockBot)).toBeNull();
    });

    it('should return null for empty inventory', () => {
      const mockBot = {
        inventory: {
          items: () => [],
        },
      } as any;

      expect(getBestFood(mockBot)).toBeNull();
    });
  });

  describe('getFuel', () => {
    it('should prioritize lava_bucket', () => {
      const mockBot = {
        inventory: {
          items: () => [
            { name: 'coal', count: 64 },
            { name: 'lava_bucket', count: 1 },
            { name: 'oak_planks', count: 64 },
          ],
        },
      } as any;

      expect(getFuel(mockBot)?.name).toBe('lava_bucket');
    });

    it('should prioritize coal_block over coal', () => {
      const mockBot = {
        inventory: {
          items: () => [
            { name: 'coal', count: 64 },
            { name: 'coal_block', count: 1 },
          ],
        },
      } as any;

      expect(getFuel(mockBot)?.name).toBe('coal_block');
    });

    it('should return coal when available', () => {
      const mockBot = {
        inventory: {
          items: () => [
            { name: 'coal', count: 64 },
            { name: 'oak_planks', count: 64 },
          ],
        },
      } as any;

      expect(getFuel(mockBot)?.name).toBe('coal');
    });

    it('should return planks when no better fuel', () => {
      const mockBot = {
        inventory: {
          items: () => [
            { name: 'oak_planks', count: 64 },
            { name: 'stick', count: 64 },
          ],
        },
      } as any;

      expect(getFuel(mockBot)?.name).toBe('oak_planks');
    });

    it('should return null when no fuel', () => {
      const mockBot = {
        inventory: {
          items: () => [
            { name: 'diamond', count: 5 },
          ],
        },
      } as any;

      expect(getFuel(mockBot)).toBeNull();
    });
  });

  describe('calculateFuelNeeded', () => {
    it('should calculate coal needed correctly', () => {
      // Coal burns 1600 ticks, smelt time 200, so 8 items per coal
      const coalItem = { name: 'coal' };
      expect(calculateFuelNeeded(1, coalItem)).toBe(1);
      expect(calculateFuelNeeded(8, coalItem)).toBe(1);
      expect(calculateFuelNeeded(9, coalItem)).toBe(2);
      expect(calculateFuelNeeded(16, coalItem)).toBe(2);
    });

    it('should calculate lava_bucket needed correctly', () => {
      // Lava bucket burns 20000 ticks, smelt time 200, so 100 items per bucket
      const lavaItem = { name: 'lava_bucket' };
      expect(calculateFuelNeeded(1, lavaItem)).toBe(1);
      expect(calculateFuelNeeded(100, lavaItem)).toBe(1);
      expect(calculateFuelNeeded(101, lavaItem)).toBe(2);
    });

    it('should calculate planks needed correctly', () => {
      // Planks burn 300 ticks, smelt time 200, so 1 item per plank
      const plankItem = { name: 'oak_planks' };
      expect(calculateFuelNeeded(1, plankItem)).toBe(1);
      expect(calculateFuelNeeded(2, plankItem)).toBe(2);
    });

    it('should handle unknown fuel with default burn time', () => {
      const unknownItem = { name: 'unknown_item' };
      // Default burn time 300, so 1 item per fuel
      expect(calculateFuelNeeded(1, unknownItem)).toBe(1);
      expect(calculateFuelNeeded(2, unknownItem)).toBe(2);
    });

    it('should handle null fuel', () => {
      expect(calculateFuelNeeded(1, null)).toBe(1);
      expect(calculateFuelNeeded(2, null)).toBe(2);
    });

    it('should handle undefined fuel', () => {
      expect(calculateFuelNeeded(1, undefined)).toBe(1);
    });
  });
});
