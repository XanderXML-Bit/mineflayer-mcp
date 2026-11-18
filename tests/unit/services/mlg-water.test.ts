/**
 * MLG Water Service Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Bot } from 'mineflayer';
import type { Item } from 'prismarine-item';
import { Vec3 } from 'vec3';

import {
  initializeMLGWater,
  setMLGWaterEnabled,
  configureMLGWater,
  getMLGWaterStatus,
  cleanupMLGWater,
  DEFAULT_MLG_CONFIG,
} from '../../../src/services/mlg-water.service.js';

function createMockBot(): Bot {
  const inventory = {
    items: vi.fn().mockReturnValue([]),
    slots: {} as Record<number, Item | null>,
  };

  const bot = {
    username: 'TestBot',
    entity: {
      position: new Vec3(0, 64, 0),
      velocity: new Vec3(0, 0, 0),
      onGround: true,
      yaw: 0,
    },
    entities: {},
    inventory,
    health: 20,
    game: { dimension: 'minecraft:overworld' },
    equip: vi.fn().mockResolvedValue(undefined),
    activateItem: vi.fn(),
    look: vi.fn().mockResolvedValue(undefined),
    lookAt: vi.fn().mockResolvedValue(undefined),
    activateBlock: vi.fn().mockResolvedValue(undefined),
    blockAt: vi.fn().mockReturnValue(null),
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
  } as unknown as Bot;

  return bot;
}

function createMockWaterBucket(): Item {
  return {
    name: 'water_bucket',
    count: 1,
    type: 0,
    slot: 0,
  } as Item;
}

function _createMockEmptyBucket(): Item {
  return {
    name: 'bucket',
    count: 1,
    type: 0,
    slot: 1,
  } as Item;
}

describe('MLGWaterService', () => {
  let bot: Bot;

  beforeEach(() => {
    bot = createMockBot();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanupMLGWater(bot);
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('DEFAULT_MLG_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_MLG_CONFIG.enabled).toBe(true);
      expect(DEFAULT_MLG_CONFIG.minFallDistance).toBe(4);
      expect(DEFAULT_MLG_CONFIG.placeHeight).toBe(2);
      expect(DEFAULT_MLG_CONFIG.pickupDelayMs).toBe(500);
      expect(DEFAULT_MLG_CONFIG.autoPickup).toBe(true);
    });
  });

  describe('initializeMLGWater', () => {
    it('should initialize with default config', () => {
      initializeMLGWater(bot);
      const status = getMLGWaterStatus(bot);

      expect(status.enabled).toBe(true);
      expect(status.config.minFallDistance).toBe(4);
    });

    it('should accept custom config', () => {
      initializeMLGWater(bot, { minFallDistance: 6 });
      const status = getMLGWaterStatus(bot);

      expect(status.config.minFallDistance).toBe(6);
    });

    it('should not start when disabled', () => {
      initializeMLGWater(bot, { enabled: false });
      const status = getMLGWaterStatus(bot);

      expect(status.enabled).toBe(false);
    });
  });

  describe('setMLGWaterEnabled', () => {
    it('should enable MLG water', () => {
      initializeMLGWater(bot, { enabled: false });
      setMLGWaterEnabled(bot, true);

      expect(getMLGWaterStatus(bot).enabled).toBe(true);
    });

    it('should disable MLG water', () => {
      initializeMLGWater(bot);
      setMLGWaterEnabled(bot, false);

      expect(getMLGWaterStatus(bot).enabled).toBe(false);
    });
  });

  describe('configureMLGWater', () => {
    it('should update config', () => {
      initializeMLGWater(bot);
      configureMLGWater(bot, { placeHeight: 3 });

      expect(getMLGWaterStatus(bot).config.placeHeight).toBe(3);
    });
  });

  describe('getMLGWaterStatus', () => {
    it('should return current status', () => {
      initializeMLGWater(bot);
      const status = getMLGWaterStatus(bot);

      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('config');
      expect(status).toHaveProperty('isFalling');
      expect(status).toHaveProperty('fallDistance');
      expect(status).toHaveProperty('hasWaterBucket');
      expect(status).toHaveProperty('canPerformMLG');
      expect(status).toHaveProperty('isInNether');
    });

    it('should detect water bucket', () => {
      const bucket = createMockWaterBucket();
      (bot.inventory.items as any).mockReturnValue([bucket]);

      initializeMLGWater(bot);
      const status = getMLGWaterStatus(bot);

      expect(status.hasWaterBucket).toBe(true);
    });

    it('should report no water bucket when empty', () => {
      (bot.inventory.items as any).mockReturnValue([]);

      initializeMLGWater(bot);
      const status = getMLGWaterStatus(bot);

      expect(status.hasWaterBucket).toBe(false);
    });

    it('should detect nether dimension', () => {
      (bot as any).game.dimension = 'minecraft:the_nether';

      initializeMLGWater(bot);
      const status = getMLGWaterStatus(bot);

      expect(status.isInNether).toBe(true);
    });
  });

  describe('canPerformMLG', () => {
    it('should be false without water bucket', () => {
      (bot.inventory.items as any).mockReturnValue([]);

      initializeMLGWater(bot);
      const status = getMLGWaterStatus(bot);

      expect(status.canPerformMLG).toBe(false);
    });

    it('should be false in nether', () => {
      const bucket = createMockWaterBucket();
      (bot.inventory.items as any).mockReturnValue([bucket]);
      (bot as any).game.dimension = 'minecraft:the_nether';

      initializeMLGWater(bot);
      const status = getMLGWaterStatus(bot);

      expect(status.canPerformMLG).toBe(false);
    });
  });

  describe('cleanupMLGWater', () => {
    it('should cleanup without error', () => {
      initializeMLGWater(bot);
      cleanupMLGWater(bot);
      cleanupMLGWater(bot); // Second call should not throw
    });

    it('should handle cleanup when not initialized', () => {
      cleanupMLGWater(bot); // Should not throw
    });
  });
});
