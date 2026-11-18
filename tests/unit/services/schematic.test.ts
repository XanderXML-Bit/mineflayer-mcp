/**
 * Schematic Service Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Bot } from 'mineflayer';
import type { Item } from 'prismarine-item';

import {
  initializeSchematicService,
  configureSchematicService,
  getSchematicStatus,
  loadSchematic,
  unloadSchematic,
  calculateMaterials,
  getBuildProgress,
  pauseBuild,
  resumeBuild,
  stopBuild,
  resetFailedBlocks,
  createSchematicFromArray,
  createSchematicFromTemplate,
  DEFAULT_SCHEMATIC_CONFIG,
} from '../../../src/services/schematic.service.js';

function createMockBot(): Bot {
  const inventory = {
    items: vi.fn().mockReturnValue([]),
    slots: {} as Record<number, Item | null>,
  };

  const bot = {
    username: 'TestBot',
    entity: {
      position: { x: 0, y: 64, z: 0 },
    },
    entities: {},
    inventory,
    health: 20,
    game: { dimension: 'minecraft:overworld' },
    equip: vi.fn().mockResolvedValue(undefined),
    placeBlock: vi.fn().mockResolvedValue(undefined),
    blockAt: vi.fn().mockReturnValue({ name: 'air' }),
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
  } as unknown as Bot;

  return bot;
}

function createMockBlock(name: string): Item {
  return {
    name,
    count: 64,
    type: 0,
    slot: 0,
  } as Item;
}

describe('SchematicService', () => {
  let bot: Bot;

  beforeEach(() => {
    bot = createMockBot();
  });

  afterEach(() => {
    unloadSchematic(bot);
    vi.clearAllMocks();
  });

  describe('DEFAULT_SCHEMATIC_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_SCHEMATIC_CONFIG.enabled).toBe(true);
      expect(DEFAULT_SCHEMATIC_CONFIG.placementDelayMs).toBe(250);
      expect(DEFAULT_SCHEMATIC_CONFIG.maxAttempts).toBe(3);
      expect(DEFAULT_SCHEMATIC_CONFIG.placementRange).toBe(4);
      expect(DEFAULT_SCHEMATIC_CONFIG.checkMaterials).toBe(true);
      expect(DEFAULT_SCHEMATIC_CONFIG.bottomUp).toBe(true);
    });
  });

  describe('initializeSchematicService', () => {
    it('should initialize with default config', () => {
      initializeSchematicService(bot);
      const status = getSchematicStatus(bot);

      expect(status.enabled).toBe(true);
      expect(status.config.placementDelayMs).toBe(250);
    });

    it('should accept custom config', () => {
      initializeSchematicService(bot, { placementDelayMs: 500 });
      const status = getSchematicStatus(bot);

      expect(status.config.placementDelayMs).toBe(500);
    });
  });

  describe('configureSchematicService', () => {
    it('should update config', () => {
      initializeSchematicService(bot);
      configureSchematicService(bot, { maxAttempts: 5 });

      expect(getSchematicStatus(bot).config.maxAttempts).toBe(5);
    });
  });

  describe('getSchematicStatus', () => {
    it('should return current status', () => {
      initializeSchematicService(bot);
      const status = getSchematicStatus(bot);

      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('config');
      expect(status).toHaveProperty('hasSchematic');
      expect(status).toHaveProperty('isBuilding');
      expect(status).toHaveProperty('isPaused');
    });

    it('should report no schematic when empty', () => {
      initializeSchematicService(bot);
      const status = getSchematicStatus(bot);

      expect(status.hasSchematic).toBe(false);
    });
  });

  describe('createSchematicFromArray', () => {
    it('should create schematic from block array', () => {
      const blocks = [
        [
          ['stone', 'stone'],
          ['stone', 'stone'],
        ],
        [
          ['stone', 'stone'],
          ['stone', 'stone'],
        ],
      ];

      const schematic = createSchematicFromArray('test', blocks, { x: 0, y: 64, z: 0 });

      expect(schematic.name).toBe('test');
      expect(schematic.width).toBe(2);
      expect(schematic.height).toBe(2);
      expect(schematic.length).toBe(2);
      expect(schematic.blocks.length).toBe(8);
    });

    it('should filter out air blocks', () => {
      const blocks = [
        [
          ['stone', 'air'],
          ['air', 'stone'],
        ],
      ];

      const schematic = createSchematicFromArray('test', blocks, { x: 0, y: 64, z: 0 });

      expect(schematic.blocks.length).toBe(2);
    });
  });

  describe('createSchematicFromTemplate', () => {
    it('should create schematic from template string', () => {
      const template = `
##
##

##
##
`;
      const blockMap = { '#': 'stone', ' ': 'air' };
      const schematic = createSchematicFromTemplate('test', template, blockMap, { x: 0, y: 64, z: 0 });

      expect(schematic).not.toBeNull();
      expect(schematic.name).toBe('test');
      expect(schematic.blocks.length).toBeGreaterThan(0);
    });

    it('should map characters to blocks', () => {
      const template = `
#O
O#
`;
      const blockMap = { '#': 'stone', 'O': 'cobblestone' };
      const schematic = createSchematicFromTemplate('test', template, blockMap, { x: 0, y: 64, z: 0 });

      const stoneBlocks = schematic.blocks.filter(b => b.blockName === 'stone');
      const cobbleBlocks = schematic.blocks.filter(b => b.blockName === 'cobblestone');

      expect(stoneBlocks.length).toBe(2);
      expect(cobbleBlocks.length).toBe(2);
    });

    it('should default unknown characters to air', () => {
      const template = `
#.
.#
`;
      const blockMap = { '#': 'stone' };
      const schematic = createSchematicFromTemplate('test', template, blockMap, { x: 0, y: 64, z: 0 });

      // Only stone blocks should be in the list (air is filtered)
      const stoneBlocks = schematic.blocks.filter(b => b.blockName === 'stone');
      expect(stoneBlocks.length).toBe(2);
    });
  });

  describe('loadSchematic', () => {
    it('should load a schematic', () => {
      initializeSchematicService(bot);

      const schematic = createSchematicFromArray('test', [[['stone']]], { x: 0, y: 64, z: 0 });
      loadSchematic(bot, schematic);

      const status = getSchematicStatus(bot);
      expect(status.hasSchematic).toBe(true);
      expect(status.schematicName).toBe('test');
    });
  });

  describe('calculateMaterials', () => {
    it('should return null when no schematic loaded', () => {
      initializeSchematicService(bot);

      const materials = calculateMaterials(bot);

      expect(materials).toBeNull();
    });

    it('should calculate required materials', () => {
      initializeSchematicService(bot);

      const schematic = createSchematicFromArray(
        'test',
        [[['stone', 'stone'], ['cobblestone', 'cobblestone']]],
        { x: 0, y: 64, z: 0 }
      );
      loadSchematic(bot, schematic);

      const materials = calculateMaterials(bot);

      expect(materials).not.toBeNull();
      expect(materials?.blocks.get('stone')).toBe(2);
      expect(materials?.blocks.get('cobblestone')).toBe(2);
      expect(materials?.total).toBe(4);
    });

    it('should detect missing materials', () => {
      initializeSchematicService(bot);
      (bot.inventory.items as any).mockReturnValue([]);

      const schematic = createSchematicFromArray('test', [[['stone']]], { x: 0, y: 64, z: 0 });
      loadSchematic(bot, schematic);

      const materials = calculateMaterials(bot);

      expect(materials?.canBuild).toBe(false);
      expect(materials?.missing.get('stone')).toBe(1);
    });

    it('should detect available materials', () => {
      initializeSchematicService(bot);
      (bot.inventory.items as any).mockReturnValue([createMockBlock('stone')]);

      const schematic = createSchematicFromArray('test', [[['stone']]], { x: 0, y: 64, z: 0 });
      loadSchematic(bot, schematic);

      const materials = calculateMaterials(bot);

      expect(materials?.canBuild).toBe(true);
    });
  });

  describe('getBuildProgress', () => {
    it('should return null when no schematic loaded', () => {
      initializeSchematicService(bot);

      const progress = getBuildProgress(bot);

      expect(progress).toBeNull();
    });

    it('should return progress when schematic loaded', () => {
      initializeSchematicService(bot);

      const schematic = createSchematicFromArray('test', [[['stone', 'stone']]], { x: 0, y: 64, z: 0 });
      loadSchematic(bot, schematic);

      const progress = getBuildProgress(bot);

      expect(progress).not.toBeNull();
      expect(progress?.total).toBe(2);
      expect(progress?.placed).toBe(0);
      expect(progress?.remaining).toBe(2);
      expect(progress?.percentComplete).toBe(0);
    });
  });

  describe('pauseBuild / resumeBuild', () => {
    it('should pause build', () => {
      initializeSchematicService(bot);
      const schematic = createSchematicFromArray('test', [[['stone']]], { x: 0, y: 64, z: 0 });
      loadSchematic(bot, schematic);

      pauseBuild(bot);

      expect(getSchematicStatus(bot).isPaused).toBe(true);
    });

    it('should resume build', () => {
      initializeSchematicService(bot);
      const schematic = createSchematicFromArray('test', [[['stone']]], { x: 0, y: 64, z: 0 });
      loadSchematic(bot, schematic);

      pauseBuild(bot);
      resumeBuild(bot);

      expect(getSchematicStatus(bot).isPaused).toBe(false);
    });
  });

  describe('stopBuild', () => {
    it('should stop build', () => {
      initializeSchematicService(bot);
      const schematic = createSchematicFromArray('test', [[['stone']]], { x: 0, y: 64, z: 0 });
      loadSchematic(bot, schematic);

      stopBuild(bot);

      expect(getSchematicStatus(bot).isBuilding).toBe(false);
    });
  });

  describe('resetFailedBlocks', () => {
    it('should reset failed blocks count', () => {
      initializeSchematicService(bot);
      const schematic = createSchematicFromArray('test', [[['stone']]], { x: 0, y: 64, z: 0 });
      loadSchematic(bot, schematic);

      const count = resetFailedBlocks(bot);

      expect(count).toBe(0); // No failed blocks initially
    });
  });

  describe('unloadSchematic', () => {
    it('should unload schematic', () => {
      initializeSchematicService(bot);
      const schematic = createSchematicFromArray('test', [[['stone']]], { x: 0, y: 64, z: 0 });
      loadSchematic(bot, schematic);

      unloadSchematic(bot);

      expect(getSchematicStatus(bot).hasSchematic).toBe(false);
    });

    it('should handle unload when nothing loaded', () => {
      initializeSchematicService(bot);
      unloadSchematic(bot); // Should not throw
    });
  });
});
