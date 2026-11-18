/**
 * Integration tests for multi-bot scenarios
 *
 * Tests targeting specific bots by username and managing multiple bots.
 */

import { describe, it, expect } from 'vitest';
import {
  createTestContext,
  createMockBot,
  createMockBotManager,
  createMockPosition,
} from './setup.js';
import {  createToolRegistry } from '../../src/tools/registry.js';
import { createConnectionTools } from '../../src/tools/connection/index.js';
import { createObservationTools } from '../../src/tools/observation/index.js';
import { createCommunicationTools } from '../../src/tools/communication/index.js';
import { createUtilityTools } from '../../src/tools/utility/index.js';

describe('Multi-Bot Integration', () => {
  describe('targeting specific bots', () => {
    it('should execute tool on specific bot by username', async () => {
      const bot1 = createMockBot('Alice');
      const bot2 = createMockBot('Bob');

      // Set different positions
      bot1.entity.position = createMockPosition(100, 64, 100);
      bot2.entity.position = createMockPosition(-50, 70, -50);

      const bots = new Map<string, any>([
        ['Alice', bot1],
        ['Bob', bot2],
      ]);

      const context = createTestContext({ bots });
      const registry = createToolRegistry();
      registry.registerAll(createObservationTools(context));

      // Get Alice's position
      const aliceResult = await registry.execute('getPosition', { username: 'Alice' });
      expect(aliceResult.ok).toBe(true);
      if (aliceResult.ok) {
        expect(aliceResult.data.position.x).toBe(100);
        expect(aliceResult.bot).toBe('Alice');
      }

      // Get Bob's position
      const bobResult = await registry.execute('getPosition', { username: 'Bob' });
      expect(bobResult.ok).toBe(true);
      if (bobResult.ok) {
        expect(bobResult.data.position.x).toBe(-50);
        expect(bobResult.bot).toBe('Bob');
      }
    });

    it('should send chat from specific bot', async () => {
      const bot1 = createMockBot('Sender1');
      const bot2 = createMockBot('Sender2');

      const bots = new Map<string, any>([
        ['Sender1', bot1],
        ['Sender2', bot2],
      ]);

      const context = createTestContext({ bots });
      const registry = createToolRegistry();
      registry.registerAll(createCommunicationTools(context));

      await registry.execute('sendChat', {
        username: 'Sender1',
        message: 'Hello from Sender1',
      });

      await registry.execute('sendChat', {
        username: 'Sender2',
        message: 'Hello from Sender2',
      });

      expect(bot1.chat).toHaveBeenCalledWith('Hello from Sender1');
      expect(bot2.chat).toHaveBeenCalledWith('Hello from Sender2');
    });
  });

  describe('multi-bot lifecycle', () => {
    it('should manage multiple bot connections', async () => {
      const botManager = createMockBotManager();
      const context = createTestContext({
        bots: botManager.bots,
        botManager,
      });

      const [joinGame, leaveGame] = createConnectionTools(context);

      // Connect three bots
      await joinGame.run({ username: 'Bot1' });
      await joinGame.run({ username: 'Bot2' });
      await joinGame.run({ username: 'Bot3' });

      expect(botManager.getUsernames()).toEqual(['Bot1', 'Bot2', 'Bot3']);

      // Disconnect one
      await leaveGame.run({ username: 'Bot2' });
      expect(botManager.getUsernames()).toEqual(['Bot1', 'Bot3']);

      // Disconnect all
      await leaveGame.run({ all: true });
      expect(botManager.getUsernames()).toEqual([]);
    });

    it('should require username when multiple bots active', async () => {
      const bot1 = createMockBot('Bot1');
      const bot2 = createMockBot('Bot2');

      const bots = new Map<string, any>([
        ['Bot1', bot1],
        ['Bot2', bot2],
      ]);

      const context = createTestContext({ bots });
      const registry = createToolRegistry();
      registry.registerAll(createObservationTools(context));

      // Should fail without username when multiple bots exist
      const result = await registry.execute('getPosition', {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Multiple bots');
      }
    });

    it('should work without username when only one bot active', async () => {
      const bot = createMockBot('OnlyBot');
      const bots = new Map<string, any>([['OnlyBot', bot]]);

      const context = createTestContext({ bots });
      const registry = createToolRegistry();
      registry.registerAll(createObservationTools(context));

      // Should work without username when only one bot
      const result = await registry.execute('getPosition', {});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.bot).toBe('OnlyBot');
      }
    });
  });

  describe('stopAllTasks across multiple bots', () => {
    it('should stop tasks on all bots when stopAll=true', async () => {
      const bot1 = createMockBot('Worker1');
      const bot2 = createMockBot('Worker2');
      const bot3 = createMockBot('Worker3');

      const bots = new Map<string, any>([
        ['Worker1', bot1],
        ['Worker2', bot2],
        ['Worker3', bot3],
      ]);

      const context = createTestContext({ bots });
      const registry = createToolRegistry();
      registry.registerAll(createUtilityTools(context));

      const result = await registry.execute('stopAllTasks', {
        username: 'Worker1',
        stopAll: true,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.stoppedBots).toHaveLength(3);
        expect(result.data.stoppedBots).toContain('Worker1');
        expect(result.data.stoppedBots).toContain('Worker2');
        expect(result.data.stoppedBots).toContain('Worker3');
      }

      // Verify pathfinder.stop was called on all bots
      expect(bot1.pathfinder.stop).toHaveBeenCalled();
      expect(bot2.pathfinder.stop).toHaveBeenCalled();
      expect(bot3.pathfinder.stop).toHaveBeenCalled();
    });

    it('should only stop tasks on specified bot when stopAll=false', async () => {
      const bot1 = createMockBot('Worker1');
      const bot2 = createMockBot('Worker2');

      const bots = new Map<string, any>([
        ['Worker1', bot1],
        ['Worker2', bot2],
      ]);

      const context = createTestContext({ bots });
      const registry = createToolRegistry();
      registry.registerAll(createUtilityTools(context));

      const result = await registry.execute('stopAllTasks', {
        username: 'Worker1',
        stopAll: false,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.stoppedBots).toHaveLength(1);
        expect(result.data.stoppedBots).toContain('Worker1');
      }

      // Only Worker1's pathfinder should be stopped
      expect(bot1.pathfinder.stop).toHaveBeenCalled();
      expect(bot2.pathfinder.stop).not.toHaveBeenCalled();
    });
  });

  describe('independent bot status', () => {
    it('should track status independently for each bot', async () => {
      const bot1 = createMockBot('HealthyBot');
      const bot2 = createMockBot('HurtBot');

      bot1.health = 20;
      bot1.food = 20;
      bot2.health = 5;
      bot2.food = 3;

      const bots = new Map<string, any>([
        ['HealthyBot', bot1],
        ['HurtBot', bot2],
      ]);

      const context = createTestContext({ bots });
      const registry = createToolRegistry();
      registry.registerAll(createObservationTools(context));

      const healthyResult = await registry.execute('getPosition', { username: 'HealthyBot' });
      const hurtResult = await registry.execute('getPosition', { username: 'HurtBot' });

      expect(healthyResult.ok).toBe(true);
      expect(hurtResult.ok).toBe(true);

      if (healthyResult.ok && hurtResult.ok) {
        expect(healthyResult.status?.health).toBe(20);
        expect(healthyResult.status?.food).toBe(20);
        expect(hurtResult.status?.health).toBe(5);
        expect(hurtResult.status?.food).toBe(3);
      }
    });
  });
});
