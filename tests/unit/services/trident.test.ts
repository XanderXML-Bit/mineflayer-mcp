/**
 * Trident Service Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Bot } from 'mineflayer';
import type { Item } from 'prismarine-item';

import {
  initializeTridentService,
  configureTridentService,
  getTridentStatus,
  findTrident,
  getTridentEnchantments,
  canUseRiptide,
  canTriggerLightning,
  DEFAULT_TRIDENT_CONFIG,
} from '../../../src/services/trident.service.js';

function createMockBot(): Bot {
  const inventory = {
    items: vi.fn().mockReturnValue([]),
    slots: {} as Record<number, Item | null>,
  };

  const bot = {
    username: 'TestBot',
    entity: {
      position: { x: 0, y: 64, z: 0 },
      isInWater: false,
    },
    entities: {},
    inventory,
    health: 20,
    heldItem: null as Item | null,
    isRaining: false,
    thunderState: 0,
    game: { dimension: 'minecraft:overworld' },
    equip: vi.fn().mockResolvedValue(undefined),
    activateItem: vi.fn(),
    deactivateItem: vi.fn(),
    look: vi.fn().mockResolvedValue(undefined),
    lookAt: vi.fn().mockResolvedValue(undefined),
    blockAt: vi.fn().mockReturnValue({ boundingBox: 'empty', transparent: true }),
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
  } as unknown as Bot;

  return bot;
}

function createMockTrident(enchants: any[] = []): Item {
  return {
    name: 'trident',
    count: 1,
    type: 0,
    slot: 0,
    enchants,
  } as unknown as Item;
}

describe('TridentService', () => {
  let bot: Bot;

  beforeEach(() => {
    bot = createMockBot();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('DEFAULT_TRIDENT_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_TRIDENT_CONFIG.enabled).toBe(true);
      expect(DEFAULT_TRIDENT_CONFIG.autoRiptide).toBe(false);
      expect(DEFAULT_TRIDENT_CONFIG.maxRiptideDistance).toBe(100);
      expect(DEFAULT_TRIDENT_CONFIG.riptideChargeMs).toBe(500);
    });
  });

  describe('initializeTridentService', () => {
    it('should initialize with default config', () => {
      initializeTridentService(bot);
      const status = getTridentStatus(bot);

      expect(status.enabled).toBe(true);
      expect(status.config.autoRiptide).toBe(false);
    });

    it('should accept custom config', () => {
      initializeTridentService(bot, { autoRiptide: true });
      const status = getTridentStatus(bot);

      expect(status.config.autoRiptide).toBe(true);
    });
  });

  describe('configureTridentService', () => {
    it('should update config', () => {
      initializeTridentService(bot);
      configureTridentService(bot, { maxRiptideDistance: 200 });

      expect(getTridentStatus(bot).config.maxRiptideDistance).toBe(200);
    });
  });

  describe('getTridentStatus', () => {
    it('should return current status', () => {
      initializeTridentService(bot);
      const status = getTridentStatus(bot);

      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('config');
      expect(status).toHaveProperty('hasTrident');
      expect(status).toHaveProperty('isHoldingTrident');
      expect(status).toHaveProperty('enchantments');
      expect(status).toHaveProperty('canUseRiptide');
      expect(status).toHaveProperty('isRiptiding');
      expect(status).toHaveProperty('canTriggerLightning');
    });

    it('should detect trident in inventory', () => {
      const trident = createMockTrident();
      (bot.inventory.items as any).mockReturnValue([trident]);

      initializeTridentService(bot);
      const status = getTridentStatus(bot);

      expect(status.hasTrident).toBe(true);
    });

    it('should report no trident when empty', () => {
      (bot.inventory.items as any).mockReturnValue([]);

      initializeTridentService(bot);
      const status = getTridentStatus(bot);

      expect(status.hasTrident).toBe(false);
    });
  });

  describe('findTrident', () => {
    it('should find trident in inventory', () => {
      const trident = createMockTrident();
      (bot.inventory.items as any).mockReturnValue([trident]);

      const found = findTrident(bot);

      expect(found).not.toBeNull();
      expect(found?.name).toBe('trident');
    });

    it('should return null when no trident', () => {
      (bot.inventory.items as any).mockReturnValue([]);

      const found = findTrident(bot);

      expect(found).toBeNull();
    });
  });

  describe('getTridentEnchantments', () => {
    it('should return enchantments for trident', () => {
      const trident = createMockTrident([
        { name: 'riptide', lvl: 3 },
        { name: 'channeling' },
        { name: 'loyalty', lvl: 2 },
        { name: 'impaling', lvl: 4 },
        { name: 'unbreaking', lvl: 3 },
        { name: 'mending' },
      ]);
      bot.heldItem = trident;

      const enchants = getTridentEnchantments(bot);

      expect(enchants).not.toBeNull();
      expect(enchants?.riptide).toBe(3);
      expect(enchants?.channeling).toBe(true);
      expect(enchants?.loyalty).toBe(2);
      expect(enchants?.impaling).toBe(4);
      expect(enchants?.unbreaking).toBe(3);
      expect(enchants?.mending).toBe(true);
    });

    it('should return null for non-trident', () => {
      bot.heldItem = { name: 'diamond_sword' } as Item;

      const enchants = getTridentEnchantments(bot);

      expect(enchants).toBeNull();
    });

    it('should return default values for unenchanted trident', () => {
      const trident = createMockTrident([]);
      bot.heldItem = trident;

      const enchants = getTridentEnchantments(bot);

      expect(enchants).not.toBeNull();
      expect(enchants?.riptide).toBe(0);
      expect(enchants?.channeling).toBe(false);
      expect(enchants?.loyalty).toBe(0);
    });
  });

  describe('canUseRiptide', () => {
    it('should not use riptide without holding trident', () => {
      bot.heldItem = null;

      const result = canUseRiptide(bot);

      expect(result.canUse).toBe(false);
      expect(result.reason).toBe('not_holding_trident');
    });

    it('should not use riptide without enchantment', () => {
      const trident = createMockTrident([]);
      bot.heldItem = trident;

      const result = canUseRiptide(bot);

      expect(result.canUse).toBe(false);
      expect(result.reason).toBe('no_riptide_enchantment');
    });

    it('should use riptide in water', () => {
      const trident = createMockTrident([{ name: 'riptide', lvl: 3 }]);
      bot.heldItem = trident;
      (bot.entity as any).isInWater = true;

      const result = canUseRiptide(bot);

      expect(result.canUse).toBe(true);
    });

    it('should not use riptide outside water when not raining', () => {
      const trident = createMockTrident([{ name: 'riptide', lvl: 3 }]);
      bot.heldItem = trident;
      (bot.entity as any).isInWater = false;
      (bot as any).isRaining = false;

      const result = canUseRiptide(bot);

      expect(result.canUse).toBe(false);
      expect(result.reason).toBe('not_in_water_or_rain');
    });
  });

  describe('canTriggerLightning', () => {
    it('should not trigger without channeling', () => {
      const trident = createMockTrident([]);
      bot.heldItem = trident;

      const result = canTriggerLightning(bot);

      expect(result).toBe(false);
    });

    it('should not trigger without thunderstorm', () => {
      const trident = createMockTrident([{ name: 'channeling' }]);
      bot.heldItem = trident;
      (bot as any).isRaining = true;
      (bot as any).thunderState = 0;

      const result = canTriggerLightning(bot);

      expect(result).toBe(false);
    });
  });
});
