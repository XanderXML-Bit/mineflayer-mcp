/**
 * Tests for observation tools (get-position, find-block, find-entity, etc.)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ToolContext } from '../../../src/tools/base-tool.js';
import { GetPositionTool } from '../../../src/tools/observation/get-position.js';
import { FindBlockTool } from '../../../src/tools/observation/find-block.js';
import { FindEntityTool } from '../../../src/tools/observation/find-entity.js';

// Mock minecraft-data
vi.mock('minecraft-data', () => ({
  default: () => ({
    blocksByName: {
      stone: { id: 1, name: 'stone' },
      diamond_ore: { id: 56, name: 'diamond_ore' },
      oak_log: { id: 17, name: 'oak_log' },
    },
    entitiesByName: {
      zombie: { id: 54, name: 'zombie' },
      cow: { id: 92, name: 'cow' },
      player: { id: 1, name: 'player' },
    },
  }),
}));

describe('Observation Tools', () => {
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
      game: { gameMode: 0 },
      entities: {},
      nearestEntity: vi.fn(),
      findBlock: vi.fn(),
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

  describe('GetPositionTool', () => {
    it('should have correct definition', () => {
      const tool = new GetPositionTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('getPosition');
      expect(definition.description).toContain('position');
    });

    it('should return bot position', async () => {
      const tool = new GetPositionTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.position).toEqual({
          x: 100,
          y: 64,
          z: -50,
        });
      }
    });

    it('should include bot username in response', async () => {
      const tool = new GetPositionTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.bot).toBe('TestBot');
      }
    });

    it('should include status in response', async () => {
      const tool = new GetPositionTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.status).toBeDefined();
        expect(result.status.health).toBe(20);
      }
    });

    it('should work with specified username', async () => {
      const tool = new GetPositionTool(mockContext);
      const result = await tool.run({ username: 'TestBot' });

      expect(result.ok).toBe(true);
      expect(mockContext.getBotOrThrow).toHaveBeenCalledWith('TestBot');
    });
  });

  describe('FindBlockTool', () => {
    it('should have correct definition', () => {
      const tool = new FindBlockTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('findBlock');
      expect(definition.description).toContain('block');
      expect(definition.inputSchema.properties).toHaveProperty('blockName');
      expect(definition.inputSchema.properties).toHaveProperty('maxDistance');
    });

    it('should find a block when it exists', async () => {
      const blockPosition = { x: 110, y: 60, z: -45 };
      mockBot.findBlock = vi.fn().mockReturnValue({
        name: 'diamond_ore',
        position: blockPosition,
      });

      const tool = new FindBlockTool(mockContext);
      const result = await tool.run({ blockName: 'diamond_ore' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.blockName).toBe('diamond_ore');
        expect(result.data.position).toEqual(blockPosition);
      }
    });

    it('should return error when block not found', async () => {
      mockBot.findBlock = vi.fn().mockReturnValue(null);

      const tool = new FindBlockTool(mockContext);
      const result = await tool.run({ blockName: 'emerald_ore' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('not found');
      }
    });

    it('should use custom max distance', async () => {
      mockBot.findBlock = vi.fn().mockReturnValue(null);

      const tool = new FindBlockTool(mockContext);
      await tool.run({ blockName: 'stone', maxDistance: 32 });

      expect(mockBot.findBlock).toHaveBeenCalledWith(
        expect.objectContaining({
          maxDistance: 32,
        })
      );
    });

    it('should use default max distance', async () => {
      mockBot.findBlock = vi.fn().mockReturnValue(null);

      const tool = new FindBlockTool(mockContext);
      await tool.run({ blockName: 'stone' });

      expect(mockBot.findBlock).toHaveBeenCalledWith(
        expect.objectContaining({
          maxDistance: 64,
        })
      );
    });

    it('should reject missing block name', async () => {
      const tool = new FindBlockTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });
  });

  describe('FindEntityTool', () => {
    it('should have correct definition', () => {
      const tool = new FindEntityTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('findEntity');
      expect(definition.description).toContain('entity');
      expect(definition.inputSchema.properties).toHaveProperty('targetName');
    });

    it('should find nearest entity when no name specified', async () => {
      const entityPosition = { x: 105, y: 64, z: -48 };
      mockBot.nearestEntity = vi.fn().mockReturnValue({
        name: 'cow',
        position: entityPosition,
        type: 'mob',
      });

      const tool = new FindEntityTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
    });

    it('should find entity by name', async () => {
      const entityPosition = { x: 105, y: 64, z: -48 };
      mockBot.nearestEntity = vi.fn().mockReturnValue({
        name: 'zombie',
        position: entityPosition,
        type: 'hostile',
      });

      const tool = new FindEntityTool(mockContext);
      const result = await tool.run({ targetName: 'zombie' });

      expect(result.ok).toBe(true);
    });

    it('should return error when no entity found', async () => {
      mockBot.nearestEntity = vi.fn().mockReturnValue(null);

      const tool = new FindEntityTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('No entities nearby');
      }
    });

    it('should return error when specific entity not found', async () => {
      mockBot.nearestEntity = vi.fn().mockReturnValue(null);

      const tool = new FindEntityTool(mockContext);
      const result = await tool.run({ targetName: 'dragon' });

      expect(result.ok).toBe(false);
    });
  });

  describe('Observation Tool Integration', () => {
    it('should all be in observation category', () => {
      const positionTool = new GetPositionTool(mockContext);
      const blockTool = new FindBlockTool(mockContext);
      const entityTool = new FindEntityTool(mockContext);

      expect(positionTool.category).toBe('observation');
      expect(blockTool.category).toBe('observation');
      expect(entityTool.category).toBe('observation');
    });

    it('should provide consistent status tracking', async () => {
      const tools = [
        new GetPositionTool(mockContext),
        new FindEntityTool(mockContext),
      ];

      // Set up entity tool to succeed
      mockBot.nearestEntity = vi.fn().mockReturnValue({
        name: 'cow',
        position: { x: 0, y: 0, z: 0 },
      });

      for (const tool of tools) {
        const result = await tool.run({});
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.status).toBeDefined();
          expect(result.bot).toBe('TestBot');
        }
      }
    });
  });
});
