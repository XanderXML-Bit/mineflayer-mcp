/**
 * Tests for storage tools (open-chest, deposit-items, withdraw-items, etc.)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ToolContext } from '../../../src/tools/base-tool.js';
import { OpenChestTool } from '../../../src/tools/storage/open-chest.js';
import { DepositItemsTool } from '../../../src/tools/storage/deposit-items.js';
import { WithdrawItemsTool } from '../../../src/tools/storage/withdraw-items.js';
import { IndexNearbyStorageTool } from '../../../src/tools/storage/index-nearby-storage.js';
import { FindItemInStorageTool } from '../../../src/tools/storage/find-item-in-storage.js';

// Mock navigation service
vi.mock('../../../src/services/navigation.service.js', () => ({
  pathfindToPredicate: vi.fn().mockResolvedValue({
    name: 'chest',
    position: { x: 102, y: 64, z: -50 },
  }),
  configureMovements: vi.fn(() => ({})),
}));

// Mock equipment service
vi.mock('../../../src/services/equipment.service.js', () => ({
  createEquipmentService: () => ({
    pushSuspendAutoEat: vi.fn(),
    popSuspendAutoEat: vi.fn(),
  }),
}));

// Mock storage index service
vi.mock('../../../src/services/storage-index.service.js', () => ({
  findNearbyStorage: vi.fn().mockReturnValue([
    { name: 'chest', position: { x: 102, y: 64, z: -50 } },
    { name: 'chest', position: { x: 104, y: 64, z: -50 } },
  ]),
  indexStorage: vi.fn().mockResolvedValue({
    position: { x: 102, y: 64, z: -50 },
    type: 'chest',
    items: [{ name: 'iron_ingot', count: 32 }],
    totalItems: 32,
    dimension: 'overworld',
    lastScanned: Date.now(),
  }),
  findItemInStorage: vi.fn().mockReturnValue([
    {
      itemCount: 32,
      location: {
        position: { x: 102, y: 64, z: -50 },
        type: 'chest',
        dimension: 'overworld',
        lastScanned: Date.now(),
      },
    },
  ]),
  getStorageSummary: vi.fn().mockReturnValue({
    totalLocations: 3,
    totalItems: 128,
    topItems: [
      { name: 'cobblestone', count: 64 },
      { name: 'iron_ingot', count: 32 },
    ],
  }),
}));

// Mock task service
vi.mock('../../../src/services/task.service.js', () => ({
  withTask: vi.fn((_bot, fn) => fn()),
}));

// Mock minecraft-data
vi.mock('minecraft-data', () => ({
  default: () => ({
    itemsByName: {
      iron_ingot: { id: 265, name: 'iron_ingot' },
      cobblestone: { id: 4, name: 'cobblestone' },
      diamond: { id: 264, name: 'diamond' },
    },
    blocksByName: {},
  }),
}));

describe('Storage Tools', () => {
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

    const chestBlock = {
      name: 'chest',
      position: { x: 102, y: 64, z: -50 },
    };

    const inventoryItems = [
      { name: 'iron_ingot', count: 32, slot: 0, type: 265, nbt: null },
      { name: 'cobblestone', count: 64, slot: 1, type: 4, nbt: null },
    ];

    const chestItems = [
      { name: 'diamond', count: 5 },
      { name: 'gold_ingot', count: 16 },
    ];

    const mockChestWindow = {
      containerItems: vi.fn().mockReturnValue(chestItems),
      close: vi.fn(),
      deposit: vi.fn().mockResolvedValue(undefined),
      withdraw: vi.fn().mockResolvedValue(undefined),
    };

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
        findInventoryItem: vi.fn().mockReturnValue(inventoryItems[0]),
      },
      oxygenLevel: 20,
      time: { timeOfDay: 6000 },
      blockAt: vi.fn().mockReturnValue(chestBlock),
      findBlock: vi.fn().mockReturnValue(chestBlock),
      findBlocks: vi.fn().mockReturnValue([{ x: 102, y: 64, z: -50 }]),
      game: { gameMode: 0 },
      openChest: vi.fn().mockResolvedValue(mockChestWindow),
      waitForTicks: vi.fn().mockResolvedValue(undefined),
      pathfinder: {
        goto: vi.fn().mockResolvedValue(undefined),
        setMovements: vi.fn(),
        setGoal: vi.fn(),
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

  describe('OpenChestTool', () => {
    it('should have correct definition', () => {
      const tool = new OpenChestTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('openNearbyChest');
      expect(definition.description).toContain('chest');
    });

    it('should open chest and list contents', async () => {
      const tool = new OpenChestTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.ok).toBe(true);
        expect(result.data.chestItems).toBeDefined();
        expect(Array.isArray(result.data.chestItems)).toBe(true);
      }
    });
  });

  describe('DepositItemsTool', () => {
    it('should have correct definition', () => {
      const tool = new DepositItemsTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('depositItemsToNearbyChest');
      expect(definition.description).toContain('Deposit');
      expect(definition.inputSchema.properties).toHaveProperty('itemName');
      expect(definition.inputSchema.properties).toHaveProperty('count');
    });

    it('should deposit items to chest', async () => {
      const tool = new DepositItemsTool(mockContext);
      const result = await tool.run({ itemName: 'iron_ingot' });

      expect(result.ok).toBe(true);
    });

    it('should deposit specific count', async () => {
      const tool = new DepositItemsTool(mockContext);
      const result = await tool.run({ itemName: 'iron_ingot', count: 16 });

      expect(result.ok).toBe(true);
    });

    it('should reject missing item name', async () => {
      const tool = new DepositItemsTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });
  });

  describe('WithdrawItemsTool', () => {
    it('should have correct definition', () => {
      const tool = new WithdrawItemsTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('withdrawItemsFromNearbyChest');
      expect(definition.description).toContain('Withdraw');
      expect(definition.inputSchema.properties).toHaveProperty('itemName');
      expect(definition.inputSchema.properties).toHaveProperty('count');
    });

    it('should withdraw items from chest', async () => {
      const tool = new WithdrawItemsTool(mockContext);
      const result = await tool.run({ itemName: 'diamond' });

      expect(result.ok).toBe(true);
    });

    it('should reject missing item name', async () => {
      const tool = new WithdrawItemsTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });
  });

  describe('IndexNearbyStorageTool', () => {
    it('should have correct definition', () => {
      const tool = new IndexNearbyStorageTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('indexNearbyStorage');
      expect(definition.description).toContain('storage');
      expect(definition.inputSchema.properties).toHaveProperty('radius');
      expect(definition.inputSchema.properties).toHaveProperty('maxContainers');
    });

    it('should index nearby storage containers', async () => {
      const tool = new IndexNearbyStorageTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.indexed).toBeDefined();
        expect(result.data.found).toBeGreaterThanOrEqual(0);
      }
    });

    it('should respect radius parameter', async () => {
      const tool = new IndexNearbyStorageTool(mockContext);
      const result = await tool.run({ radius: 32 });

      expect(result.ok).toBe(true);
    });
  });

  describe('FindItemInStorageTool', () => {
    it('should have correct definition', () => {
      const tool = new FindItemInStorageTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('findItemInStorage');
      expect(definition.description).toContain('Search');
      expect(definition.inputSchema.properties).toHaveProperty('item');
    });

    it('should find item in indexed storage', async () => {
      const tool = new FindItemInStorageTool(mockContext);
      const result = await tool.run({ item: 'iron_ingot' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.found).toBe(true);
        expect(result.data.locations).toBeDefined();
      }
    });

    it('should reject missing item name', async () => {
      const tool = new FindItemInStorageTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });
  });

  describe('Storage Tool Integration', () => {
    it('should all be in storage category', () => {
      const openTool = new OpenChestTool(mockContext);
      const depositTool = new DepositItemsTool(mockContext);
      const withdrawTool = new WithdrawItemsTool(mockContext);
      const indexTool = new IndexNearbyStorageTool(mockContext);
      const findTool = new FindItemInStorageTool(mockContext);

      expect(openTool.category).toBe('storage');
      expect(depositTool.category).toBe('storage');
      expect(withdrawTool.category).toBe('storage');
      expect(indexTool.category).toBe('storage');
      expect(findTool.category).toBe('storage');
    });

    it('should provide consistent status tracking', async () => {
      const tool = new OpenChestTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.status).toBeDefined();
        expect(result.bot).toBe('TestBot');
      }
    });
  });
});
