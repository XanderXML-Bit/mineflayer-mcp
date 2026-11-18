/**
 * Tests for navigation tools (set-home, go-home, get-home-info)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ToolContext } from '../../../src/tools/base-tool.js';
import { SetHomeTool } from '../../../src/tools/navigation/set-home.js';
import { GoHomeTool } from '../../../src/tools/navigation/go-home.js';
import { GetHomeInfoTool } from '../../../src/tools/navigation/get-home-info.js';

// Mock the memory service
const mockMemory: Record<string, unknown> = {};
vi.mock('../../../src/services/memory.service.js', () => ({
  remember: vi.fn((key: string, value: unknown) => {
    mockMemory[key] = value;
  }),
  recall: vi.fn((key: string) => mockMemory[key]),
  forget: vi.fn((key: string) => {
    delete mockMemory[key];
  }),
}));

// Mock task service
vi.mock('../../../src/services/task.service.js', () => ({
  withTask: vi.fn((_bot, fn) => fn()),
}));

// Mock mineflayer-pathfinder
vi.mock('mineflayer-pathfinder', () => ({
  goals: {
    GoalNear: class GoalNear {
      constructor(public x: number, public y: number, public z: number, public range: number) {}
    },
  },
}));

describe('Navigation Tools', () => {
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

    return {
      username: 'TestBot',
      version: '1.20.1',
      health: 20,
      food: 20,
      foodSaturation: 5,
      entity: { position, onGround: true },
      inventory: { items: () => [] },
      oxygenLevel: 20,
      time: { timeOfDay: 6000 },
      blockAt: () => ({ name: 'grass_block', biome: { name: 'plains' } }),
      game: { gameMode: 0, dimension: 'overworld' },
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
    // Clear mock memory before each test
    for (const key of Object.keys(mockMemory)) {
      delete mockMemory[key];
    }

    mockBot = createMockBot();
    mockContext = {
      getBotOrThrow: vi.fn().mockReturnValue(mockBot),
      getAllBots: vi.fn().mockReturnValue(new Map([['TestBot', mockBot]])),
      config: {} as unknown as ToolContext['config'],
    };
  });

  describe('SetHomeTool', () => {
    it('should have correct definition', () => {
      const tool = new SetHomeTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('setHome');
      expect(definition.description).toContain('home');
      expect(definition.inputSchema.properties).toHaveProperty('name');
      expect(definition.inputSchema.properties).toHaveProperty('position');
    });

    it('should set home at current position', async () => {
      const tool = new SetHomeTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.success).toBe(true);
        expect(result.data.home.position).toEqual({
          x: 100,
          y: 64,
          z: -50,
        });
        expect(result.data.home.name).toBe('home');
        expect(result.data.home.dimension).toBe('overworld');
      }
    });

    it('should set home with custom name', async () => {
      const tool = new SetHomeTool(mockContext);
      const result = await tool.run({ name: 'mine_entrance' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.home.name).toBe('mine_entrance');
      }
    });

    it('should set home at custom position', async () => {
      const tool = new SetHomeTool(mockContext);
      const customPos = { x: 200, y: 32, z: 100 };
      const result = await tool.run({ position: customPos });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.home.position).toEqual(customPos);
      }
    });

    it('should include timestamp', async () => {
      const tool = new SetHomeTool(mockContext);
      const beforeTime = Date.now();
      const result = await tool.run({});
      const afterTime = Date.now();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.home.setAt).toBeGreaterThanOrEqual(beforeTime);
        expect(result.data.home.setAt).toBeLessThanOrEqual(afterTime);
      }
    });

    it('should detect nether dimension', async () => {
      mockBot.game.dimension = 'the_nether';
      const tool = new SetHomeTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.home.dimension).toBe('nether');
      }
    });

    it('should detect end dimension', async () => {
      mockBot.game.dimension = 'the_end';
      const tool = new SetHomeTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.home.dimension).toBe('end');
      }
    });
  });

  describe('GoHomeTool', () => {
    it('should have correct definition', () => {
      const tool = new GoHomeTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('goHome');
      expect(definition.description).toContain('Navigate');
      expect(definition.inputSchema.properties).toHaveProperty('name');
    });

    it('should return error when no homes saved', async () => {
      const tool = new GoHomeTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.success).toBe(false);
        expect(result.data.message).toContain('No home locations');
      }
    });

    it('should navigate to saved home', async () => {
      // First set a home
      const setTool = new SetHomeTool(mockContext);
      await setTool.run({});

      // Then go home
      const goTool = new GoHomeTool(mockContext);
      const result = await goTool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.success).toBe(true);
        expect(result.data.destination).toBeDefined();
      }
    });

    it('should return error for non-existent home', async () => {
      // First set a home with one name
      const setTool = new SetHomeTool(mockContext);
      await setTool.run({ name: 'base' });

      // Then try to go to a different home
      const goTool = new GoHomeTool(mockContext);
      const result = await goTool.run({ name: 'mine' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.success).toBe(false);
        expect(result.data.message).toContain('not found');
      }
    });

    it('should reject cross-dimension navigation', async () => {
      // Set home in overworld
      const setTool = new SetHomeTool(mockContext);
      await setTool.run({});

      // Change dimension to nether
      mockBot.game.dimension = 'the_nether';

      // Try to go home
      const goTool = new GoHomeTool(mockContext);
      const result = await goTool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.success).toBe(false);
        expect(result.data.message).toContain('Cannot navigate');
      }
    });

    it('should calculate distance', async () => {
      // Set home at current position
      const setTool = new SetHomeTool(mockContext);
      await setTool.run({});

      // Move bot position
      mockBot.entity.position.x = 110;
      mockBot.entity.position.y = 64;
      mockBot.entity.position.z = -50;

      const goTool = new GoHomeTool(mockContext);
      const result = await goTool.run({});

      expect(result.ok).toBe(true);
      if (result.ok && result.data.success) {
        expect(result.data.distance).toBeDefined();
        expect(result.data.distance).toBeCloseTo(10, 0);
      }
    });
  });

  describe('GetHomeInfoTool', () => {
    it('should have correct definition', () => {
      const tool = new GetHomeInfoTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('getHomeInfo');
      expect(definition.description).toContain('home');
    });

    it('should return empty list when no homes saved', async () => {
      const tool = new GetHomeInfoTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.homes).toHaveLength(0);
      }
    });

    it('should list all saved homes', async () => {
      // Set multiple homes
      const setTool = new SetHomeTool(mockContext);
      await setTool.run({ name: 'home' });
      await setTool.run({ name: 'mine' });
      await setTool.run({ name: 'farm' });

      const tool = new GetHomeInfoTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.homes.length).toBeGreaterThanOrEqual(3);
      }
    });

    it('should get specific home info', async () => {
      const setTool = new SetHomeTool(mockContext);
      await setTool.run({ name: 'base' });

      const tool = new GetHomeInfoTool(mockContext);
      const result = await tool.run({ name: 'base' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.homes).toHaveLength(1);
        expect(result.data.homes[0].name).toBe('base');
      }
    });
  });

  describe('Navigation Tool Integration', () => {
    it('should all be in navigation category', () => {
      const setTool = new SetHomeTool(mockContext);
      const goTool = new GoHomeTool(mockContext);
      const infoTool = new GetHomeInfoTool(mockContext);

      expect(setTool.category).toBe('navigation');
      expect(goTool.category).toBe('navigation');
      expect(infoTool.category).toBe('navigation');
    });

    it('should work together for complete home workflow', async () => {
      // Step 1: Set home
      const setTool = new SetHomeTool(mockContext);
      const setResult = await setTool.run({ name: 'main_base' });
      expect(setResult.ok).toBe(true);

      // Step 2: Check home info
      const infoTool = new GetHomeInfoTool(mockContext);
      const infoResult = await infoTool.run({ name: 'main_base' });
      expect(infoResult.ok).toBe(true);

      // Step 3: Go home
      const goTool = new GoHomeTool(mockContext);
      const goResult = await goTool.run({ name: 'main_base' });
      expect(goResult.ok).toBe(true);
    });
  });
});
