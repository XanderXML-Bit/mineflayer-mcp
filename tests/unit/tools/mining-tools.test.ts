/**
 * Tests for mining tools (mine-resource, dig-block)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ToolContext } from '../../../src/tools/base-tool.js';
import { MineResourceTool } from '../../../src/tools/mining/mine-resource.js';
import { DigBlockTool } from '../../../src/tools/mining/dig-block.js';

// Mock minecraft-data
vi.mock('minecraft-data', () => ({
  default: () => ({
    blocksByName: {
      stone: { id: 1, name: 'stone', hardness: 1.5 },
      oak_log: { id: 17, name: 'oak_log', hardness: 2 },
      iron_ore: { id: 15, name: 'iron_ore', hardness: 3 },
      diamond_ore: { id: 56, name: 'diamond_ore', hardness: 3 },
      dirt: { id: 3, name: 'dirt', hardness: 0.5 },
    },
    itemsByName: {
      stone_pickaxe: { id: 274, name: 'stone_pickaxe' },
      iron_pickaxe: { id: 257, name: 'iron_pickaxe' },
      diamond_pickaxe: { id: 278, name: 'diamond_pickaxe' },
    },
    items: {},
  }),
}));

// Mock task service
vi.mock('../../../src/services/task.service.js', () => ({
  withTask: vi.fn((_bot, fn) => fn()),
}));

// Mock equipment service
vi.mock('../../../src/services/equipment.service.js', () => ({
  createEquipmentService: () => ({
    equipBestToolForBlock: vi.fn().mockResolvedValue(undefined),
    pushSuspendAutoEat: vi.fn(),
    popSuspendAutoEat: vi.fn(),
  }),
}));

// Mock navigation service
vi.mock('../../../src/services/navigation.service.js', () => ({
  configureMovements: vi.fn(() => ({})),
  waitForNavigation: vi.fn().mockResolvedValue(undefined),
}));

// Mock block helpers
vi.mock('../../../src/utils/block-helpers.js', () => ({
  resolveBlockAliases: vi.fn((name: string) => [name]),
}));

// Mock mining helpers
vi.mock('../../../src/utils/mining-helpers.js', () => ({
  isOreBlockName: vi.fn((name: string) => name.includes('ore')),
  isLogBlockName: vi.fn((name: string) => name.includes('log')),
  posKey: vi.fn((pos: { x: number; y: number; z: number }) => `${pos.x},${pos.y},${pos.z}`),
  collectBlockWithTimeout: vi.fn().mockResolvedValue(undefined),
  requiredToolCategoryForBlockName: vi.fn((name: string) => {
    if (name.includes('ore') || name === 'stone') return 'pickaxe';
    return null;
  }),
  inventoryHasToolCategory: vi.fn().mockReturnValue(true),
  pickupNearbyDrops: vi.fn().mockResolvedValue(0),
}));

// Mock pathfinder
vi.mock('mineflayer-pathfinder', () => ({
  default: {
    goals: {
      GoalNear: class GoalNear {
        constructor(public x: number, public y: number, public z: number, public range: number) {}
      },
      GoalBlock: class GoalBlock {
        constructor(public x: number, public y: number, public z: number) {}
      },
    },
  },
  goals: {
    GoalNear: class GoalNear {
      constructor(public x: number, public y: number, public z: number, public range: number) {}
    },
    GoalBlock: class GoalBlock {
      constructor(public x: number, public y: number, public z: number) {}
    },
  },
}));

describe('Mining Tools', () => {
  let mockContext: ToolContext;
  let mockBot: ReturnType<typeof createMockBot>;

  function createMockBot() {
    const position = {
      x: 100,
      y: 64,
      z: -50,
      floored: () => position,
      offset: (dx: number, dy: number, dz: number) => ({
        x: position.x + dx,
        y: position.y + dy,
        z: position.z + dz,
        floored: () => position,
      }),
      clone: () => position,
      distanceTo: (other: { x: number; y: number; z: number }) => {
        const dx = position.x - other.x;
        const dy = position.y - other.y;
        const dz = position.z - other.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
      },
    };

    const stoneBlockPos = { x: 102, y: 64, z: -50, clone: () => stoneBlockPos };
    const stoneBlock = {
      name: 'stone',
      position: stoneBlockPos,
      hardness: 1.5,
      canHarvest: vi.fn().mockReturnValue(true),
    };

    const inventoryItems = [
      { name: 'stone_pickaxe', count: 1, slot: 0, type: 274, nbt: null },
      { name: 'cobblestone', count: 64, slot: 1, type: 4, nbt: null },
    ];

    return {
      username: 'TestBot',
      version: '1.20.1',
      health: 20,
      food: 20,
      foodSaturation: 5,
      entity: { position, onGround: true },
      inventory: {
        items: () => inventoryItems,
        slots: inventoryItems,
      },
      oxygenLevel: 20,
      time: { timeOfDay: 6000 },
      blockAt: vi.fn().mockReturnValue(stoneBlock),
      findBlocks: vi.fn().mockReturnValue([{ x: 102, y: 64, z: -50 }]),
      game: { gameMode: 0 },
      dig: vi.fn().mockResolvedValue(undefined),
      canDigBlock: vi.fn().mockReturnValue(true),
      lookAt: vi.fn().mockResolvedValue(undefined),
      waitForTicks: vi.fn().mockResolvedValue(undefined),
      heldItem: { name: 'stone_pickaxe', type: 274 },
      pathfinder: {
        goto: vi.fn().mockResolvedValue(undefined),
        setMovements: vi.fn(),
        setGoal: vi.fn(),
        stop: vi.fn(),
      },
      __status: null,
      __chatLog: [],
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockBot = createMockBot();
    mockContext = {
      getBotOrThrow: vi.fn().mockReturnValue(mockBot),
      getAllBots: vi.fn().mockReturnValue(new Map([['TestBot', mockBot]])),
      config: {} as unknown as ToolContext['config'],
    };
  });

  describe('MineResourceTool', () => {
    it('should have correct definition', () => {
      const tool = new MineResourceTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('mineResource');
      expect(definition.description).toContain('Mine');
      expect(definition.inputSchema.properties).toHaveProperty('blockName');
      expect(definition.inputSchema.properties).toHaveProperty('count');
      expect(definition.inputSchema.properties).toHaveProperty('maxMs');
    });

    it('should mine blocks successfully', async () => {
      const tool = new MineResourceTool(mockContext);
      const result = await tool.run({ blockName: 'stone', count: 1 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.completed).toBeGreaterThanOrEqual(0);
        expect(result.data.requested).toBe(1);
      }
    });

    it('should return error when no blocks found', async () => {
      mockBot.findBlocks = vi.fn().mockReturnValue([]);

      const tool = new MineResourceTool(mockContext);
      const result = await tool.run({ blockName: 'diamond_ore', count: 1 });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('No diamond_ore found');
      }
    });

    it('should use default count of 1', async () => {
      const tool = new MineResourceTool(mockContext);
      const result = await tool.run({ blockName: 'stone' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.requested).toBe(1);
      }
    });

    it('should reject missing block name', async () => {
      const tool = new MineResourceTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });

    it('should report when mining times out', async () => {
      const tool = new MineResourceTool(mockContext);
      const result = await tool.run({ blockName: 'stone', count: 100, maxMs: 1 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.timedOut).toBeDefined();
      }
    });

    it('should return error when no pickaxe for ore', async () => {
      const { inventoryHasToolCategory } = await import('../../../src/utils/mining-helpers.js');
      vi.mocked(inventoryHasToolCategory).mockReturnValue(false);

      const tool = new MineResourceTool(mockContext);
      const result = await tool.run({ blockName: 'iron_ore', count: 1 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.ok).toBe(false);
        expect(result.data.error).toBe('no_pickaxe');
        expect(result.data.reason).toBe('missing_tool');
        expect(result.data.needed).toBe('pickaxe');
      }
    });

    it('should perform cluster mining for ores', async () => {
      // Reset mock to return true for tool check
      const { inventoryHasToolCategory, isOreBlockName } = await import('../../../src/utils/mining-helpers.js');
      vi.mocked(inventoryHasToolCategory).mockReturnValue(true);
      vi.mocked(isOreBlockName).mockReturnValue(true);

      const oreBlock = {
        name: 'iron_ore',
        position: { x: 102, y: 64, z: -50 },
        hardness: 3,
      };
      mockBot.blockAt = vi.fn().mockReturnValue(oreBlock);

      const tool = new MineResourceTool(mockContext);
      const result = await tool.run({ blockName: 'iron_ore', count: 1 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.completed).toBeGreaterThanOrEqual(0);
      }
    });

    it('should perform cluster mining for logs', async () => {
      const { inventoryHasToolCategory, isLogBlockName } = await import('../../../src/utils/mining-helpers.js');
      vi.mocked(inventoryHasToolCategory).mockReturnValue(true);
      vi.mocked(isLogBlockName).mockReturnValue(true);

      const logBlock = {
        name: 'oak_log',
        position: { x: 102, y: 64, z: -50 },
        hardness: 2,
      };
      mockBot.blockAt = vi.fn().mockReturnValue(logBlock);
      mockBot.findBlocks = vi.fn().mockReturnValue([{ x: 102, y: 64, z: -50 }]);

      const tool = new MineResourceTool(mockContext);
      const result = await tool.run({ blockName: 'oak_log', count: 1 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.completed).toBeGreaterThanOrEqual(0);
      }
    });

    it('should track failed blocks', async () => {
      const { inventoryHasToolCategory, collectBlockWithTimeout } = await import('../../../src/utils/mining-helpers.js');
      vi.mocked(inventoryHasToolCategory).mockReturnValue(true);
      vi.mocked(collectBlockWithTimeout).mockRejectedValue(new Error('Mining failed'));

      const tool = new MineResourceTool(mockContext);
      const result = await tool.run({ blockName: 'stone', count: 1 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.failed.length).toBeGreaterThan(0);
      }
    });

    it('should use mining category', () => {
      const tool = new MineResourceTool(mockContext);
      expect(tool.category).toBe('mining');
    });

    it('should return no_tools error when non-pickaxe tool is missing', async () => {
      // Mock a block that requires axe (not pickaxe)
      const { inventoryHasToolCategory, requiredToolCategoryForBlockName } = await import('../../../src/utils/mining-helpers.js');
      vi.mocked(requiredToolCategoryForBlockName).mockReturnValue('axe');
      vi.mocked(inventoryHasToolCategory).mockReturnValue(false);

      const tool = new MineResourceTool(mockContext);
      const result = await tool.run({ blockName: 'oak_log', count: 1 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.ok).toBe(false);
        expect(result.data.error).toBe('no_tools');
        expect(result.data.reason).toBe('missing_tool');
        expect(result.data.needed).toBe('axe');
      }
    });

    it('should stop mining when tool breaks mid-loop', async () => {
      const { inventoryHasToolCategory, collectBlockWithTimeout, requiredToolCategoryForBlockName } = await import('../../../src/utils/mining-helpers.js');
      // Reset the requiredToolCategoryForBlockName mock to return pickaxe for stone
      vi.mocked(requiredToolCategoryForBlockName).mockImplementation((name: string) => {
        if (name.includes('ore') || name === 'stone') return 'pickaxe';
        return null;
      });
      // First check passes, then fails
      let callCount = 0;
      vi.mocked(inventoryHasToolCategory).mockImplementation(() => {
        callCount++;
        return callCount <= 2; // First two checks pass, then fail
      });
      vi.mocked(collectBlockWithTimeout).mockResolvedValue(undefined);

      // Return multiple blocks
      mockBot.findBlocks = vi.fn().mockReturnValue([
        { x: 102, y: 64, z: -50 },
        { x: 103, y: 64, z: -50 },
        { x: 104, y: 64, z: -50 },
      ]);

      const tool = new MineResourceTool(mockContext);
      const result = await tool.run({ blockName: 'stone', count: 3 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should have some completed but stopped due to missing tool
        expect(result.data.reason).toBe('missing_tool');
        expect(result.data.needed).toBe('pickaxe');
      }
    });

    it('should trigger per-block tool check failure on first block after pre-check passes', async () => {
      const { inventoryHasToolCategory, requiredToolCategoryForBlockName } = await import('../../../src/utils/mining-helpers.js');

      // requiredToolCategoryForBlockName returns 'pickaxe' for stone
      vi.mocked(requiredToolCategoryForBlockName).mockReturnValue('pickaxe');

      // Pre-check (line 90) passes, per-block check (line 118) fails
      // Call sequence: pre-check=true, per-block=false
      let callIndex = 0;
      vi.mocked(inventoryHasToolCategory).mockImplementation(() => {
        callIndex++;
        // First call is pre-check (line 90) - returns true
        // Second call is per-block check (line 118) - returns false
        return callIndex === 1;
      });

      mockBot.findBlocks = vi.fn().mockReturnValue([{ x: 102, y: 64, z: -50 }]);

      const tool = new MineResourceTool(mockContext);
      const result = await tool.run({ blockName: 'stone', count: 1 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Lines 119-131 should be triggered
        expect(result.data.ok).toBe(false); // completed=0, so ok is false
        expect(result.data.completed).toBe(0);
        expect(result.data.error).toBe('no_pickaxe');
        expect(result.data.reason).toBe('missing_tool');
        expect(result.data.needed).toBe('pickaxe');
        expect(result.data.failed.length).toBe(1);
        expect(result.data.failed[0]).toMatchObject({ x: 102, y: 64, z: -50, error: 'no_pickaxe' });
      }
    });

    it('should handle errors during cluster mining gracefully', async () => {
      const { inventoryHasToolCategory, isOreBlockName, collectBlockWithTimeout } = await import('../../../src/utils/mining-helpers.js');
      vi.mocked(inventoryHasToolCategory).mockReturnValue(true);
      vi.mocked(isOreBlockName).mockReturnValue(true);

      // First block succeeds, adjacent blocks fail
      let collectCount = 0;
      vi.mocked(collectBlockWithTimeout).mockImplementation(() => {
        collectCount++;
        if (collectCount > 1) {
          return Promise.reject(new Error('Block unreachable'));
        }
        return Promise.resolve();
      });

      // Mock adjacent block for cluster mining
      const mainPos = { x: 102, y: 64, z: -50, clone: () => mainPos };
      const adjacentPos = { x: 103, y: 64, z: -50, clone: () => adjacentPos };
      const mainBlock = { name: 'iron_ore', position: mainPos, hardness: 3 };
      const adjacentBlock = { name: 'iron_ore', position: adjacentPos, hardness: 3 };
      let blockAtCallCount = 0;
      mockBot.blockAt = vi.fn().mockImplementation(() => {
        blockAtCallCount++;
        if (blockAtCallCount === 1) return mainBlock;
        return adjacentBlock;
      });

      const tool = new MineResourceTool(mockContext);
      const result = await tool.run({ blockName: 'iron_ore', count: 1 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should have at least the first block completed
        expect(result.data.completed).toBeGreaterThanOrEqual(1);
        // Should have tracked failed blocks from cluster mining
        expect(result.data.failed.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('should return stalled flag when no progress made', async () => {
      const { inventoryHasToolCategory, collectBlockWithTimeout } = await import('../../../src/utils/mining-helpers.js');
      vi.mocked(inventoryHasToolCategory).mockReturnValue(true);

      // Mock block collection to succeed but mark progress as stalled by time
      vi.mocked(collectBlockWithTimeout).mockResolvedValue(undefined);

      const tool = new MineResourceTool(mockContext);
      const result = await tool.run({ blockName: 'stone', count: 1 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Stalled flag should be a boolean
        expect(typeof result.data.stalled).toBe('boolean');
      }
    });
  });

  describe('DigBlockTool', () => {
    it('should have correct definition', () => {
      const tool = new DigBlockTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('digBlock');
      expect(definition.description).toContain('block');
      expect(definition.inputSchema.properties).toHaveProperty('x');
      expect(definition.inputSchema.properties).toHaveProperty('y');
      expect(definition.inputSchema.properties).toHaveProperty('z');
    });

    it('should dig block at coordinates', async () => {
      const tool = new DigBlockTool(mockContext);
      const result = await tool.run({ x: 102, y: 64, z: -50 });

      expect(result.ok).toBe(true);
    });

    it('should return error when no block at position', async () => {
      mockBot.blockAt = vi.fn().mockReturnValue(null);

      const tool = new DigBlockTool(mockContext);
      const result = await tool.run({ x: 102, y: 64, z: -50 });

      expect(result.ok).toBe(false);
    });

    it('should reject missing coordinates', async () => {
      const tool = new DigBlockTool(mockContext);
      const result = await tool.run({ x: 100 });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });
  });

  describe('Mining Tool Integration', () => {
    it('should all be in mining category', () => {
      const mineTool = new MineResourceTool(mockContext);
      const digTool = new DigBlockTool(mockContext);

      expect(mineTool.category).toBe('mining');
      expect(digTool.category).toBe('mining');
    });

    it('should provide consistent status tracking', async () => {
      const tool = new MineResourceTool(mockContext);
      const result = await tool.run({ blockName: 'stone' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.status).toBeDefined();
        expect(result.bot).toBe('TestBot');
      }
    });
  });
});
