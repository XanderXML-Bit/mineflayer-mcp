/**
 * Tests for inventory-helpers.ts
 */

import { describe, it, expect } from 'vitest';
import {
  deriveDroppedItemInfo,
  getItemDurabilityInfo,
  getEquippedSummary,
  countInventoryItems,
  countItem,
  hasInventorySpace,
  getEmptySlotCount,
  findItemByName,
  findAllItems,
} from '../../../src/utils/inventory-helpers.js';

describe('Inventory Helpers', () => {
  describe('deriveDroppedItemInfo', () => {
    it('should return null for null entity', () => {
      expect(deriveDroppedItemInfo(null, {})).toBeNull();
    });

    it('should return null for entity without metadata', () => {
      expect(deriveDroppedItemInfo({}, {})).toBeNull();
    });

    it('should extract itemId and itemCount from metadata', () => {
      const entity = {
        metadata: {
          itemId: 1,
          itemCount: 64,
        },
      };
      const mcData = {
        items: {
          1: { name: 'stone' },
        },
      };

      const result = deriveDroppedItemInfo(entity, mcData);
      expect(result).toEqual({ id: 1, name: 'stone', count: 64 });
    });

    it('should search nested objects for item info', () => {
      const entity = {
        metadata: {
          other: 'value',
          nestedItem: {
            id: 5,
            count: 32,
          },
        },
      };
      const mcData = {
        items: {
          5: { name: 'oak_planks' },
        },
      };

      const result = deriveDroppedItemInfo(entity, mcData);
      expect(result?.id).toBe(5);
      expect(result?.count).toBe(32);
    });

    it('should return undefined name if mcData lacks item', () => {
      const entity = {
        metadata: {
          itemId: 999,
          itemCount: 1,
        },
      };

      const result = deriveDroppedItemInfo(entity, {});
      expect(result?.id).toBe(999);
      expect(result?.name).toBeUndefined();
    });
  });

  describe('getItemDurabilityInfo', () => {
    it('should return all null for null item', () => {
      expect(getItemDurabilityInfo({}, null)).toEqual({
        max: null,
        used: null,
        left: null,
      });
    });

    it('should get max durability from mcData', () => {
      const mcData = {
        itemsByName: {
          diamond_pickaxe: { maxDurability: 1561 },
        },
      };
      const item = { name: 'diamond_pickaxe' };

      const result = getItemDurabilityInfo(mcData, item);
      expect(result.max).toBe(1561);
    });

    it('should calculate durability left', () => {
      const mcData = {
        itemsByName: {
          diamond_pickaxe: { maxDurability: 1561 },
        },
      };
      const item = { name: 'diamond_pickaxe', durabilityUsed: 100 };

      const result = getItemDurabilityInfo(mcData, item);
      expect(result.max).toBe(1561);
      expect(result.used).toBe(100);
      expect(result.left).toBe(1461);
    });

    it('should extract durability from NBT', () => {
      const mcData = {
        itemsByName: {
          iron_sword: { maxDurability: 250 },
        },
      };
      const item = {
        name: 'iron_sword',
        nbt: { value: { Damage: { value: 50 } } },
      };

      const result = getItemDurabilityInfo(mcData, item);
      expect(result.used).toBe(50);
      expect(result.left).toBe(200);
    });

    it('should handle zero durability left', () => {
      const mcData = {
        itemsByName: {
          wooden_hoe: { maxDurability: 59 },
        },
      };
      const item = { name: 'wooden_hoe', durabilityUsed: 59 };

      const result = getItemDurabilityInfo(mcData, item);
      expect(result.left).toBe(0);
    });

    it('should clamp negative durability to zero', () => {
      const mcData = {
        itemsByName: {
          stone_sword: { maxDurability: 131 },
        },
      };
      const item = { name: 'stone_sword', durabilityUsed: 200 };

      const result = getItemDurabilityInfo(mcData, item);
      expect(result.left).toBe(0);
    });
  });

  describe('getEquippedSummary', () => {
    it('should return all null for empty inventory', () => {
      const mockBot = {
        heldItem: null,
        inventory: { slots: [] },
      } as any;

      const result = getEquippedSummary(mockBot);
      expect(result.mainHand).toBeNull();
      expect(result.offHand).toBeNull();
      expect(result.armor.head).toBeNull();
      expect(result.armor.chest).toBeNull();
      expect(result.armor.legs).toBeNull();
      expect(result.armor.feet).toBeNull();
    });

    it('should return held item info', () => {
      const mockBot = {
        heldItem: { name: 'diamond_sword', count: 1 },
        inventory: { slots: [] },
      } as any;

      const result = getEquippedSummary(mockBot);
      expect(result.mainHand?.name).toBe('diamond_sword');
      expect(result.mainHand?.count).toBe(1);
    });

    it('should return armor slots', () => {
      const mockBot = {
        heldItem: null,
        inventory: {
          slots: {
            5: { name: 'diamond_helmet', count: 1 },
            6: { name: 'diamond_chestplate', count: 1 },
            7: { name: 'diamond_leggings', count: 1 },
            8: { name: 'diamond_boots', count: 1 },
          },
        },
      } as any;

      const result = getEquippedSummary(mockBot);
      expect(result.armor.head?.name).toBe('diamond_helmet');
      expect(result.armor.chest?.name).toBe('diamond_chestplate');
      expect(result.armor.legs?.name).toBe('diamond_leggings');
      expect(result.armor.feet?.name).toBe('diamond_boots');
    });

    it('should return off-hand item', () => {
      const mockBot = {
        heldItem: null,
        inventory: {
          slots: {
            45: { name: 'shield', count: 1 },
          },
        },
      } as any;

      const result = getEquippedSummary(mockBot);
      expect(result.offHand?.name).toBe('shield');
    });
  });

  describe('countInventoryItems', () => {
    it('should return 0 for empty inventory', () => {
      const mockBot = {
        inventory: {
          items: () => [],
        },
      } as any;

      expect(countInventoryItems(mockBot)).toBe(0);
    });

    it('should sum all item counts', () => {
      const mockBot = {
        inventory: {
          items: () => [
            { name: 'stone', count: 64 },
            { name: 'dirt', count: 32 },
            { name: 'diamond', count: 5 },
          ],
        },
      } as any;

      expect(countInventoryItems(mockBot)).toBe(101);
    });
  });

  describe('countItem', () => {
    it('should return 0 for non-existent item', () => {
      const mockBot = {
        inventory: {
          items: () => [
            { name: 'stone', count: 64 },
          ],
        },
      } as any;

      expect(countItem(mockBot, 'diamond')).toBe(0);
    });

    it('should count single stack', () => {
      const mockBot = {
        inventory: {
          items: () => [
            { name: 'stone', count: 64 },
            { name: 'diamond', count: 5 },
          ],
        },
      } as any;

      expect(countItem(mockBot, 'diamond')).toBe(5);
    });

    it('should sum multiple stacks', () => {
      const mockBot = {
        inventory: {
          items: () => [
            { name: 'cobblestone', count: 64 },
            { name: 'cobblestone', count: 64 },
            { name: 'cobblestone', count: 30 },
          ],
        },
      } as any;

      expect(countItem(mockBot, 'cobblestone')).toBe(158);
    });
  });

  describe('hasInventorySpace', () => {
    it('should return true with empty slots', () => {
      const mockBot = {
        inventory: {
          emptySlotCount: () => 10,
        },
      } as any;

      expect(hasInventorySpace(mockBot)).toBe(true);
    });

    it('should return false with no empty slots', () => {
      const mockBot = {
        inventory: {
          emptySlotCount: () => 0,
        },
      } as any;

      expect(hasInventorySpace(mockBot)).toBe(false);
    });

    it('should return true when emptySlotCount unavailable', () => {
      const mockBot = {
        inventory: {},
      } as any;

      expect(hasInventorySpace(mockBot)).toBe(true);
    });
  });

  describe('getEmptySlotCount', () => {
    it('should return count from inventory', () => {
      const mockBot = {
        inventory: {
          emptySlotCount: () => 15,
        },
      } as any;

      expect(getEmptySlotCount(mockBot)).toBe(15);
    });

    it('should return -1 when method unavailable', () => {
      const mockBot = {
        inventory: {},
      } as any;

      expect(getEmptySlotCount(mockBot)).toBe(-1);
    });
  });

  describe('findItemByName', () => {
    it('should find exact match', () => {
      const mockBot = {
        inventory: {
          items: () => [
            { name: 'stone', count: 64 },
            { name: 'diamond', count: 5 },
          ],
        },
      } as any;

      const result = findItemByName(mockBot, 'diamond');
      expect(result?.name).toBe('diamond');
    });

    it('should find partial match', () => {
      const mockBot = {
        inventory: {
          items: () => [
            { name: 'stone', count: 64 },
            { name: 'diamond_pickaxe', count: 1 },
          ],
        },
      } as any;

      const result = findItemByName(mockBot, 'pick');
      expect(result?.name).toBe('diamond_pickaxe');
    });

    it('should be case insensitive', () => {
      const mockBot = {
        inventory: {
          items: () => [
            { name: 'diamond_sword', count: 1 },
          ],
        },
      } as any;

      const result = findItemByName(mockBot, 'DIAMOND');
      expect(result?.name).toBe('diamond_sword');
    });

    it('should return null when not found', () => {
      const mockBot = {
        inventory: {
          items: () => [
            { name: 'stone', count: 64 },
          ],
        },
      } as any;

      expect(findItemByName(mockBot, 'gold')).toBeNull();
    });
  });

  describe('findAllItems', () => {
    it('should return empty array when no matches', () => {
      const mockBot = {
        inventory: {
          items: () => [
            { name: 'stone', count: 64 },
          ],
        },
      } as any;

      const result = findAllItems(mockBot, (i) => i.name.includes('diamond'));
      expect(result).toEqual([]);
    });

    it('should find all matching items', () => {
      const mockBot = {
        inventory: {
          items: () => [
            { name: 'diamond', count: 5 },
            { name: 'stone', count: 64 },
            { name: 'diamond_pickaxe', count: 1 },
            { name: 'diamond_sword', count: 1 },
          ],
        },
      } as any;

      const result = findAllItems(mockBot, (i) => i.name.includes('diamond'));
      expect(result.length).toBe(3);
    });

    it('should filter by count', () => {
      const mockBot = {
        inventory: {
          items: () => [
            { name: 'stone', count: 64 },
            { name: 'dirt', count: 10 },
            { name: 'diamond', count: 5 },
          ],
        },
      } as any;

      const result = findAllItems(mockBot, (i) => i.count > 30);
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('stone');
    });
  });
});
