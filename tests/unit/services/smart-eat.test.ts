/**
 * Smart Eat Service Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Bot } from 'mineflayer';
import type { Item } from 'prismarine-item';

import {
  initializeSmartEat,
  setSmartEatEnabled,
  configureSmartEat,
  getSmartEatStatus,
  eatNow,
  cleanupSmartEat,
  DEFAULT_SMART_EAT_CONFIG,
} from '../../../src/services/smart-eat.service.js';

function createMockBot(): Bot {
  const inventory = {
    items: vi.fn().mockReturnValue([]),
    slots: {} as Record<number, Item | null>,
  };

  const bot = {
    username: 'TestBot',
    entity: {
      position: { x: 0, y: 64, z: 0, distanceTo: vi.fn().mockReturnValue(100) },
    },
    entities: {},
    inventory,
    food: 20,
    health: 20,
    foodSaturation: 5,
    equip: vi.fn().mockResolvedValue(undefined),
    activateItem: vi.fn(),
    deactivateItem: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
  } as unknown as Bot;

  return bot;
}

function createMockFood(name: string): Item {
  return {
    name,
    count: 64,
    type: 0,
    slot: 0,
  } as Item;
}

describe('SmartEatService', () => {
  let bot: Bot;

  beforeEach(() => {
    bot = createMockBot();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanupSmartEat(bot);
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('DEFAULT_SMART_EAT_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_SMART_EAT_CONFIG.enabled).toBe(true);
      expect(DEFAULT_SMART_EAT_CONFIG.minHunger).toBe(14);
      expect(DEFAULT_SMART_EAT_CONFIG.emergencyHealthThreshold).toBe(10);
      expect(DEFAULT_SMART_EAT_CONFIG.safeDistance).toBe(12);
    });
  });

  describe('initializeSmartEat', () => {
    it('should initialize with default config', () => {
      initializeSmartEat(bot);
      const status = getSmartEatStatus(bot);

      expect(status.enabled).toBe(true);
      expect(status.config.minHunger).toBe(14);
    });

    it('should accept custom config', () => {
      initializeSmartEat(bot, { minHunger: 10 });
      const status = getSmartEatStatus(bot);

      expect(status.config.minHunger).toBe(10);
    });

    it('should not start when disabled', () => {
      initializeSmartEat(bot, { enabled: false });
      const status = getSmartEatStatus(bot);

      expect(status.enabled).toBe(false);
    });
  });

  describe('setSmartEatEnabled', () => {
    it('should enable smart eat', () => {
      initializeSmartEat(bot, { enabled: false });
      setSmartEatEnabled(bot, true);

      expect(getSmartEatStatus(bot).enabled).toBe(true);
    });

    it('should disable smart eat', () => {
      initializeSmartEat(bot);
      setSmartEatEnabled(bot, false);

      expect(getSmartEatStatus(bot).enabled).toBe(false);
    });
  });

  describe('configureSmartEat', () => {
    it('should update config', () => {
      initializeSmartEat(bot);
      configureSmartEat(bot, { safeDistance: 20 });

      expect(getSmartEatStatus(bot).config.safeDistance).toBe(20);
    });
  });

  describe('getSmartEatStatus', () => {
    it('should return current status', () => {
      initializeSmartEat(bot);
      const status = getSmartEatStatus(bot);

      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('config');
      expect(status).toHaveProperty('isEating');
      expect(status).toHaveProperty('isFleeing');
      expect(status).toHaveProperty('hunger');
      expect(status).toHaveProperty('health');
    });

    it('should report hunger level', () => {
      (bot as any).food = 10;
      initializeSmartEat(bot);

      expect(getSmartEatStatus(bot).hunger).toBe(10);
    });

    it('should detect food in inventory', () => {
      const steak = createMockFood('cooked_beef');
      (bot.inventory.items as any).mockReturnValue([steak]);

      initializeSmartEat(bot);
      const status = getSmartEatStatus(bot);

      expect(status.hasFoodInInventory).toBe(true);
      expect(status.bestFood).toBe('cooked_beef');
    });

    it('should report no food when inventory empty', () => {
      (bot.inventory.items as any).mockReturnValue([]);

      initializeSmartEat(bot);
      const status = getSmartEatStatus(bot);

      expect(status.hasFoodInInventory).toBe(false);
      expect(status.bestFood).toBeNull();
    });
  });

  describe('food priority', () => {
    it('should prefer golden apple over steak', () => {
      const steak = createMockFood('cooked_beef');
      const goldenApple = createMockFood('golden_apple');
      (bot.inventory.items as any).mockReturnValue([steak, goldenApple]);

      initializeSmartEat(bot);
      const status = getSmartEatStatus(bot);

      expect(status.bestFood).toBe('golden_apple');
    });

    it('should prefer cooked food over raw', () => {
      const raw = createMockFood('beef');
      const cooked = createMockFood('cooked_beef');
      (bot.inventory.items as any).mockReturnValue([raw, cooked]);

      initializeSmartEat(bot);
      const status = getSmartEatStatus(bot);

      expect(status.bestFood).toBe('cooked_beef');
    });

    it('should never select poisonous food', () => {
      const poison = createMockFood('pufferfish');
      (bot.inventory.items as any).mockReturnValue([poison]);

      initializeSmartEat(bot);
      const status = getSmartEatStatus(bot);

      expect(status.hasFoodInInventory).toBe(false);
    });
  });

  describe('eatNow', () => {
    it('should eat when food available', async () => {
      const steak = createMockFood('cooked_beef');
      (bot.inventory.items as any).mockReturnValue([steak]);

      initializeSmartEat(bot);
      const promise = eatNow(bot);

      // Advance timer to complete eating
      await vi.advanceTimersByTimeAsync(2000);
      const result = await promise;

      expect(bot.equip).toHaveBeenCalledWith(steak, 'hand');
      expect(bot.activateItem).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when no food', async () => {
      (bot.inventory.items as any).mockReturnValue([]);

      initializeSmartEat(bot);
      const result = await eatNow(bot);

      expect(result).toBe(false);
    });
  });

  describe('cleanupSmartEat', () => {
    it('should cleanup without error', () => {
      initializeSmartEat(bot);
      cleanupSmartEat(bot);
      cleanupSmartEat(bot); // Second call should not throw
    });

    it('should handle cleanup when not initialized', () => {
      cleanupSmartEat(bot); // Should not throw
    });
  });
});
