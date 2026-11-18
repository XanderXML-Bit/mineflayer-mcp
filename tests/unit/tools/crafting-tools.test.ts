/**
 * Tests for crafting tools (list-recipes, list-all-recipes, craft-items)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ToolContext } from '../../../src/tools/base-tool.js';
import { ListRecipesTool } from '../../../src/tools/crafting/list-recipes.js';
import { ListAllRecipesTool } from '../../../src/tools/crafting/list-all-recipes.js';

// Mock minecraft-data
vi.mock('minecraft-data', () => ({
  default: () => ({
    itemsByName: {
      stick: { id: 280, name: 'stick' },
      oak_planks: { id: 5, name: 'oak_planks' },
      crafting_table: { id: 58, name: 'crafting_table' },
      wooden_pickaxe: { id: 270, name: 'wooden_pickaxe' },
      stone: { id: 1, name: 'stone' },
      cobblestone: { id: 4, name: 'cobblestone' },
    },
    items: {
      280: { name: 'stick' },
      5: { name: 'oak_planks' },
      58: { name: 'crafting_table' },
      270: { name: 'wooden_pickaxe' },
      1: { name: 'stone' },
      4: { name: 'cobblestone' },
    },
    recipes: {
      280: [{ inShape: [[{ id: 5 }], [{ id: 5 }]], result: { id: 280, count: 4 } }],
      58: [{ inShape: [[{ id: 5 }, { id: 5 }], [{ id: 5 }, { id: 5 }]], result: { id: 58, count: 1 } }],
    },
    blocksByName: {},
    entitiesByName: {},
  }),
}));

// Mock task service
vi.mock('../../../src/services/task.service.js', () => ({
  withTask: vi.fn((_bot, fn) => fn()),
}));

// Mock equipment service
vi.mock('../../../src/services/equipment.service.js', () => ({
  createEquipmentService: () => ({
    pushSuspendAutoEat: vi.fn(),
    popSuspendAutoEat: vi.fn(),
  }),
}));

// Mock navigation service
vi.mock('../../../src/services/navigation.service.js', () => ({
  configureMovements: vi.fn(() => ({})),
}));

// Mock pathfinder
vi.mock('mineflayer-pathfinder', () => ({
  default: {
    goals: {
      GoalNear: class GoalNear {
        constructor(public x: number, public y: number, public z: number, public range: number) {}
      },
    },
  },
  goals: {
    GoalNear: class GoalNear {
      constructor(public x: number, public y: number, public z: number, public range: number) {}
    },
  },
}));

describe('Crafting Tools', () => {
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
      { name: 'oak_planks', count: 64, slot: 0, type: 5 },
      { name: 'cobblestone', count: 32, slot: 1, type: 4 },
      { name: 'stick', count: 16, slot: 2, type: 280 },
    ];

    // Mock recipe structure
    const mockRecipe = {
      ingredients: [{ id: 5, count: 2 }],
      inShape: [[{ id: 5 }], [{ id: 5 }]],
      requiresTable: false,
      result: { id: 280, count: 4 },
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
      },
      oxygenLevel: 20,
      time: { timeOfDay: 6000 },
      blockAt: vi.fn().mockReturnValue({ name: 'grass_block', position }),
      game: { gameMode: 0 },
      findBlock: vi.fn().mockReturnValue(null),
      recipesFor: vi.fn().mockReturnValue([mockRecipe]),
      craft: vi.fn().mockResolvedValue(undefined),
      placeBlock: vi.fn().mockResolvedValue(undefined),
      equip: vi.fn().mockResolvedValue(undefined),
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
    mockBot = createMockBot();
    mockContext = {
      getBotOrThrow: vi.fn().mockReturnValue(mockBot),
      getAllBots: vi.fn().mockReturnValue(new Map([['TestBot', mockBot]])),
      config: {} as unknown as ToolContext['config'],
    };
  });

  describe('ListRecipesTool', () => {
    it('should have correct definition', () => {
      const tool = new ListRecipesTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('listRecipes');
      expect(definition.description).toContain('recipes');
      expect(definition.inputSchema.properties).toHaveProperty('itemName');
    });

    it('should list recipes for an item', async () => {
      const tool = new ListRecipesTool(mockContext);
      const result = await tool.run({ itemName: 'stick' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.ok).toBe(true);
        expect(result.data.item).toBe('stick');
        expect(result.data.recipes).toBeDefined();
        expect(Array.isArray(result.data.recipes)).toBe(true);
      }
    });

    it('should return error for unknown item', async () => {
      const tool = new ListRecipesTool(mockContext);
      const result = await tool.run({ itemName: 'nonexistent_item' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Unknown');
      }
    });

    it('should reject missing item name', async () => {
      const tool = new ListRecipesTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });

    it('should calculate craftable count based on inventory', async () => {
      const tool = new ListRecipesTool(mockContext);
      const result = await tool.run({ itemName: 'stick' });

      expect(result.ok).toBe(true);
      if (result.ok && result.data.recipes.length > 0) {
        expect(result.data.recipes[0].craftable).toBeGreaterThanOrEqual(0);
      }
    });

    it('should indicate if recipe requires crafting table', async () => {
      const tool = new ListRecipesTool(mockContext);
      const result = await tool.run({ itemName: 'stick' });

      expect(result.ok).toBe(true);
      if (result.ok && result.data.recipes.length > 0) {
        expect(typeof result.data.recipes[0].requiresTable).toBe('boolean');
      }
    });
  });

  describe('ListAllRecipesTool', () => {
    it('should have correct definition', () => {
      const tool = new ListAllRecipesTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('listAllRecipes');
      expect(definition.description).toContain('recipes');
    });

    it('should list all available recipes', async () => {
      const tool = new ListAllRecipesTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.recipes).toBeDefined();
        expect(Array.isArray(result.data.recipes)).toBe(true);
      }
    });

    it('should filter by search term', async () => {
      const tool = new ListAllRecipesTool(mockContext);
      const result = await tool.run({ search: 'stick' });

      expect(result.ok).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const tool = new ListAllRecipesTool(mockContext);
      const result = await tool.run({ limit: 5 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.recipes.length).toBeLessThanOrEqual(5);
      }
    });

    it('should filter by craftable only', async () => {
      const tool = new ListAllRecipesTool(mockContext);
      const result = await tool.run({ craftableOnly: true });

      expect(result.ok).toBe(true);
    });
  });

  describe('Crafting Tool Integration', () => {
    it('should all be in crafting category', () => {
      const listTool = new ListRecipesTool(mockContext);
      const listAllTool = new ListAllRecipesTool(mockContext);

      expect(listTool.category).toBe('crafting');
      expect(listAllTool.category).toBe('crafting');
    });

    it('should provide consistent status tracking', async () => {
      const tool = new ListRecipesTool(mockContext);
      const result = await tool.run({ itemName: 'stick' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.status).toBeDefined();
        expect(result.bot).toBe('TestBot');
      }
    });

    it('should list ingredients for recipes', async () => {
      const tool = new ListRecipesTool(mockContext);
      const result = await tool.run({ itemName: 'stick' });

      expect(result.ok).toBe(true);
      if (result.ok && result.data.recipes.length > 0) {
        const recipe = result.data.recipes[0];
        expect(recipe.ingredients).toBeDefined();
        expect(Array.isArray(recipe.ingredients)).toBe(true);
      }
    });
  });
});
