/**
 * Tests for inventory tools (list-inventory, equip-item, drop-item)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ToolContext } from '../../../src/tools/base-tool.js';
import { ListInventoryTool } from '../../../src/tools/inventory/list-inventory.js';
import { EquipItemTool } from '../../../src/tools/inventory/equip-item.js';
import { DropItemTool } from '../../../src/tools/inventory/drop-item.js';

// Mock minecraft-data
vi.mock('minecraft-data', () => ({
  default: () => ({
    itemsByName: {
      diamond_sword: { id: 276, name: 'diamond_sword', maxDurability: 1561 },
      iron_pickaxe: { id: 257, name: 'iron_pickaxe', maxDurability: 250 },
      cobblestone: { id: 4, name: 'cobblestone' },
    },
    blocksByName: {},
    entitiesByName: {},
  }),
}));

// Mock equipment service
vi.mock('../../../src/services/equipment.service.js', () => ({
  createEquipmentService: () => ({
    pushSuspendAutoEat: vi.fn(),
    popSuspendAutoEat: vi.fn(),
  }),
}));

describe('Inventory Tools', () => {
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

    const inventoryItems = [
      { name: 'diamond_sword', count: 1, slot: 0, type: 276, nbt: null },
      { name: 'iron_pickaxe', count: 1, slot: 1, type: 257, nbt: null },
      { name: 'cobblestone', count: 64, slot: 2, type: 4, nbt: null },
      { name: 'cobblestone', count: 32, slot: 3, type: 4, nbt: null },
    ];

    return {
      username: 'TestBot',
      version: '1.20.1',
      health: 20,
      food: 20,
      foodSaturation: 5,
      entity: { position, onGround: true, equipment: [] },
      inventory: {
        items: () => inventoryItems,
        slots: inventoryItems,
      },
      oxygenLevel: 20,
      time: { timeOfDay: 6000 },
      blockAt: () => ({ name: 'grass_block', biome: { name: 'plains' } }),
      game: { gameMode: 0 },
      equip: vi.fn().mockResolvedValue(undefined),
      tossStack: vi.fn().mockResolvedValue(undefined),
      toss: vi.fn().mockResolvedValue(undefined),
      __status: null,
      __chatLog: [],
    };
  }

  beforeEach(() => {
    mockBot = createMockBot();
    mockContext = {
      getBotOrThrow: vi.fn().mockReturnValue(mockBot),
      getAllBots: vi.fn().mockReturnValue(new Map([['TestBot', mockBot]])),
      config: {} as unknown as ToolContext['config'],
    };
  });

  describe('ListInventoryTool', () => {
    it('should have correct definition', () => {
      const tool = new ListInventoryTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('listInventory');
      expect(definition.description).toContain('inventory');
    });

    it('should return inventory items', async () => {
      const tool = new ListInventoryTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.items).toHaveLength(4);
        expect(result.data.items[0]).toEqual({
          name: 'diamond_sword',
          count: 1,
          slot: 0,
        });
      }
    });

    it('should include equipped summary', async () => {
      const tool = new ListInventoryTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.equipped).toBeDefined();
        expect(result.data.equipped).toHaveProperty('mainHand');
        expect(result.data.equipped).toHaveProperty('offHand');
        expect(result.data.equipped).toHaveProperty('armor');
      }
    });

    it('should return ok flag', async () => {
      const tool = new ListInventoryTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.ok).toBe(true);
      }
    });

    it('should work with specified username', async () => {
      const tool = new ListInventoryTool(mockContext);
      const result = await tool.run({ username: 'TestBot' });

      expect(result.ok).toBe(true);
      expect(mockContext.getBotOrThrow).toHaveBeenCalledWith('TestBot');
    });

    it('should handle empty inventory', async () => {
      mockBot.inventory.items = () => [];

      const tool = new ListInventoryTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.items).toHaveLength(0);
      }
    });
  });

  describe('EquipItemTool', () => {
    it('should have correct definition', () => {
      const tool = new EquipItemTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('equipItem');
      expect(definition.description).toContain('Equip');
      expect(definition.inputSchema.properties).toHaveProperty('itemName');
      expect(definition.inputSchema.properties).toHaveProperty('destination');
    });

    it('should equip item to hand', async () => {
      const tool = new EquipItemTool(mockContext);
      const result = await tool.run({ itemName: 'diamond_sword' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.destination).toBe('hand');
        expect(mockBot.equip).toHaveBeenCalled();
      }
    });

    it('should equip item to specified slot', async () => {
      const tool = new EquipItemTool(mockContext);
      const result = await tool.run({ itemName: 'diamond_sword', destination: 'off-hand' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.destination).toBe('off-hand');
      }
    });

    it('should return error when item not found', async () => {
      const tool = new EquipItemTool(mockContext);
      const result = await tool.run({ itemName: 'nonexistent_item' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('not found');
      }
    });

    it('should include durability info', async () => {
      const tool = new EquipItemTool(mockContext);
      const result = await tool.run({ itemName: 'diamond_sword' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toHaveProperty('durability');
      }
    });

    it('should reject missing item name', async () => {
      const tool = new EquipItemTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });

    it('should accept all valid destinations', async () => {
      const destinations = ['hand', 'off-hand', 'head', 'torso', 'legs', 'feet'];
      const tool = new EquipItemTool(mockContext);

      for (const dest of destinations) {
        const result = await tool.run({
          itemName: 'diamond_sword',
          destination: dest as 'hand' | 'off-hand' | 'head' | 'torso' | 'legs' | 'feet'
        });
        expect(result.ok).toBe(true);
      }
    });
  });

  describe('DropItemTool', () => {
    it('should have correct definition', () => {
      const tool = new DropItemTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('dropItem');
      expect(definition.description).toContain('Drop');
      expect(definition.inputSchema.properties).toHaveProperty('itemName');
      expect(definition.inputSchema.properties).toHaveProperty('count');
    });

    it('should drop all items when no count specified', async () => {
      const tool = new DropItemTool(mockContext);
      const result = await tool.run({ itemName: 'cobblestone' });

      expect(result.ok).toBe(true);
      expect(mockBot.toss).toHaveBeenCalled();
    });

    it('should drop specific count', async () => {
      const tool = new DropItemTool(mockContext);
      const result = await tool.run({ itemName: 'cobblestone', count: 10 });

      expect(result.ok).toBe(true);
      expect(mockBot.toss).toHaveBeenCalled();
    });

    it('should return error when item not found', async () => {
      const tool = new DropItemTool(mockContext);
      const result = await tool.run({ itemName: 'nonexistent_item' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('not found');
      }
    });

    it('should reject missing item name', async () => {
      const tool = new DropItemTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });
  });

  describe('Inventory Tool Integration', () => {
    it('should all be in inventory category', () => {
      const listTool = new ListInventoryTool(mockContext);
      const equipTool = new EquipItemTool(mockContext);
      const dropTool = new DropItemTool(mockContext);

      expect(listTool.category).toBe('inventory');
      expect(equipTool.category).toBe('inventory');
      expect(dropTool.category).toBe('inventory');
    });

    it('should provide consistent status tracking', async () => {
      const tools = [
        new ListInventoryTool(mockContext),
        new EquipItemTool(mockContext),
      ];

      for (const tool of tools) {
        let result;
        if (tool.name === 'equipItem') {
          result = await tool.run({ itemName: 'diamond_sword' });
        } else {
          result = await tool.run({});
        }
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.status).toBeDefined();
          expect(result.bot).toBe('TestBot');
        }
      }
    });
  });
});
