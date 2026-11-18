/**
 * Integration tests for connection tools
 *
 * Tests the connection flow: joinGame -> operations -> leaveGame
 */

import { describe, it, expect } from 'vitest';
import {
  createTestEnvironment,
  createMockBotManager,
  createTestContext,
} from './setup.js';
import { createConnectionTools } from '../../src/tools/connection/index.js';

describe('Connection Tools Integration', () => {
  describe('joinGame -> leaveGame flow', () => {
    it('should connect a bot and disconnect it', async () => {
      const botManager = createMockBotManager();
      const context = createTestContext({
        bots: botManager.bots,
        botManager,
      });

      const [joinGame, leaveGame] = createConnectionTools(context);

      // Join game
      const joinResult = await joinGame.run({
        username: 'IntegrationBot',
        host: 'localhost',
        port: 25565,
      });

      expect(joinResult.ok).toBe(true);
      if (joinResult.ok) {
        expect(joinResult.data.username).toBe('IntegrationBot');
        expect(joinResult.data.host).toBe('localhost');
        expect(joinResult.data.port).toBe(25565);
      }

      // Verify bot exists
      expect(botManager.has('IntegrationBot')).toBe(true);

      // Leave game
      const leaveResult = await leaveGame.run({
        username: 'IntegrationBot',
      });

      expect(leaveResult.ok).toBe(true);
      if (leaveResult.ok) {
        expect(leaveResult.data.disconnected).toContain('IntegrationBot');
        expect(leaveResult.data.count).toBe(1);
      }

      // Verify bot is removed
      expect(botManager.has('IntegrationBot')).toBe(false);
    });

    it('should handle multiple bots', async () => {
      const botManager = createMockBotManager();
      const context = createTestContext({
        bots: botManager.bots,
        botManager,
      });

      const [joinGame, leaveGame] = createConnectionTools(context);

      // Join multiple bots
      await joinGame.run({ username: 'Bot1', host: 'localhost', port: 25565 });
      await joinGame.run({ username: 'Bot2', host: 'localhost', port: 25565 });

      expect(botManager.getUsernames()).toHaveLength(2);
      expect(botManager.has('Bot1')).toBe(true);
      expect(botManager.has('Bot2')).toBe(true);

      // Leave specific bot
      const leaveResult = await leaveGame.run({ username: 'Bot1' });

      expect(leaveResult.ok).toBe(true);
      expect(botManager.has('Bot1')).toBe(false);
      expect(botManager.has('Bot2')).toBe(true);
    });

    it('should disconnect all bots with all flag', async () => {
      const botManager = createMockBotManager();
      const context = createTestContext({
        bots: botManager.bots,
        botManager,
      });

      const [joinGame, leaveGame] = createConnectionTools(context);

      // Join multiple bots
      await joinGame.run({ username: 'Bot1' });
      await joinGame.run({ username: 'Bot2' });
      await joinGame.run({ username: 'Bot3' });

      expect(botManager.getUsernames()).toHaveLength(3);

      // Leave all
      const leaveResult = await leaveGame.run({ all: true });

      expect(leaveResult.ok).toBe(true);
      if (leaveResult.ok) {
        expect(leaveResult.data.disconnected).toHaveLength(3);
        expect(leaveResult.data.count).toBe(3);
      }

      expect(botManager.getUsernames()).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('should return error for non-existent bot', async () => {
      const botManager = createMockBotManager();
      const context = createTestContext({
        bots: botManager.bots,
        botManager,
      });

      const [, leaveGame] = createConnectionTools(context);

      const result = await leaveGame.run({ username: 'NonExistent' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('not found');
      }
    });

    it('should return error when no bots to disconnect', async () => {
      const botManager = createMockBotManager();
      const context = createTestContext({
        bots: botManager.bots,
        botManager,
      });

      const [, leaveGame] = createConnectionTools(context);

      const result = await leaveGame.run({});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('No active bots');
      }
    });

    it('should return error for invalid input', async () => {
      const botManager = createMockBotManager();
      const context = createTestContext({
        bots: botManager.bots,
        botManager,
      });

      const [joinGame] = createConnectionTools(context);

      // Missing required username
      const result = await joinGame.run({});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Invalid input');
      }
    });
  });

  describe('tool definitions', () => {
    it('should have correct tool definitions', () => {
      const { context } = createTestEnvironment() as any;
      const tools = createConnectionTools(context);

      expect(tools).toHaveLength(2);

      const joinDef = tools[0].getDefinition();
      expect(joinDef.name).toBe('joinGame');
      expect(joinDef.description).toContain('Connect');
      expect(joinDef.inputSchema).toBeDefined();

      const leaveDef = tools[1].getDefinition();
      expect(leaveDef.name).toBe('leaveGame');
      expect(leaveDef.description).toContain('Disconnect');
    });
  });
});
