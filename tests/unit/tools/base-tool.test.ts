/**
 * Tests for the base tool class
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { BaseTool, BaseInputSchema, type ToolContext } from '../../../src/tools/base-tool.js';

// Test tool implementation
class TestTool extends BaseTool<{ username?: string; value: number }, { result: number }> {
  readonly name = 'testTool';
  readonly description = 'A test tool';
  readonly category = 'utility' as const;
  readonly inputSchema = BaseInputSchema.extend({
    value: z.number().describe('A test value'),
  });

  protected async execute(input: { username?: string; value: number }): Promise<{ result: number }> {
    return { result: input.value * 2 };
  }
}

// Tool that throws errors
class ErrorTool extends BaseTool<{ username?: string }, never> {
  readonly name = 'errorTool';
  readonly description = 'A tool that throws errors';
  readonly category = 'utility' as const;
  readonly inputSchema = BaseInputSchema;

  protected async execute(): Promise<never> {
    throw new Error('Test error');
  }
}

// Tool with async execution
class AsyncTool extends BaseTool<{ username?: string; delay: number }, { delayed: boolean }> {
  readonly name = 'asyncTool';
  readonly description = 'A tool with async delay';
  readonly category = 'utility' as const;
  readonly inputSchema = BaseInputSchema.extend({
    delay: z.number().default(10),
  });

  protected async execute(input: { username?: string; delay: number }): Promise<{ delayed: boolean }> {
    await new Promise((resolve) => setTimeout(resolve, input.delay));
    return { delayed: true };
  }
}

describe('BaseTool', () => {
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
  });

  describe('getDefinition', () => {
    it('should return tool definition with correct properties', () => {
      const tool = new TestTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('testTool');
      expect(definition.description).toBe('A test tool');
      expect(definition.inputSchema).toBeDefined();
      expect(definition.inputSchema.type).toBe('object');
    });

    it('should include input schema properties', () => {
      const tool = new TestTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.inputSchema.properties).toHaveProperty('username');
      expect(definition.inputSchema.properties).toHaveProperty('value');
    });
  });

  describe('run', () => {
    it('should execute successfully with valid input', async () => {
      const tool = new TestTool(mockContext);
      const result = await tool.run({ value: 21 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual({ result: 42 });
        expect(result.bot).toBe('TestBot');
        expect(result.status).toBeDefined();
      }
    });

    it('should return error for invalid input', async () => {
      const tool = new TestTool(mockContext);
      const result = await tool.run({ value: 'not a number' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Invalid input');
        expect(result.code).toBe('INVALID_INPUT');
      }
    });

    it('should return error for missing required input', async () => {
      const tool = new TestTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });

    it('should handle tool execution errors', async () => {
      const tool = new ErrorTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Test error');
      }
    });

    it('should pass username to getBotOrThrow', async () => {
      const tool = new TestTool(mockContext);
      await tool.run({ value: 10, username: 'SpecificBot' });

      expect(mockContext.getBotOrThrow).toHaveBeenCalledWith('SpecificBot');
    });

    it('should work without username (uses default bot)', async () => {
      const tool = new TestTool(mockContext);
      await tool.run({ value: 10 });

      expect(mockContext.getBotOrThrow).toHaveBeenCalledWith(undefined);
    });
  });

  describe('async execution', () => {
    it('should handle async tool execution', async () => {
      const tool = new AsyncTool(mockContext);
      const start = Date.now();
      const result = await tool.run({ delay: 50 });
      const elapsed = Date.now() - start;

      expect(result.ok).toBe(true);
      expect(elapsed).toBeGreaterThanOrEqual(40); // Allow some tolerance
    });

    it('should use default values from schema', async () => {
      const tool = new AsyncTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual({ delayed: true });
      }
    });
  });

  describe('status tracking', () => {
    it('should include status in successful response', async () => {
      const tool = new TestTool(mockContext);
      const result = await tool.run({ value: 10 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.status).toBeDefined();
        expect(result.status.health).toBe(20);
        expect(result.status.food).toBe(20);
      }
    });

    it('should include delta in successful response', async () => {
      const tool = new TestTool(mockContext);
      const result = await tool.run({ value: 10 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.delta).toBeDefined();
        expect(result.delta.healthDelta).toBe(0);
        expect(result.delta.foodDelta).toBe(0);
      }
    });
  });

  describe('error handling', () => {
    it('should handle bot not found error', async () => {
      mockContext.getBotOrThrow = vi.fn().mockImplementation(() => {
        throw new Error("Bot 'unknown' not found");
      });

      const tool = new TestTool(mockContext);
      const result = await tool.run({ value: 10 });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('not found');
      }
    });

    it('should preserve error codes', async () => {
      const errorWithCode = new Error('Custom error');
      (errorWithCode as Error & { code: string }).code = 'CUSTOM_CODE';

      class CodeErrorTool extends BaseTool<{ username?: string }, never> {
        readonly name = 'codeErrorTool';
        readonly description = 'Tool with code error';
        readonly category = 'utility' as const;
        readonly inputSchema = BaseInputSchema;

        protected async execute(): Promise<never> {
          throw errorWithCode;
        }
      }

      const tool = new CodeErrorTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('CUSTOM_CODE');
      }
    });
  });

  describe('input validation', () => {
    it('should coerce valid types', async () => {
      const tool = new TestTool(mockContext);
      // Numbers as strings should be coerced
      const result = await tool.run({ value: 10 });

      expect(result.ok).toBe(true);
    });

    it('should reject extra properties with strict schema', async () => {
      class StrictTool extends BaseTool<{ username?: string }, { ok: boolean }> {
        readonly name = 'strictTool';
        readonly description = 'Strict input tool';
        readonly category = 'utility' as const;
        readonly inputSchema = BaseInputSchema.strict();

        protected async execute(): Promise<{ ok: boolean }> {
          return { ok: true };
        }
      }

      const tool = new StrictTool(mockContext);
      const result = await tool.run({ extraProp: 'value' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });
  });
});

describe('BaseInputSchema', () => {
  it('should accept empty object', () => {
    const result = BaseInputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept object with username', () => {
    const result = BaseInputSchema.safeParse({ username: 'TestBot' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.username).toBe('TestBot');
    }
  });

  it('should accept undefined username', () => {
    const result = BaseInputSchema.safeParse({ username: undefined });
    expect(result.success).toBe(true);
  });

  it('should reject non-string username', () => {
    const result = BaseInputSchema.safeParse({ username: 123 });
    expect(result.success).toBe(false);
  });
});
