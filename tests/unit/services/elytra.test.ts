/**
 * Elytra Service Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Bot } from 'mineflayer';
import type { Item } from 'prismarine-item';

import {
  initializeElytraService,
  configureElytraService,
  getElytraStatus,
  cleanupElytraService,
  findElytra,
  isElytraEquipped,
  getElytraDurability,
  findFireworks,
  isElytraFlying,
  DEFAULT_ELYTRA_CONFIG,
} from '../../../src/services/elytra.service.js';

function createMockBot(): Bot {
  const inventory = {
    items: vi.fn().mockReturnValue([]),
    slots: {} as Record<number, Item | null>,
  };

  const bot = {
    username: 'TestBot',
    entity: {
      position: { x: 0, y: 100, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      onGround: false,
      yaw: 0,
      elytraFlying: false,
    },
    entities: {},
    inventory,
    health: 20,
    game: { dimension: 'minecraft:overworld' },
    equip: vi.fn().mockResolvedValue(undefined),
    activateItem: vi.fn(),
    look: vi.fn().mockResolvedValue(undefined),
    setControlState: vi.fn(),
    blockAt: vi.fn().mockReturnValue(null),
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
  } as unknown as Bot;

  return bot;
}

function createMockElytra(durabilityUsed = 0): Item {
  return {
    name: 'elytra',
    count: 1,
    type: 0,
    slot: 0,
    durabilityUsed,
  } as unknown as Item;
}

function createMockFirework(): Item {
  return {
    name: 'firework_rocket',
    count: 64,
    type: 0,
    slot: 1,
  } as Item;
}

describe('ElytraService', () => {
  let bot: Bot;

  beforeEach(() => {
    bot = createMockBot();
  });

  afterEach(() => {
    cleanupElytraService(bot);
    vi.clearAllMocks();
  });

  describe('DEFAULT_ELYTRA_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_ELYTRA_CONFIG.enabled).toBe(true);
      expect(DEFAULT_ELYTRA_CONFIG.minAltitude).toBe(20);
      expect(DEFAULT_ELYTRA_CONFIG.maxAltitude).toBe(200);
      expect(DEFAULT_ELYTRA_CONFIG.boostIntervalMs).toBe(3000);
      expect(DEFAULT_ELYTRA_CONFIG.autoBoost).toBe(true);
      expect(DEFAULT_ELYTRA_CONFIG.minDurabilityPercent).toBe(10);
    });
  });

  describe('initializeElytraService', () => {
    it('should initialize with default config', () => {
      initializeElytraService(bot);
      const status = getElytraStatus(bot);

      expect(status.enabled).toBe(true);
      expect(status.config.minAltitude).toBe(20);
    });

    it('should accept custom config', () => {
      initializeElytraService(bot, { minAltitude: 30 });
      const status = getElytraStatus(bot);

      expect(status.config.minAltitude).toBe(30);
    });
  });

  describe('configureElytraService', () => {
    it('should update config', () => {
      initializeElytraService(bot);
      configureElytraService(bot, { autoBoost: false });

      expect(getElytraStatus(bot).config.autoBoost).toBe(false);
    });
  });

  describe('getElytraStatus', () => {
    it('should return current status', () => {
      initializeElytraService(bot);
      const status = getElytraStatus(bot);

      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('config');
      expect(status).toHaveProperty('hasElytra');
      expect(status).toHaveProperty('isEquipped');
      expect(status).toHaveProperty('isFlying');
      expect(status).toHaveProperty('isLanding');
      expect(status).toHaveProperty('durability');
      expect(status).toHaveProperty('fireworkCount');
      expect(status).toHaveProperty('altitude');
      expect(status).toHaveProperty('boostCount');
    });

    it('should detect elytra in inventory', () => {
      const elytra = createMockElytra();
      (bot.inventory.items as any).mockReturnValue([elytra]);

      initializeElytraService(bot);
      const status = getElytraStatus(bot);

      expect(status.hasElytra).toBe(true);
    });

    it('should report no elytra when empty', () => {
      (bot.inventory.items as any).mockReturnValue([]);

      initializeElytraService(bot);
      const status = getElytraStatus(bot);

      expect(status.hasElytra).toBe(false);
    });

    it('should count fireworks', () => {
      const fireworks = [createMockFirework()];
      (bot.inventory.items as any).mockReturnValue(fireworks);

      initializeElytraService(bot);
      const status = getElytraStatus(bot);

      expect(status.fireworkCount).toBe(64);
    });
  });

  describe('findElytra', () => {
    it('should find elytra in inventory', () => {
      const elytra = createMockElytra();
      (bot.inventory.items as any).mockReturnValue([elytra]);

      const found = findElytra(bot);

      expect(found).not.toBeNull();
      expect(found?.item.name).toBe('elytra');
      expect(found?.location).toBe('inventory');
    });

    it('should find elytra in chest slot', () => {
      const elytra = createMockElytra();
      (bot.inventory as any).slots[6] = elytra;
      (bot.inventory.items as any).mockReturnValue([]);

      const found = findElytra(bot);

      expect(found).not.toBeNull();
      expect(found?.location).toBe('chest');
    });

    it('should return null when no elytra', () => {
      (bot.inventory.items as any).mockReturnValue([]);

      const found = findElytra(bot);

      expect(found).toBeNull();
    });
  });

  describe('isElytraEquipped', () => {
    it('should return true when elytra in chest slot', () => {
      const elytra = createMockElytra();
      (bot.inventory as any).slots[6] = elytra;

      const equipped = isElytraEquipped(bot);

      expect(equipped).toBe(true);
    });

    it('should return false when no elytra in chest slot', () => {
      (bot.inventory as any).slots[6] = null;

      const equipped = isElytraEquipped(bot);

      expect(equipped).toBe(false);
    });
  });

  describe('getElytraDurability', () => {
    it('should calculate durability correctly', () => {
      const elytra = createMockElytra(100); // 100 damage used
      (bot.inventory.items as any).mockReturnValue([elytra]);

      const durability = getElytraDurability(bot);

      expect(durability).not.toBeNull();
      expect(durability?.current).toBe(432 - 100); // 332
      expect(durability?.max).toBe(432);
      expect(durability?.percent).toBeCloseTo((332 / 432) * 100);
    });

    it('should return null when no elytra', () => {
      (bot.inventory.items as any).mockReturnValue([]);

      const durability = getElytraDurability(bot);

      expect(durability).toBeNull();
    });
  });

  describe('findFireworks', () => {
    it('should find fireworks in inventory', () => {
      const fireworks = [createMockFirework(), createMockFirework()];
      (bot.inventory.items as any).mockReturnValue(fireworks);

      const found = findFireworks(bot);

      expect(found.length).toBe(2);
    });

    it('should return empty array when no fireworks', () => {
      (bot.inventory.items as any).mockReturnValue([]);

      const found = findFireworks(bot);

      expect(found.length).toBe(0);
    });
  });

  describe('isElytraFlying', () => {
    it('should detect elytra flying state', () => {
      (bot.entity as any).elytraFlying = true;

      const flying = isElytraFlying(bot);

      expect(flying).toBe(true);
    });

    it('should return false when not flying', () => {
      (bot.entity as any).elytraFlying = false;

      const flying = isElytraFlying(bot);

      expect(flying).toBe(false);
    });
  });

  describe('cleanupElytraService', () => {
    it('should cleanup without error', () => {
      initializeElytraService(bot);
      cleanupElytraService(bot);
      cleanupElytraService(bot); // Second call should not throw
    });

    it('should handle cleanup when not initialized', () => {
      cleanupElytraService(bot); // Should not throw
    });
  });
});
