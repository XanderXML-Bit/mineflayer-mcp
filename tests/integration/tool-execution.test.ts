/**
 * Integration tests for tool execution
 *
 * Tests tool execution flows with status tracking and error handling.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestContext,
  createMockBot,
  
  createMockPosition,
  
} from './setup.js';
import { ToolRegistry, createToolRegistry } from '../../src/tools/registry.js';
import { createObservationTools } from '../../src/tools/observation/index.js';
import { createCommunicationTools } from '../../src/tools/communication/index.js';
import { createUtilityTools } from '../../src/tools/utility/index.js';

describe('Tool Execution Integration', () => {
  let registry: ToolRegistry;
  let bots: Map<string, ReturnType<typeof createMockBot>>;

  beforeEach(() => {
    registry = createToolRegistry();
    bots = new Map();
  });

  describe('observation tools', () => {
    it('should execute lookAround and return environment info', async () => {
      const bot = createMockBot('Observer');
      bots.set('Observer', bot);

      const context = createTestContext({ bots: bots as any });
      const tools = createObservationTools(context);
      registry.registerAll(tools);

      const result = await registry.execute('lookAround', { username: 'Observer' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.bot).toBe('Observer');
        expect(result.status).toBeDefined();
        expect(result.status?.health).toBe(20);
      }
    });

    it('should execute getPosition and return coordinates', async () => {
      const bot = createMockBot('Locator');
      bot.entity.position = createMockPosition(100, 64, -200);
      bots.set('Locator', bot);

      const context = createTestContext({ bots: bots as any });
      const tools = createObservationTools(context);
      registry.registerAll(tools);

      const result = await registry.execute('getPosition', { username: 'Locator' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.position).toMatchObject({
          x: 100,
          y: 64,
          z: -200,
        });
      }
    });
  });

  describe('communication tools', () => {
    it('should execute sendChat', async () => {
      const bot = createMockBot('Chatter');
      bots.set('Chatter', bot);

      const context = createTestContext({ bots: bots as any });
      const tools = createCommunicationTools(context);
      registry.registerAll(tools);

      const result = await registry.execute('sendChat', {
        username: 'Chatter',
        message: 'Hello, world!',
      });

      expect(result.ok).toBe(true);
      expect(bot.chat).toHaveBeenCalledWith('Hello, world!');
    });
  });

  describe('utility tools', () => {
    it('should execute stopAllTasks', async () => {
      const bot = createMockBot('Worker');
      bots.set('Worker', bot);

      const context = createTestContext({ bots: bots as any });
      const tools = createUtilityTools(context);
      registry.registerAll(tools);

      const result = await registry.execute('stopAllTasks', { username: 'Worker' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.stoppedBots).toContain('Worker');
      }
    });

    it('should stop all bots when stopAll is true', async () => {
      const bot1 = createMockBot('Worker1');
      const bot2 = createMockBot('Worker2');
      bots.set('Worker1', bot1);
      bots.set('Worker2', bot2);

      const context = createTestContext({ bots: bots as any });
      const tools = createUtilityTools(context);
      registry.registerAll(tools);

      const result = await registry.execute('stopAllTasks', {
        username: 'Worker1',
        stopAll: true,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.stoppedBots).toContain('Worker1');
        expect(result.data.stoppedBots).toContain('Worker2');
        expect(result.data.stoppedBots).toHaveLength(2);
      }
    });
  });

  describe('status tracking', () => {
    it('should include status in successful results', async () => {
      const bot = createMockBot('StatusBot');
      bot.health = 18;
      bot.food = 15;
      bots.set('StatusBot', bot);

      const context = createTestContext({ bots: bots as any });
      const tools = createObservationTools(context);
      registry.registerAll(tools);

      const result = await registry.execute('getPosition', { username: 'StatusBot' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.status).toBeDefined();
        expect(result.status?.health).toBe(18);
        expect(result.status?.food).toBe(15);
      }
    });

    it('should calculate status delta', async () => {
      const bot = createMockBot('DeltaBot');
      bots.set('DeltaBot', bot);

      const context = createTestContext({ bots: bots as any });
      const tools = createObservationTools(context);
      registry.registerAll(tools);

      const result = await registry.execute('getPosition', { username: 'DeltaBot' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Delta should be defined (even if all zeros for no-op operation)
        expect(result.delta).toBeDefined();
      }
    });
  });

  describe('error handling', () => {
    it('should return error for unknown tool', async () => {
      await expect(registry.execute('unknownTool', {})).rejects.toThrow();
    });

    it('should return error for missing bot', async () => {
      const context = createTestContext({ bots: bots as any });
      const tools = createObservationTools(context);
      registry.registerAll(tools);

      const result = await registry.execute('getPosition', { username: 'NonExistent' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('not found');
      }
    });

    it('should return error for invalid input', async () => {
      const bot = createMockBot('ValidatorBot');
      bots.set('ValidatorBot', bot);

      const context = createTestContext({ bots: bots as any });
      const tools = createCommunicationTools(context);
      registry.registerAll(tools);

      // sendChat requires a message
      const result = await registry.execute('sendChat', { username: 'ValidatorBot' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Invalid input');
      }
    });
  });

  describe('registry operations', () => {
    it('should list all registered tools', () => {
      const bot = createMockBot('ListBot');
      bots.set('ListBot', bot);

      const context = createTestContext({ bots: bots as any });

      registry.registerAll(createObservationTools(context));
      registry.registerAll(createCommunicationTools(context));
      registry.registerAll(createUtilityTools(context));

      const toolNames = registry.listNames();

      expect(toolNames).toContain('lookAround');
      expect(toolNames).toContain('getPosition');
      expect(toolNames).toContain('sendChat');
      expect(toolNames).toContain('stopAllTasks');
    });

    it('should filter tools by category', () => {
      const bot = createMockBot('CategoryBot');
      bots.set('CategoryBot', bot);

      const context = createTestContext({ bots: bots as any });

      registry.registerAll(createObservationTools(context));
      registry.registerAll(createCommunicationTools(context));
      registry.registerAll(createUtilityTools(context));

      const observationTools = registry.getByCategory('observation');
      const communicationTools = registry.getByCategory('communication');
      const utilityTools = registry.getByCategory('utility');

      expect(observationTools.length).toBeGreaterThan(0);
      expect(communicationTools.length).toBeGreaterThan(0);
      expect(utilityTools.length).toBeGreaterThan(0);

      // All observation tools should have observation category
      observationTools.forEach((tool) => {
        expect(tool.category).toBe('observation');
      });
    });
  });
});
