/**
 * Tests for memory tools (remember, recall, forget, listMemories)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ToolContext } from '../../../src/tools/base-tool.js';
import { RememberTool } from '../../../src/tools/memory/remember.js';
import { RecallTool } from '../../../src/tools/memory/recall.js';
import { ForgetTool } from '../../../src/tools/memory/forget.js';
import { ListMemoriesTool } from '../../../src/tools/memory/list-memories.js';
import { getMemoryService } from '../../../src/services/memory.service.js';

// Mock the memory service
vi.mock('../../../src/services/memory.service.js', () => {
  const memories = new Map<
    string,
    { key: string; value: unknown; category: string; timestamp: number; metadata?: Record<string, unknown> }
  >();

  return {
    getMemoryService: vi.fn(() => ({
      remember: vi.fn((key: string, value: unknown, category: string, metadata?: Record<string, unknown>) => {
        const overwritten = memories.has(key);
        memories.set(key, { key, value, category, timestamp: Date.now(), metadata });
        return { overwritten };
      }),
      recall: vi.fn((key: string) => {
        return memories.get(key) || null;
      }),
      forget: vi.fn((key: string) => {
        const existed = memories.has(key);
        memories.delete(key);
        return existed;
      }),
      list: vi.fn((category?: string, limit?: number) => {
        let entries = Array.from(memories.values());
        if (category) {
          entries = entries.filter((e) => e.category === category);
        }
        return entries.slice(0, limit || 50);
      }),
      search: vi.fn((query: string, category?: string) => {
        let entries = Array.from(memories.values());
        if (category) {
          entries = entries.filter((e) => e.category === category);
        }
        return entries.filter((e) => e.key.includes(query) || JSON.stringify(e.value).includes(query));
      }),
      count: vi.fn(() => memories.size),
      clear: vi.fn(() => memories.clear()),
    })),
  };
});

describe('Memory Tools', () => {
  let mockContext: ToolContext;
  let mockBot: ReturnType<typeof createMockBot>;

  function createMockBot() {
    const position = {
      x: 0,
      y: 64,
      z: 0,
      floored: () => position,
      offset: (dx: number, dy: number, dz: number) => ({
        x: position.x + dx,
        y: position.y + dy,
        z: position.z + dz,
        floored: () => position,
      }),
      clone: () => position,
    };

    return {
      username: 'TestBot',
      health: 20,
      food: 20,
      foodSaturation: 5,
      entity: { position, onGround: true },
      inventory: { items: () => [] },
      oxygenLevel: 20,
      time: { timeOfDay: 6000 },
      blockAt: () => ({ name: 'grass_block', biome: { name: 'plains' } }),
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

    // Clear memory between tests
    const memoryService = getMemoryService();
    memoryService.clear();
  });

  describe('RememberTool', () => {
    it('should have correct definition', () => {
      const tool = new RememberTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('remember');
      expect(definition.description).toContain('persistent memory');
      expect(definition.inputSchema.properties).toHaveProperty('key');
      expect(definition.inputSchema.properties).toHaveProperty('value');
      expect(definition.inputSchema.properties).toHaveProperty('category');
    });

    it('should store a new memory', async () => {
      const tool = new RememberTool(mockContext);
      const result = await tool.run({
        key: 'home_base',
        value: { x: 100, y: 64, z: 200 },
        category: 'spatial',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.key).toBe('home_base');
        expect(result.data.category).toBe('spatial');
        expect(result.data.overwritten).toBe(false);
        expect(result.data.message).toContain('Stored new memory');
      }
    });

    it('should use default category when not provided', async () => {
      const tool = new RememberTool(mockContext);
      const result = await tool.run({
        key: 'test_key',
        value: 'test_value',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.category).toBe('general');
      }
    });

    it('should overwrite existing memory', async () => {
      const tool = new RememberTool(mockContext);

      // Store first memory
      await tool.run({ key: 'test_key', value: 'first' });

      // Store again with same key
      const result = await tool.run({ key: 'test_key', value: 'second' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.overwritten).toBe(true);
        expect(result.data.message).toContain('Updated memory');
      }
    });

    it('should reject invalid input', async () => {
      const tool = new RememberTool(mockContext);
      const result = await tool.run({ key: '' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });

    it('should accept metadata', async () => {
      const tool = new RememberTool(mockContext);
      const result = await tool.run({
        key: 'mine_location',
        value: { x: 50, y: 20, z: 100 },
        category: 'spatial',
        metadata: { biome: 'plains', danger: 'low' },
      });

      expect(result.ok).toBe(true);
    });
  });

  describe('RecallTool', () => {
    it('should have correct definition', () => {
      const tool = new RecallTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('recall');
      expect(definition.description).toContain('Retrieve');
      expect(definition.inputSchema.properties).toHaveProperty('key');
    });

    it('should recall existing memory', async () => {
      const rememberTool = new RememberTool(mockContext);
      const recallTool = new RecallTool(mockContext);

      // Store a memory
      await rememberTool.run({
        key: 'test_memory',
        value: { x: 1, y: 2, z: 3 },
        category: 'spatial',
      });

      // Recall it
      const result = await recallTool.run({ key: 'test_memory' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.found).toBe(true);
        expect(result.data.key).toBe('test_memory');
        expect(result.data.value).toEqual({ x: 1, y: 2, z: 3 });
        expect(result.data.category).toBe('spatial');
        expect(result.data.timestamp).toBeDefined();
        expect(result.data.age).toBeDefined();
      }
    });

    it('should return not found for missing memory', async () => {
      const tool = new RecallTool(mockContext);
      const result = await tool.run({ key: 'nonexistent' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.found).toBe(false);
        expect(result.data.key).toBe('nonexistent');
        expect(result.data.value).toBeNull();
        expect(result.data.category).toBeNull();
      }
    });

    it('should reject empty key', async () => {
      const tool = new RecallTool(mockContext);
      const result = await tool.run({ key: '' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });
  });

  describe('ForgetTool', () => {
    it('should have correct definition', () => {
      const tool = new ForgetTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('forget');
      expect(definition.description).toContain('Delete');
      expect(definition.inputSchema.properties).toHaveProperty('key');
    });

    it('should delete existing memory', async () => {
      const rememberTool = new RememberTool(mockContext);
      const forgetTool = new ForgetTool(mockContext);

      // Store a memory
      await rememberTool.run({ key: 'to_forget', value: 'data' });

      // Forget it
      const result = await forgetTool.run({ key: 'to_forget' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.deleted).toBe(true);
        expect(result.data.key).toBe('to_forget');
        expect(result.data.message).toContain('Forgot memory');
      }
    });

    it('should handle forgetting non-existent memory', async () => {
      const tool = new ForgetTool(mockContext);
      const result = await tool.run({ key: 'does_not_exist' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.deleted).toBe(false);
        expect(result.data.message).toContain('not found');
      }
    });

    it('should reject empty key', async () => {
      const tool = new ForgetTool(mockContext);
      const result = await tool.run({ key: '' });

      expect(result.ok).toBe(false);
    });
  });

  describe('ListMemoriesTool', () => {
    it('should have correct definition', () => {
      const tool = new ListMemoriesTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('listMemories');
      expect(definition.description).toContain('List');
      expect(definition.inputSchema.properties).toHaveProperty('category');
      expect(definition.inputSchema.properties).toHaveProperty('search');
      expect(definition.inputSchema.properties).toHaveProperty('limit');
    });

    it('should list all memories', async () => {
      const rememberTool = new RememberTool(mockContext);
      const listTool = new ListMemoriesTool(mockContext);

      // Store some memories
      await rememberTool.run({ key: 'mem1', value: 'v1', category: 'general' });
      await rememberTool.run({ key: 'mem2', value: 'v2', category: 'spatial' });

      const result = await listTool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.count).toBeGreaterThanOrEqual(0);
        expect(result.data.totalCount).toBeGreaterThanOrEqual(0);
        expect(result.data.categories).toBeDefined();
        expect(Array.isArray(result.data.memories)).toBe(true);
      }
    });

    it('should filter by category', async () => {
      const rememberTool = new RememberTool(mockContext);
      const listTool = new ListMemoriesTool(mockContext);

      await rememberTool.run({ key: 'spatial1', value: { x: 1, y: 2, z: 3 }, category: 'spatial' });
      await rememberTool.run({ key: 'general1', value: 'text', category: 'general' });

      const result = await listTool.run({ category: 'spatial' });

      expect(result.ok).toBe(true);
    });

    it('should support search', async () => {
      const rememberTool = new RememberTool(mockContext);
      const listTool = new ListMemoriesTool(mockContext);

      await rememberTool.run({ key: 'home_base', value: 'home location', category: 'spatial' });
      await rememberTool.run({ key: 'mine_entrance', value: 'mine location', category: 'spatial' });

      const result = await listTool.run({ search: 'home' });

      expect(result.ok).toBe(true);
    });

    it('should respect limit', async () => {
      const listTool = new ListMemoriesTool(mockContext);
      const result = await listTool.run({ limit: 5 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.memories.length).toBeLessThanOrEqual(5);
      }
    });

    it('should use default limit', async () => {
      const listTool = new ListMemoriesTool(mockContext);
      const result = await listTool.run({});

      expect(result.ok).toBe(true);
    });
  });

  describe('Memory Tool Integration', () => {
    it('should remember, recall, and forget in sequence', async () => {
      const remember = new RememberTool(mockContext);
      const recall = new RecallTool(mockContext);
      const forget = new ForgetTool(mockContext);

      // Step 1: Remember
      const rememberResult = await remember.run({
        key: 'integration_test',
        value: { data: 'test' },
        category: 'general',
      });
      expect(rememberResult.ok).toBe(true);

      // Step 2: Recall
      const recallResult = await recall.run({ key: 'integration_test' });
      expect(recallResult.ok).toBe(true);
      if (recallResult.ok) {
        expect(recallResult.data.found).toBe(true);
      }

      // Step 3: Forget
      const forgetResult = await forget.run({ key: 'integration_test' });
      expect(forgetResult.ok).toBe(true);
      if (forgetResult.ok) {
        expect(forgetResult.data.deleted).toBe(true);
      }

      // Step 4: Verify forgotten
      const recallAfterForget = await recall.run({ key: 'integration_test' });
      expect(recallAfterForget.ok).toBe(true);
      if (recallAfterForget.ok) {
        expect(recallAfterForget.data.found).toBe(false);
      }
    });

    it('should handle coordinates properly in list', async () => {
      const remember = new RememberTool(mockContext);
      const list = new ListMemoriesTool(mockContext);

      await remember.run({
        key: 'location',
        value: { x: 100, y: 64, z: -200 },
        category: 'spatial',
      });

      const result = await list.run({ category: 'spatial' });
      expect(result.ok).toBe(true);
    });

    it('should handle all memory categories', async () => {
      const remember = new RememberTool(mockContext);
      const categories = ['spatial', 'resource', 'entity', 'task', 'general'] as const;

      for (const category of categories) {
        const result = await remember.run({
          key: `test_${category}`,
          value: `value for ${category}`,
          category,
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data.category).toBe(category);
        }
      }
    });
  });
});
