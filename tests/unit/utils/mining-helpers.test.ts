/**
 * Tests for mining-helpers.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Vec3 } from 'vec3';
import {
  isOreBlockName,
  isLogBlockName,
  posKey,
  requiredToolCategoryForBlockName,
  inventoryHasToolCategory,
  getAdjacentPositions,
  collectBlockWithTimeout,
  digBlockWithTimeout,
} from '../../../src/utils/mining-helpers.js';

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

describe('Mining Helpers', () => {
  describe('isOreBlockName', () => {
    it('should identify standard ores', () => {
      expect(isOreBlockName('iron_ore')).toBe(true);
      expect(isOreBlockName('gold_ore')).toBe(true);
      expect(isOreBlockName('diamond_ore')).toBe(true);
      expect(isOreBlockName('coal_ore')).toBe(true);
      expect(isOreBlockName('lapis_ore')).toBe(true);
      expect(isOreBlockName('redstone_ore')).toBe(true);
      expect(isOreBlockName('emerald_ore')).toBe(true);
      expect(isOreBlockName('copper_ore')).toBe(true);
    });

    it('should identify deepslate ores', () => {
      expect(isOreBlockName('deepslate_iron_ore')).toBe(true);
      expect(isOreBlockName('deepslate_gold_ore')).toBe(true);
      expect(isOreBlockName('deepslate_diamond_ore')).toBe(true);
      expect(isOreBlockName('deepslate_coal_ore')).toBe(true);
    });

    it('should identify nether ores', () => {
      expect(isOreBlockName('nether_gold_ore')).toBe(true);
      expect(isOreBlockName('nether_quartz_ore')).toBe(true);
      expect(isOreBlockName('ancient_debris')).toBe(true);
    });

    it('should reject non-ore blocks', () => {
      expect(isOreBlockName('stone')).toBe(false);
      expect(isOreBlockName('dirt')).toBe(false);
      expect(isOreBlockName('oak_log')).toBe(false);
      expect(isOreBlockName('iron_block')).toBe(false);
      expect(isOreBlockName('diamond')).toBe(false);
    });

    it('should handle empty or null values', () => {
      expect(isOreBlockName('')).toBe(false);
      expect(isOreBlockName(null as any)).toBe(false);
      expect(isOreBlockName(undefined as any)).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isOreBlockName('IRON_ORE')).toBe(true);
      expect(isOreBlockName('Diamond_Ore')).toBe(true);
      expect(isOreBlockName('ANCIENT_DEBRIS')).toBe(true);
    });
  });

  describe('isLogBlockName', () => {
    it('should identify standard logs', () => {
      expect(isLogBlockName('oak_log')).toBe(true);
      expect(isLogBlockName('birch_log')).toBe(true);
      expect(isLogBlockName('spruce_log')).toBe(true);
      expect(isLogBlockName('jungle_log')).toBe(true);
      expect(isLogBlockName('acacia_log')).toBe(true);
      expect(isLogBlockName('dark_oak_log')).toBe(true);
      expect(isLogBlockName('cherry_log')).toBe(true);
      expect(isLogBlockName('mangrove_log')).toBe(true);
    });

    it('should identify stripped logs', () => {
      expect(isLogBlockName('stripped_oak_log')).toBe(true);
      expect(isLogBlockName('stripped_birch_log')).toBe(true);
    });

    it('should identify nether stems', () => {
      expect(isLogBlockName('warped_stem')).toBe(true);
      expect(isLogBlockName('crimson_stem')).toBe(true);
      expect(isLogBlockName('stripped_warped_stem')).toBe(true);
    });

    it('should identify hyphae', () => {
      expect(isLogBlockName('warped_hyphae')).toBe(true);
      expect(isLogBlockName('crimson_hyphae')).toBe(true);
      expect(isLogBlockName('stripped_warped_hyphae')).toBe(true);
    });

    it('should reject non-log blocks', () => {
      expect(isLogBlockName('oak_planks')).toBe(false);
      expect(isLogBlockName('stone')).toBe(false);
      expect(isLogBlockName('oak_leaves')).toBe(false);
      expect(isLogBlockName('oak_wood')).toBe(false);
    });

    it('should handle empty or null values', () => {
      expect(isLogBlockName('')).toBe(false);
      expect(isLogBlockName(null as any)).toBe(false);
      expect(isLogBlockName(undefined as any)).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isLogBlockName('OAK_LOG')).toBe(true);
      expect(isLogBlockName('Birch_Log')).toBe(true);
    });
  });

  describe('posKey', () => {
    it('should create key from Vec3', () => {
      const pos = new Vec3(10, 64, -20);
      expect(posKey(pos)).toBe('10,64,-20');
    });

    it('should handle negative coordinates', () => {
      const pos = new Vec3(-100, -60, -300);
      expect(posKey(pos)).toBe('-100,-60,-300');
    });

    it('should handle zero coordinates', () => {
      const pos = new Vec3(0, 0, 0);
      expect(posKey(pos)).toBe('0,0,0');
    });

    it('should handle decimal coordinates', () => {
      const pos = new Vec3(1.5, 2.5, 3.5);
      expect(posKey(pos)).toBe('1.5,2.5,3.5');
    });
  });

  describe('requiredToolCategoryForBlockName', () => {
    describe('pickaxe blocks', () => {
      it('should require pickaxe for ores', () => {
        expect(requiredToolCategoryForBlockName('iron_ore')).toBe('pickaxe');
        expect(requiredToolCategoryForBlockName('diamond_ore')).toBe('pickaxe');
        expect(requiredToolCategoryForBlockName('coal_ore')).toBe('pickaxe');
      });

      it('should require pickaxe for stone types', () => {
        expect(requiredToolCategoryForBlockName('stone')).toBe('pickaxe');
        expect(requiredToolCategoryForBlockName('cobblestone')).toBe('pickaxe');
        expect(requiredToolCategoryForBlockName('deepslate')).toBe('pickaxe');
      });

      it('should require pickaxe for other hard blocks', () => {
        expect(requiredToolCategoryForBlockName('obsidian')).toBe('pickaxe');
        expect(requiredToolCategoryForBlockName('netherrack')).toBe('pickaxe');
        expect(requiredToolCategoryForBlockName('end_stone')).toBe('pickaxe');
      });

      it('should require pickaxe for stone variants', () => {
        expect(requiredToolCategoryForBlockName('andesite')).toBe('pickaxe');
        expect(requiredToolCategoryForBlockName('granite')).toBe('pickaxe');
        expect(requiredToolCategoryForBlockName('diorite')).toBe('pickaxe');
      });
    });

    describe('axe blocks', () => {
      it('should require axe for logs', () => {
        expect(requiredToolCategoryForBlockName('oak_log')).toBe('axe');
        expect(requiredToolCategoryForBlockName('birch_log')).toBe('axe');
        expect(requiredToolCategoryForBlockName('spruce_log')).toBe('axe');
      });

      it('should require axe for planks', () => {
        expect(requiredToolCategoryForBlockName('oak_planks')).toBe('axe');
        expect(requiredToolCategoryForBlockName('birch_planks')).toBe('axe');
      });

      it('should require axe for nether wood', () => {
        expect(requiredToolCategoryForBlockName('warped_stem')).toBe('axe');
        expect(requiredToolCategoryForBlockName('crimson_hyphae')).toBe('axe');
      });
    });

    describe('shovel blocks', () => {
      it('should require shovel for soft blocks', () => {
        expect(requiredToolCategoryForBlockName('dirt')).toBe('shovel');
        expect(requiredToolCategoryForBlockName('sand')).toBe('shovel');
        expect(requiredToolCategoryForBlockName('gravel')).toBe('shovel');
      });

      it('should require shovel for other soft blocks', () => {
        expect(requiredToolCategoryForBlockName('snow')).toBe('shovel');
        expect(requiredToolCategoryForBlockName('clay')).toBe('shovel');
        expect(requiredToolCategoryForBlockName('soul_sand')).toBe('shovel');
        expect(requiredToolCategoryForBlockName('soul_soil')).toBe('shovel');
      });
    });

    describe('hoe blocks', () => {
      it('should require hoe for leaves', () => {
        expect(requiredToolCategoryForBlockName('oak_leaves')).toBe('hoe');
        expect(requiredToolCategoryForBlockName('birch_leaves')).toBe('hoe');
      });

      it('should require hoe for crops', () => {
        expect(requiredToolCategoryForBlockName('wheat')).toBe('hoe');
        expect(requiredToolCategoryForBlockName('carrots')).toBe('hoe');
        expect(requiredToolCategoryForBlockName('potatoes')).toBe('hoe');
        expect(requiredToolCategoryForBlockName('beetroots')).toBe('hoe');
      });

      it('should require hoe for hay', () => {
        expect(requiredToolCategoryForBlockName('hay_block')).toBe('hoe');
      });
    });

    describe('no specific tool', () => {
      it('should return null for hand-breakable blocks', () => {
        expect(requiredToolCategoryForBlockName('glass')).toBeNull();
        expect(requiredToolCategoryForBlockName('melon')).toBeNull();
        expect(requiredToolCategoryForBlockName('torch')).toBeNull();
      });
    });
  });

  describe('inventoryHasToolCategory', () => {
    describe('pickaxe detection', () => {
      it('should find diamond pickaxe', () => {
        const mockBot = {
          inventory: {
            items: () => [
              { name: 'stone', count: 64 },
              { name: 'diamond_pickaxe', count: 1 },
            ],
          },
        } as any;

        expect(inventoryHasToolCategory(mockBot, 'pickaxe')).toBe(true);
      });

      it('should find any pickaxe tier', () => {
        const tiers = [
          'wooden_pickaxe',
          'stone_pickaxe',
          'iron_pickaxe',
          'golden_pickaxe',
          'diamond_pickaxe',
          'netherite_pickaxe',
        ];

        for (const tier of tiers) {
          const mockBot = {
            inventory: {
              items: () => [{ name: tier, count: 1 }],
            },
          } as any;
          expect(inventoryHasToolCategory(mockBot, 'pickaxe')).toBe(true);
        }
      });

      it('should return false without pickaxe', () => {
        const mockBot = {
          inventory: {
            items: () => [
              { name: 'diamond_sword', count: 1 },
              { name: 'diamond_axe', count: 1 },
            ],
          },
        } as any;

        expect(inventoryHasToolCategory(mockBot, 'pickaxe')).toBe(false);
      });
    });

    describe('axe detection', () => {
      it('should find any axe tier', () => {
        const mockBot = {
          inventory: {
            items: () => [{ name: 'iron_axe', count: 1 }],
          },
        } as any;

        expect(inventoryHasToolCategory(mockBot, 'axe')).toBe(true);
      });
    });

    describe('shovel detection', () => {
      it('should find any shovel tier', () => {
        const mockBot = {
          inventory: {
            items: () => [{ name: 'stone_shovel', count: 1 }],
          },
        } as any;

        expect(inventoryHasToolCategory(mockBot, 'shovel')).toBe(true);
      });
    });

    describe('hoe detection', () => {
      it('should find any hoe tier', () => {
        const mockBot = {
          inventory: {
            items: () => [{ name: 'wooden_hoe', count: 1 }],
          },
        } as any;

        expect(inventoryHasToolCategory(mockBot, 'hoe')).toBe(true);
      });
    });

    describe('empty inventory', () => {
      it('should return false for empty inventory', () => {
        const mockBot = {
          inventory: {
            items: () => [],
          },
        } as any;

        expect(inventoryHasToolCategory(mockBot, 'pickaxe')).toBe(false);
        expect(inventoryHasToolCategory(mockBot, 'axe')).toBe(false);
        expect(inventoryHasToolCategory(mockBot, 'shovel')).toBe(false);
        expect(inventoryHasToolCategory(mockBot, 'hoe')).toBe(false);
      });
    });
  });

  describe('getAdjacentPositions', () => {
    it('should return 6 adjacent positions', () => {
      const pos = new Vec3(0, 0, 0);
      const adjacent = getAdjacentPositions(pos);

      expect(adjacent.length).toBe(6);
    });

    it('should include all cardinal directions', () => {
      const pos = new Vec3(10, 64, 20);
      const adjacent = getAdjacentPositions(pos);

      // Check all 6 directions
      expect(adjacent.some((p) => p.x === 11 && p.y === 64 && p.z === 20)).toBe(true); // +x
      expect(adjacent.some((p) => p.x === 9 && p.y === 64 && p.z === 20)).toBe(true); // -x
      expect(adjacent.some((p) => p.x === 10 && p.y === 65 && p.z === 20)).toBe(true); // +y
      expect(adjacent.some((p) => p.x === 10 && p.y === 63 && p.z === 20)).toBe(true); // -y
      expect(adjacent.some((p) => p.x === 10 && p.y === 64 && p.z === 21)).toBe(true); // +z
      expect(adjacent.some((p) => p.x === 10 && p.y === 64 && p.z === 19)).toBe(true); // -z
    });

    it('should not include the original position', () => {
      const pos = new Vec3(5, 5, 5);
      const adjacent = getAdjacentPositions(pos);

      expect(adjacent.some((p) => p.x === 5 && p.y === 5 && p.z === 5)).toBe(false);
    });

    it('should handle negative coordinates', () => {
      const pos = new Vec3(-10, -60, -20);
      const adjacent = getAdjacentPositions(pos);

      expect(adjacent.some((p) => p.x === -9)).toBe(true);
      expect(adjacent.some((p) => p.x === -11)).toBe(true);
      expect(adjacent.some((p) => p.y === -59)).toBe(true);
      expect(adjacent.some((p) => p.y === -61)).toBe(true);
    });
  });

  describe('collectBlockWithTimeout', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should fall back to dig when collectBlock plugin not loaded', async () => {
      const mockBot = {
        collectBlock: undefined,
        dig: vi.fn().mockResolvedValue(undefined),
      } as any;
      const mockBlock = { position: new Vec3(0, 0, 0), name: 'stone' } as any;

      await expect(collectBlockWithTimeout(mockBot, mockBlock))
        .resolves.not.toThrow();
      expect(mockBot.dig).toHaveBeenCalledWith(mockBlock);
    });

    it('should fall back to dig when collectBlock.collect not available', async () => {
      const mockBot = {
        collectBlock: {},
        dig: vi.fn().mockResolvedValue(undefined),
      } as any;
      const mockBlock = { position: new Vec3(0, 0, 0), name: 'stone' } as any;

      await expect(collectBlockWithTimeout(mockBot, mockBlock))
        .resolves.not.toThrow();
      expect(mockBot.dig).toHaveBeenCalledWith(mockBlock);
    });

    it('should successfully collect block', async () => {
      const mockBot = {
        collectBlock: {
          collect: vi.fn().mockResolvedValue(undefined),
        },
      } as any;
      const mockBlock = { position: new Vec3(0, 0, 0), name: 'stone' } as any;

      await expect(collectBlockWithTimeout(mockBot, mockBlock))
        .resolves.not.toThrow();
      expect(mockBot.collectBlock.collect).toHaveBeenCalledWith(mockBlock);
    });

    it('should timeout if collect takes too long', async () => {
      const mockBot = {
        collectBlock: {
          collect: vi.fn().mockImplementation(() => new Promise(() => {})), // Never resolves
          cancelTask: vi.fn(),
        },
      } as any;
      const mockBlock = { position: new Vec3(0, 0, 0), name: 'stone' } as any;

      await expect(collectBlockWithTimeout(mockBot, mockBlock, 50))
        .rejects.toThrow('collect_timeout');
      expect(mockBot.collectBlock.cancelTask).toHaveBeenCalled();
    });

    it('should propagate collect error', async () => {
      const mockBot = {
        collectBlock: {
          collect: vi.fn().mockRejectedValue(new Error('Block unreachable')),
          cancelTask: vi.fn(),
        },
      } as any;
      const mockBlock = { position: new Vec3(0, 0, 0), name: 'stone' } as any;

      await expect(collectBlockWithTimeout(mockBot, mockBlock))
        .rejects.toThrow('Block unreachable');
    });

    it('should handle cancelTask being undefined', async () => {
      const mockBot = {
        collectBlock: {
          collect: vi.fn().mockImplementation(() => new Promise(() => {})),
          // cancelTask is undefined
        },
      } as any;
      const mockBlock = { position: new Vec3(0, 0, 0), name: 'stone' } as any;

      await expect(collectBlockWithTimeout(mockBot, mockBlock, 50))
        .rejects.toThrow('collect_timeout');
    });
  });

  describe('digBlockWithTimeout', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should successfully dig block', async () => {
      const mockBot = {
        dig: vi.fn().mockResolvedValue(undefined),
      } as any;
      const mockBlock = { position: new Vec3(0, 0, 0), name: 'stone' } as any;

      await expect(digBlockWithTimeout(mockBot, mockBlock))
        .resolves.not.toThrow();
      expect(mockBot.dig).toHaveBeenCalledWith(mockBlock);
    });

    it('should timeout if dig takes too long', async () => {
      const mockBot = {
        dig: vi.fn().mockImplementation(() => new Promise(() => {})), // Never resolves
        stopDigging: vi.fn(),
      } as any;
      const mockBlock = { position: new Vec3(0, 0, 0), name: 'stone' } as any;

      await expect(digBlockWithTimeout(mockBot, mockBlock, 50))
        .rejects.toThrow('dig_timeout');
      expect(mockBot.stopDigging).toHaveBeenCalled();
    });

    it('should propagate dig error', async () => {
      const mockBot = {
        dig: vi.fn().mockRejectedValue(new Error('Cannot dig')),
      } as any;
      const mockBlock = { position: new Vec3(0, 0, 0), name: 'stone' } as any;

      await expect(digBlockWithTimeout(mockBot, mockBlock))
        .rejects.toThrow('Cannot dig');
    });

    it('should handle stopDigging being undefined', async () => {
      const mockBot = {
        dig: vi.fn().mockImplementation(() => new Promise(() => {})),
        // stopDigging is undefined
      } as any;
      const mockBlock = { position: new Vec3(0, 0, 0), name: 'stone' } as any;

      await expect(digBlockWithTimeout(mockBot, mockBlock, 50))
        .rejects.toThrow('dig_timeout');
    });

    it('should respect custom timeout', async () => {
      const mockBot = {
        dig: vi.fn().mockImplementation(() => new Promise(() => {})),
        stopDigging: vi.fn(),
      } as any;
      const mockBlock = { position: new Vec3(0, 0, 0), name: 'stone' } as any;

      const startTime = Date.now();
      await expect(digBlockWithTimeout(mockBot, mockBlock, 100))
        .rejects.toThrow('dig_timeout');
      const elapsed = Date.now() - startTime;

      // Should timeout around 100ms (allow some variance)
      expect(elapsed).toBeGreaterThanOrEqual(90);
      expect(elapsed).toBeLessThan(300);
    });

    it('should handle stopDigging throwing error', async () => {
      const mockBot = {
        dig: vi.fn().mockImplementation(() => new Promise(() => {})),
        stopDigging: vi.fn().mockImplementation(() => {
          throw new Error('Stop failed');
        }),
      } as any;
      const mockBlock = { position: new Vec3(0, 0, 0), name: 'stone' } as any;

      // Should still throw dig_timeout even if stopDigging throws
      await expect(digBlockWithTimeout(mockBot, mockBlock, 50))
        .rejects.toThrow('dig_timeout');
    });
  });
});
