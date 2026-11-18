/**
 * Tests for block-helpers.ts
 */

import { describe, it, expect } from 'vitest';
import { Vec3 } from 'vec3';
import {
  isWaterLike,
  isPlantObstruction,
  isClearToSkyAt,
  resolveBlockAliases,
  isFarmland,
  isMatureCrop,
  getBlockBelow,
  isSafePosition,
} from '../../../src/utils/block-helpers.js';

describe('Block Helpers', () => {
  describe('isWaterLike', () => {
    it('should return true for water block', () => {
      expect(isWaterLike({ name: 'water' })).toBe(true);
    });

    it('should be case insensitive', () => {
      expect(isWaterLike({ name: 'Water' })).toBe(true);
      expect(isWaterLike({ name: 'WATER' })).toBe(true);
    });

    it('should return false for other blocks', () => {
      expect(isWaterLike({ name: 'lava' })).toBe(false);
      expect(isWaterLike({ name: 'stone' })).toBe(false);
      expect(isWaterLike({ name: 'air' })).toBe(false);
    });

    it('should return false for null', () => {
      expect(isWaterLike(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isWaterLike(undefined)).toBe(false);
    });

    it('should handle block without name', () => {
      expect(isWaterLike({})).toBe(false);
    });
  });

  describe('isPlantObstruction', () => {
    describe('grass types', () => {
      it('should identify grass', () => {
        expect(isPlantObstruction('grass')).toBe(true);
        expect(isPlantObstruction('tall_grass')).toBe(true);
        expect(isPlantObstruction('fern')).toBe(true);
        expect(isPlantObstruction('large_fern')).toBe(true);
      });

      it('should identify dead bush', () => {
        expect(isPlantObstruction('dead_bush')).toBe(true);
      });
    });

    describe('flowers', () => {
      it('should identify common flowers', () => {
        expect(isPlantObstruction('dandelion')).toBe(true);
        expect(isPlantObstruction('poppy')).toBe(true);
        expect(isPlantObstruction('blue_orchid')).toBe(true);
        expect(isPlantObstruction('allium')).toBe(true);
        expect(isPlantObstruction('azure_bluet')).toBe(true);
        expect(isPlantObstruction('oxeye_daisy')).toBe(true);
        expect(isPlantObstruction('cornflower')).toBe(true);
      });

      it('should identify tulips', () => {
        expect(isPlantObstruction('red_tulip')).toBe(true);
        expect(isPlantObstruction('orange_tulip')).toBe(true);
        expect(isPlantObstruction('white_tulip')).toBe(true);
        expect(isPlantObstruction('pink_tulip')).toBe(true);
      });

      it('should identify tall flowers', () => {
        expect(isPlantObstruction('sunflower')).toBe(true);
        expect(isPlantObstruction('lilac')).toBe(true);
        expect(isPlantObstruction('rose_bush')).toBe(true);
        expect(isPlantObstruction('peony')).toBe(true);
      });

      it('should identify rare flowers', () => {
        expect(isPlantObstruction('lily_of_the_valley')).toBe(true);
        expect(isPlantObstruction('wither_rose')).toBe(true);
      });
    });

    describe('non-plant blocks', () => {
      it('should return false for solid blocks', () => {
        expect(isPlantObstruction('stone')).toBe(false);
        expect(isPlantObstruction('dirt')).toBe(false);
        expect(isPlantObstruction('oak_log')).toBe(false);
      });

      it('should return false for crops', () => {
        expect(isPlantObstruction('wheat')).toBe(false);
        expect(isPlantObstruction('carrots')).toBe(false);
      });
    });

    it('should be case insensitive', () => {
      expect(isPlantObstruction('GRASS')).toBe(true);
      expect(isPlantObstruction('Dandelion')).toBe(true);
    });
  });

  describe('isClearToSkyAt', () => {
    it('should return true when no blocks above', () => {
      const mockBot = {
        blockAt: () => ({ boundingBox: 'empty' }),
      } as any;

      const pos = new Vec3(0, 64, 0);
      expect(isClearToSkyAt(mockBot, pos)).toBe(true);
    });

    it('should return false when solid block above', () => {
      const mockBot = {
        blockAt: (p: Vec3) => {
          if (p.y === 70) return { boundingBox: 'block' };
          return { boundingBox: 'empty' };
        },
      } as any;

      const pos = new Vec3(0, 64, 0);
      expect(isClearToSkyAt(mockBot, pos)).toBe(false);
    });

    it('should return false when null block found', () => {
      const mockBot = {
        blockAt: (p: Vec3) => {
          if (p.y === 65) return null;
          return { boundingBox: 'empty' };
        },
      } as any;

      const pos = new Vec3(0, 64, 0);
      expect(isClearToSkyAt(mockBot, pos)).toBe(true);
    });

    it('should handle errors gracefully', () => {
      const mockBot = {
        blockAt: () => {
          throw new Error('Test error');
        },
      } as any;

      const pos = new Vec3(0, 64, 0);
      expect(isClearToSkyAt(mockBot, pos)).toBe(false);
    });
  });

  describe('resolveBlockAliases', () => {
    const mockMcData = {
      blocksByName: {
        oak_log: {},
        birch_log: {},
        spruce_log: {},
        oak_planks: {},
        birch_planks: {},
        red_bed: {},
        blue_bed: {},
        iron_ore: {},
        gold_ore: {},
        oak_leaves: {},
        birch_leaves: {},
        stone: {},
        cobblestone: {},
      },
    };

    it('should resolve log alias', () => {
      const result = resolveBlockAliases('log', mockMcData);
      expect(result).toContain('oak_log');
      expect(result).toContain('birch_log');
      expect(result).toContain('spruce_log');
      expect(result).not.toContain('oak_planks');
    });

    it('should resolve planks alias', () => {
      const result = resolveBlockAliases('planks', mockMcData);
      expect(result).toContain('oak_planks');
      expect(result).toContain('birch_planks');
      expect(result).not.toContain('oak_log');
    });

    it('should resolve bed alias', () => {
      const result = resolveBlockAliases('bed', mockMcData);
      expect(result).toContain('red_bed');
      expect(result).toContain('blue_bed');
    });

    it('should resolve ore alias', () => {
      const result = resolveBlockAliases('ore', mockMcData);
      expect(result).toContain('iron_ore');
      expect(result).toContain('gold_ore');
    });

    it('should resolve leaves alias', () => {
      const result = resolveBlockAliases('leaves', mockMcData);
      expect(result).toContain('oak_leaves');
      expect(result).toContain('birch_leaves');
    });

    it('should find blocks containing search term', () => {
      const result = resolveBlockAliases('stone', mockMcData);
      expect(result).toContain('stone');
      expect(result).toContain('cobblestone');
    });

    it('should be case insensitive', () => {
      const result = resolveBlockAliases('LOG', mockMcData);
      expect(result).toContain('oak_log');
    });
  });

  describe('isFarmland', () => {
    it('should return true for farmland block', () => {
      expect(isFarmland({ name: 'farmland' })).toBe(true);
    });

    it('should return false for other blocks', () => {
      expect(isFarmland({ name: 'dirt' })).toBe(false);
      expect(isFarmland({ name: 'grass_block' })).toBe(false);
      expect(isFarmland({ name: 'coarse_dirt' })).toBe(false);
    });

    it('should return false for null', () => {
      expect(isFarmland(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isFarmland(undefined)).toBe(false);
    });
  });

  describe('isMatureCrop', () => {
    describe('wheat', () => {
      it('should return true for mature wheat (age 7)', () => {
        const block = {
          name: 'wheat',
          getProperties: () => ({ age: 7 }),
        };
        expect(isMatureCrop(block)).toBe(true);
      });

      it('should return false for immature wheat', () => {
        const block = {
          name: 'wheat',
          getProperties: () => ({ age: 3 }),
        };
        expect(isMatureCrop(block)).toBe(false);
      });
    });

    describe('carrots', () => {
      it('should return true for mature carrots (age 7)', () => {
        const block = {
          name: 'carrots',
          getProperties: () => ({ age: 7 }),
        };
        expect(isMatureCrop(block)).toBe(true);
      });
    });

    describe('potatoes', () => {
      it('should return true for mature potatoes (age 7)', () => {
        const block = {
          name: 'potatoes',
          getProperties: () => ({ age: 7 }),
        };
        expect(isMatureCrop(block)).toBe(true);
      });
    });

    describe('beetroots', () => {
      it('should return true for mature beetroots (age 3)', () => {
        const block = {
          name: 'beetroots',
          getProperties: () => ({ age: 3 }),
        };
        expect(isMatureCrop(block)).toBe(true);
      });

      it('should return false for immature beetroots', () => {
        const block = {
          name: 'beetroots',
          getProperties: () => ({ age: 2 }),
        };
        expect(isMatureCrop(block)).toBe(false);
      });
    });

    describe('non-crops', () => {
      it('should return false for non-crop blocks', () => {
        const block = {
          name: 'stone',
          getProperties: () => ({}),
        };
        expect(isMatureCrop(block)).toBe(false);
      });
    });

    it('should return false for null', () => {
      expect(isMatureCrop(null)).toBe(false);
    });

    it('should handle metadata fallback', () => {
      const block = {
        name: 'wheat',
        metadata: 7,
      };
      expect(isMatureCrop(block)).toBe(true);
    });
  });

  describe('getBlockBelow', () => {
    it('should return block at y-1', () => {
      const expectedBlock = { name: 'stone' };
      const mockBot = {
        blockAt: (pos: Vec3) => {
          if (pos.y === 63) return expectedBlock;
          return null;
        },
      } as any;

      const pos = new Vec3(10, 64, 20);
      expect(getBlockBelow(mockBot, pos)).toBe(expectedBlock);
    });
  });

  describe('isSafePosition', () => {
    it('should return true for safe position', () => {
      const mockBot = {
        blockAt: (pos: Vec3) => {
          if (pos.y === 63) return { name: 'stone', boundingBox: 'block' }; // Below
          if (pos.y === 64) return { name: 'air', boundingBox: 'empty' }; // Feet
          if (pos.y === 65) return { name: 'air', boundingBox: 'empty' }; // Head
          return null;
        },
      } as any;

      const pos = new Vec3(0, 64, 0);
      expect(isSafePosition(mockBot, pos)).toBe(true);
    });

    it('should return false without solid ground', () => {
      const mockBot = {
        blockAt: (pos: Vec3) => {
          if (pos.y === 63) return { name: 'air', boundingBox: 'empty' }; // Below (air)
          if (pos.y === 64) return { name: 'air', boundingBox: 'empty' }; // Feet
          if (pos.y === 65) return { name: 'air', boundingBox: 'empty' }; // Head
          return null;
        },
      } as any;

      const pos = new Vec3(0, 64, 0);
      expect(isSafePosition(mockBot, pos)).toBe(false);
    });

    it('should return false if block at feet', () => {
      const mockBot = {
        blockAt: (pos: Vec3) => {
          if (pos.y === 63) return { name: 'stone', boundingBox: 'block' }; // Below
          if (pos.y === 64) return { name: 'stone', boundingBox: 'block' }; // Feet (blocked)
          if (pos.y === 65) return { name: 'air', boundingBox: 'empty' }; // Head
          return null;
        },
      } as any;

      const pos = new Vec3(0, 64, 0);
      expect(isSafePosition(mockBot, pos)).toBe(false);
    });

    it('should return false if block at head', () => {
      const mockBot = {
        blockAt: (pos: Vec3) => {
          if (pos.y === 63) return { name: 'stone', boundingBox: 'block' }; // Below
          if (pos.y === 64) return { name: 'air', boundingBox: 'empty' }; // Feet
          if (pos.y === 65) return { name: 'stone', boundingBox: 'block' }; // Head (blocked)
          return null;
        },
      } as any;

      const pos = new Vec3(0, 64, 0);
      expect(isSafePosition(mockBot, pos)).toBe(false);
    });

    it('should return false if standing in water', () => {
      const mockBot = {
        blockAt: (pos: Vec3) => {
          if (pos.y === 63) return { name: 'stone', boundingBox: 'block' }; // Below
          if (pos.y === 64) return { name: 'water', boundingBox: 'empty' }; // Feet (water)
          if (pos.y === 65) return { name: 'air', boundingBox: 'empty' }; // Head
          return null;
        },
      } as any;

      const pos = new Vec3(0, 64, 0);
      expect(isSafePosition(mockBot, pos)).toBe(false);
    });

    it('should return false if ground is water', () => {
      const mockBot = {
        blockAt: (pos: Vec3) => {
          if (pos.y === 63) return { name: 'water', boundingBox: 'empty' }; // Below (water)
          if (pos.y === 64) return { name: 'air', boundingBox: 'empty' }; // Feet
          if (pos.y === 65) return { name: 'air', boundingBox: 'empty' }; // Head
          return null;
        },
      } as any;

      const pos = new Vec3(0, 64, 0);
      expect(isSafePosition(mockBot, pos)).toBe(false);
    });

    it('should return false if no block below', () => {
      const mockBot = {
        blockAt: (pos: Vec3) => {
          if (pos.y === 63) return null; // Below (nothing)
          if (pos.y === 64) return { name: 'air', boundingBox: 'empty' }; // Feet
          if (pos.y === 65) return { name: 'air', boundingBox: 'empty' }; // Head
          return null;
        },
      } as any;

      const pos = new Vec3(0, 64, 0);
      expect(isSafePosition(mockBot, pos)).toBe(false);
    });
  });
});
