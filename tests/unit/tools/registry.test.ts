/**
 * Tests for the tool registry
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import {
  ToolRegistry,
  createToolRegistry,
  ToolNotFoundError,
  DuplicateToolError,
} from '../../../src/tools/registry.js';
import { BaseTool, type ToolContext } from '../../../src/tools/base-tool.js';

// Mock tool for testing
class MockTool extends BaseTool<{ username?: string }, { message: string }> {
  readonly name = 'mockTool';
  readonly description = 'A mock tool for testing';
  readonly category = 'utility' as const;
  readonly inputSchema = z.object({
    username: z.string().optional(),
  });

  protected async execute(): Promise<{ message: string }> {
    return { message: 'Mock executed' };
  }
}

class AnotherMockTool extends BaseTool<{ username?: string }, { value: number }> {
  readonly name = 'anotherMock';
  readonly description = 'Another mock tool';
  readonly category = 'movement' as const;
  readonly inputSchema = z.object({
    username: z.string().optional(),
  });

  protected async execute(): Promise<{ value: number }> {
    return { value: 42 };
  }
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry;
  let mockContext: ToolContext;

  beforeEach(() => {
    registry = createToolRegistry();
    mockContext = {
      getBotOrThrow: vi.fn(),
      getAllBots: vi.fn().mockReturnValue(new Map()),
      config: {} as any,
    };
  });

  describe('register', () => {
    it('should register a tool', () => {
      const tool = new MockTool(mockContext);
      registry.register(tool);
      expect(registry.has('mockTool')).toBe(true);
      expect(registry.size).toBe(1);
    });

    it('should throw on duplicate registration', () => {
      const tool1 = new MockTool(mockContext);
      const tool2 = new MockTool(mockContext);
      registry.register(tool1);
      expect(() => registry.register(tool2)).toThrow(DuplicateToolError);
    });
  });

  describe('registerAll', () => {
    it('should register multiple tools', () => {
      const tools = [new MockTool(mockContext), new AnotherMockTool(mockContext)];
      registry.registerAll(tools);
      expect(registry.size).toBe(2);
    });
  });

  describe('get', () => {
    it('should return tool by name', () => {
      const tool = new MockTool(mockContext);
      registry.register(tool);
      expect(registry.get('mockTool')).toBe(tool);
    });

    it('should return undefined for unknown tool', () => {
      expect(registry.get('unknown')).toBeUndefined();
    });
  });

  describe('getOrThrow', () => {
    it('should return tool by name', () => {
      const tool = new MockTool(mockContext);
      registry.register(tool);
      expect(registry.getOrThrow('mockTool')).toBe(tool);
    });

    it('should throw for unknown tool', () => {
      expect(() => registry.getOrThrow('unknown')).toThrow(ToolNotFoundError);
    });
  });

  describe('has', () => {
    it('should return true for registered tool', () => {
      registry.register(new MockTool(mockContext));
      expect(registry.has('mockTool')).toBe(true);
    });

    it('should return false for unknown tool', () => {
      expect(registry.has('unknown')).toBe(false);
    });
  });

  describe('listTools', () => {
    it('should return tool definitions', () => {
      registry.register(new MockTool(mockContext));
      registry.register(new AnotherMockTool(mockContext));

      const tools = registry.listTools();
      expect(tools).toHaveLength(2);
      expect(tools[0]).toHaveProperty('name');
      expect(tools[0]).toHaveProperty('description');
      expect(tools[0]).toHaveProperty('inputSchema');
    });
  });

  describe('listNames', () => {
    it('should return tool names', () => {
      registry.register(new MockTool(mockContext));
      registry.register(new AnotherMockTool(mockContext));

      const names = registry.listNames();
      expect(names).toContain('mockTool');
      expect(names).toContain('anotherMock');
    });
  });

  describe('getByCategory', () => {
    it('should return tools in category', () => {
      registry.register(new MockTool(mockContext));
      registry.register(new AnotherMockTool(mockContext));

      const utilityTools = registry.getByCategory('utility');
      expect(utilityTools).toHaveLength(1);
      expect(utilityTools[0].name).toBe('mockTool');

      const movementTools = registry.getByCategory('movement');
      expect(movementTools).toHaveLength(1);
      expect(movementTools[0].name).toBe('anotherMock');
    });

    it('should return empty array for unknown category', () => {
      const tools = registry.getByCategory('combat');
      expect(tools).toHaveLength(0);
    });
  });

  describe('getCategories', () => {
    it('should return all categories with tools', () => {
      registry.register(new MockTool(mockContext));
      registry.register(new AnotherMockTool(mockContext));

      const categories = registry.getCategories();
      expect(categories).toContain('utility');
      expect(categories).toContain('movement');
    });
  });

  describe('clear', () => {
    it('should remove all tools', () => {
      registry.register(new MockTool(mockContext));
      expect(registry.size).toBe(1);

      registry.clear();
      expect(registry.size).toBe(0);
    });
  });

  describe('execute', () => {
    it('should execute tool and return result', async () => {
      // Create a mock position with floored method
      const mockPosition = {
        x: 0,
        y: 64,
        z: 0,
        floored: () => mockPosition,
        offset: (dx: number, dy: number, dz: number) => ({
          x: mockPosition.x + dx,
          y: mockPosition.y + dy,
          z: mockPosition.z + dz,
          floored: () => mockPosition,
        }),
        clone: () => mockPosition,
      };

      // Create a mock bot with all required properties
      const mockBot = {
        username: 'TestBot',
        health: 20,
        food: 20,
        foodSaturation: 5,
        entity: { position: mockPosition, onGround: true },
        inventory: { items: () => [] },
        oxygenLevel: 20,
        time: { timeOfDay: 6000 },
        blockAt: () => ({ name: 'grass_block', biome: { name: 'plains' } }),
      };

      // Update mock to return the bot
      mockContext.getBotOrThrow = vi.fn().mockReturnValue(mockBot);

      registry.register(new MockTool(mockContext));

      const result = await registry.execute('mockTool', {});
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual({ message: 'Mock executed' });
      }
    });

    it('should throw for unknown tool', async () => {
      await expect(registry.execute('unknown', {})).rejects.toThrow(ToolNotFoundError);
    });
  });
});
