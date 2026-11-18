/**
 * Shield Service Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Bot } from 'mineflayer';
import type { Item } from 'prismarine-item';

import {
  initializeShieldService,
  setShieldServiceEnabled,
  configureShieldService,
  getShieldStatus,
  raiseShieldNow,
  lowerShieldNow,
  cleanupShieldService,
  DEFAULT_SHIELD_CONFIG,
} from '../../../src/services/shield.service.js';

function createMockBot(): Bot {
  const inventory = {
    items: vi.fn().mockReturnValue([]),
    slots: {} as Record<number, Item | null>,
  };

  const bot = {
    username: 'TestBot',
    entity: {
      position: { x: 0, y: 64, z: 0, distanceTo: vi.fn().mockReturnValue(100) },
      yaw: 0,
    },
    entities: {},
    inventory,
    health: 20,
    equip: vi.fn().mockResolvedValue(undefined),
    activateItem: vi.fn(),
    deactivateItem: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
  } as unknown as Bot;

  return bot;
}

function createMockShield(): Item {
  return {
    name: 'shield',
    count: 1,
    type: 0,
    slot: 10,
  } as Item;
}

describe('ShieldService', () => {
  let bot: Bot;

  beforeEach(() => {
    bot = createMockBot();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanupShieldService(bot);
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('DEFAULT_SHIELD_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_SHIELD_CONFIG.enabled).toBe(true);
      expect(DEFAULT_SHIELD_CONFIG.autoBlockRange).toBe(6);
      expect(DEFAULT_SHIELD_CONFIG.counterAttackWindowMs).toBe(400);
    });
  });

  describe('initializeShieldService', () => {
    it('should initialize with default config', () => {
      initializeShieldService(bot);
      const status = getShieldStatus(bot);

      expect(status.enabled).toBe(true);
      expect(status.config.autoBlockRange).toBe(6);
    });

    it('should accept custom config', () => {
      initializeShieldService(bot, { autoBlockRange: 10 });
      const status = getShieldStatus(bot);

      expect(status.config.autoBlockRange).toBe(10);
    });

    it('should not start when disabled', () => {
      initializeShieldService(bot, { enabled: false });
      const status = getShieldStatus(bot);

      expect(status.enabled).toBe(false);
    });
  });

  describe('setShieldServiceEnabled', () => {
    it('should enable shield service', () => {
      initializeShieldService(bot, { enabled: false });
      setShieldServiceEnabled(bot, true);

      expect(getShieldStatus(bot).enabled).toBe(true);
    });

    it('should disable shield service', () => {
      initializeShieldService(bot);
      setShieldServiceEnabled(bot, false);

      expect(getShieldStatus(bot).enabled).toBe(false);
    });
  });

  describe('configureShieldService', () => {
    it('should update config', () => {
      initializeShieldService(bot);
      configureShieldService(bot, { autoBlockRange: 8 });

      expect(getShieldStatus(bot).config.autoBlockRange).toBe(8);
    });
  });

  describe('getShieldStatus', () => {
    it('should return current status', () => {
      initializeShieldService(bot);
      const status = getShieldStatus(bot);

      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('config');
      expect(status).toHaveProperty('hasShieldEquipped');
      expect(status).toHaveProperty('isBlocking');
      expect(status).toHaveProperty('hasShieldInInventory');
    });

    it('should detect shield in inventory', () => {
      const shield = createMockShield();
      (bot.inventory.items as any).mockReturnValue([shield]);

      initializeShieldService(bot);
      const status = getShieldStatus(bot);

      expect(status.hasShieldInInventory).toBe(true);
    });

    it('should detect shield in offhand', () => {
      const shield = createMockShield();
      (bot.inventory as any).slots[45] = shield;

      initializeShieldService(bot);
      const status = getShieldStatus(bot);

      expect(status.hasShieldEquipped).toBe(true);
    });
  });

  describe('raiseShieldNow', () => {
    it('should raise shield when available in offhand', async () => {
      const shield = createMockShield();
      (bot.inventory as any).slots[45] = shield;

      initializeShieldService(bot);
      const result = await raiseShieldNow(bot);

      expect(bot.activateItem).toHaveBeenCalledWith(true);
      expect(result).toBe(true);
    });

    it('should equip shield first if in inventory', async () => {
      const shield = createMockShield();
      (bot.inventory.items as any).mockReturnValue([shield]);

      initializeShieldService(bot);
      await raiseShieldNow(bot);

      expect(bot.equip).toHaveBeenCalledWith(shield, 'off-hand');
    });

    it('should return false when no shield available', async () => {
      (bot.inventory.items as any).mockReturnValue([]);

      initializeShieldService(bot);
      const result = await raiseShieldNow(bot);

      expect(result).toBe(false);
    });
  });

  describe('lowerShieldNow', () => {
    it('should lower shield when blocking', async () => {
      const shield = createMockShield();
      (bot.inventory as any).slots[45] = shield;

      initializeShieldService(bot);
      // First raise the shield to set isBlocking = true
      await raiseShieldNow(bot);
      // Then lower it
      lowerShieldNow(bot);

      expect(bot.deactivateItem).toHaveBeenCalled();
    });
  });

  describe('cleanupShieldService', () => {
    it('should cleanup without error', () => {
      initializeShieldService(bot);
      cleanupShieldService(bot);
      cleanupShieldService(bot);
    });

    it('should handle cleanup when not initialized', () => {
      cleanupShieldService(bot);
    });
  });
});
