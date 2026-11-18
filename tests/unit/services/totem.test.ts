/**
 * Totem Service Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Bot } from 'mineflayer';
import type { Item } from 'prismarine-item';

import {
  initializeTotemService,
  setTotemServiceEnabled,
  configureTotemService,
  getTotemStatus,
  equipTotemNow,
  cleanupTotemService,
  DEFAULT_TOTEM_CONFIG,
} from '../../../src/services/totem.service.js';

function createMockBot(): Bot {
  const inventory = {
    items: vi.fn().mockReturnValue([]),
    slots: {} as Record<number, Item | null>,
  };

  const bot = {
    username: 'TestBot',
    entity: { position: { x: 0, y: 64, z: 0 } },
    inventory,
    health: 20,
    equip: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
  } as unknown as Bot;

  return bot;
}

function createMockTotem(): Item {
  return {
    name: 'totem_of_undying',
    count: 1,
    type: 0,
    slot: 10,
  } as Item;
}

describe('TotemService', () => {
  let bot: Bot;

  beforeEach(() => {
    bot = createMockBot();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanupTotemService(bot);
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('DEFAULT_TOTEM_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_TOTEM_CONFIG.enabled).toBe(true);
      expect(DEFAULT_TOTEM_CONFIG.healthThreshold).toBe(10);
      expect(DEFAULT_TOTEM_CONFIG.alwaysEquip).toBe(false);
      expect(DEFAULT_TOTEM_CONFIG.checkIntervalMs).toBe(500);
    });
  });

  describe('initializeTotemService', () => {
    it('should initialize with default config', () => {
      initializeTotemService(bot);
      const status = getTotemStatus(bot);

      expect(status.enabled).toBe(true);
      expect(status.config.healthThreshold).toBe(10);
    });

    it('should accept custom config', () => {
      initializeTotemService(bot, { healthThreshold: 15 });
      const status = getTotemStatus(bot);

      expect(status.config.healthThreshold).toBe(15);
    });

    it('should not start when disabled', () => {
      initializeTotemService(bot, { enabled: false });
      const status = getTotemStatus(bot);

      expect(status.enabled).toBe(false);
    });
  });

  describe('setTotemServiceEnabled', () => {
    it('should enable totem service', () => {
      initializeTotemService(bot, { enabled: false });
      setTotemServiceEnabled(bot, true);

      expect(getTotemStatus(bot).enabled).toBe(true);
    });

    it('should disable totem service', () => {
      initializeTotemService(bot);
      setTotemServiceEnabled(bot, false);

      expect(getTotemStatus(bot).enabled).toBe(false);
    });
  });

  describe('configureTotemService', () => {
    it('should update config', () => {
      initializeTotemService(bot);
      configureTotemService(bot, { alwaysEquip: true });

      expect(getTotemStatus(bot).config.alwaysEquip).toBe(true);
    });
  });

  describe('getTotemStatus', () => {
    it('should return current status', () => {
      initializeTotemService(bot);
      const status = getTotemStatus(bot);

      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('config');
      expect(status).toHaveProperty('hasTotemEquipped');
      expect(status).toHaveProperty('totemsInInventory');
      expect(status).toHaveProperty('totemUsedCount');
      expect(status).toHaveProperty('health');
    });

    it('should count totems in inventory', () => {
      const totem = createMockTotem();
      (bot.inventory.items as any).mockReturnValue([totem]);

      initializeTotemService(bot);
      const status = getTotemStatus(bot);

      expect(status.totemsInInventory).toBe(1);
    });

    it('should detect totem in offhand', () => {
      const totem = createMockTotem();
      (bot.inventory as any).slots[45] = totem;

      initializeTotemService(bot);
      const status = getTotemStatus(bot);

      expect(status.hasTotemEquipped).toBe(true);
    });

    it('should report no totem when offhand empty', () => {
      (bot.inventory as any).slots[45] = null;

      initializeTotemService(bot);
      const status = getTotemStatus(bot);

      expect(status.hasTotemEquipped).toBe(false);
    });
  });

  describe('equipTotemNow', () => {
    it('should equip totem from inventory', async () => {
      const totem = createMockTotem();
      (bot.inventory.items as any).mockReturnValue([totem]);

      initializeTotemService(bot);
      const result = await equipTotemNow(bot);

      expect(bot.equip).toHaveBeenCalledWith(totem, 'off-hand');
      expect(result).toBe(true);
    });

    it('should return false when no totem available', async () => {
      (bot.inventory.items as any).mockReturnValue([]);

      initializeTotemService(bot);
      const result = await equipTotemNow(bot);

      expect(result).toBe(false);
    });

    it('should return true when totem already equipped', async () => {
      const totem = createMockTotem();
      (bot.inventory as any).slots[45] = totem;

      initializeTotemService(bot);
      const result = await equipTotemNow(bot);

      expect(result).toBe(true);
      expect(bot.equip).not.toHaveBeenCalled();
    });
  });

  describe('shouldEquipNow', () => {
    it('should want to equip when health is low', () => {
      const totem = createMockTotem();
      (bot.inventory.items as any).mockReturnValue([totem]);
      (bot as any).health = 5;

      initializeTotemService(bot);
      const status = getTotemStatus(bot);

      expect(status.shouldEquipNow).toBe(true);
    });

    it('should not want to equip when health is high', () => {
      const totem = createMockTotem();
      (bot.inventory.items as any).mockReturnValue([totem]);
      (bot as any).health = 20;

      initializeTotemService(bot, { alwaysEquip: false });
      const status = getTotemStatus(bot);

      expect(status.shouldEquipNow).toBe(false);
    });

    it('should always want to equip when alwaysEquip is true', () => {
      const totem = createMockTotem();
      (bot.inventory.items as any).mockReturnValue([totem]);
      (bot as any).health = 20;

      initializeTotemService(bot, { alwaysEquip: true });
      const status = getTotemStatus(bot);

      expect(status.shouldEquipNow).toBe(true);
    });
  });

  describe('cleanupTotemService', () => {
    it('should cleanup without error', () => {
      initializeTotemService(bot);
      cleanupTotemService(bot);
      cleanupTotemService(bot);
    });

    it('should handle cleanup when not initialized', () => {
      cleanupTotemService(bot);
    });
  });
});
