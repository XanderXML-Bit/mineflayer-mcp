/**
 * Ranged Combat Service Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Bot } from 'mineflayer';
import type { Item } from 'prismarine-item';
import type { Entity } from 'prismarine-entity';
import { Vec3 } from 'vec3';

import {
  configureRangedCombat,
  getRangedCombatStatus,
  calculateAim,
  hasAmmo,
  setRangedCombatEnabled,
  DEFAULT_RANGED_CONFIG,
} from '../../../src/services/ranged-combat.service.js';

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
    },
    entities: {},
    inventory,
    health: 20,
    heldItem: null as Item | null,
    game: { dimension: 'minecraft:overworld' },
    equip: vi.fn().mockResolvedValue(undefined),
    activateItem: vi.fn(),
    deactivateItem: vi.fn(),
    look: vi.fn().mockResolvedValue(undefined),
    lookAt: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
  } as unknown as Bot;

  return bot;
}

function createMockBow(): Item {
  return {
    name: 'bow',
    count: 1,
    type: 0,
    slot: 0,
  } as Item;
}

function createMockCrossbow(loaded = false): Item {
  return {
    name: 'crossbow',
    count: 1,
    type: 0,
    slot: 0,
    nbt: loaded ? { value: { ChargedProjectiles: { value: { value: [{}] } } } } : undefined,
  } as unknown as Item;
}

function createMockArrow(): Item {
  return {
    name: 'arrow',
    count: 64,
    type: 0,
    slot: 1,
  } as Item;
}

function createMockTarget(x: number, y: number, z: number): Entity {
  return {
    position: new Vec3(x, y, z),
    velocity: new Vec3(0, 0, 0),
    name: 'zombie',
    height: 1.95,
  } as unknown as Entity;
}

describe('RangedCombatService', () => {
  let bot: Bot;

  beforeEach(() => {
    bot = createMockBot();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('DEFAULT_RANGED_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_RANGED_CONFIG.enabled).toBe(true);
      expect(DEFAULT_RANGED_CONFIG.leadTarget).toBe(true);
      expect(DEFAULT_RANGED_CONFIG.maxRange).toBe(64);
      expect(DEFAULT_RANGED_CONFIG.minRange).toBe(8);
      expect(DEFAULT_RANGED_CONFIG.trajectoryIterations).toBe(20);
    });
  });

  describe('configureRangedCombat', () => {
    it('should configure ranged combat', () => {
      configureRangedCombat(bot, { maxRange: 100 });
      const status = getRangedCombatStatus(bot);

      expect(status.config.maxRange).toBe(100);
    });

    it('should merge with existing config', () => {
      configureRangedCombat(bot, { leadTarget: false });
      configureRangedCombat(bot, { maxRange: 50 });

      const status = getRangedCombatStatus(bot);
      expect(status.config.leadTarget).toBe(false);
      expect(status.config.maxRange).toBe(50);
    });
  });

  describe('setRangedCombatEnabled', () => {
    it('should enable ranged combat', () => {
      configureRangedCombat(bot, { enabled: false });
      setRangedCombatEnabled(bot, true);

      expect(getRangedCombatStatus(bot).enabled).toBe(true);
    });

    it('should disable ranged combat', () => {
      configureRangedCombat(bot, { enabled: true });
      setRangedCombatEnabled(bot, false);

      expect(getRangedCombatStatus(bot).enabled).toBe(false);
    });
  });

  describe('getRangedCombatStatus', () => {
    it('should return current status', () => {
      const status = getRangedCombatStatus(bot);

      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('config');
      expect(status).toHaveProperty('hasRangedWeapon');
      expect(status).toHaveProperty('weaponType');
      expect(status).toHaveProperty('hasAmmo');
      expect(status).toHaveProperty('isLoaded');
    });

    it('should detect bow when held', () => {
      bot.heldItem = createMockBow();
      (bot.inventory.items as any).mockReturnValue([createMockArrow()]);

      const status = getRangedCombatStatus(bot);

      expect(status.hasRangedWeapon).toBe(true);
      expect(status.weaponType).toBe('bow');
    });

    it('should detect crossbow when held', () => {
      bot.heldItem = createMockCrossbow();
      (bot.inventory.items as any).mockReturnValue([]);

      const status = getRangedCombatStatus(bot);

      expect(status.hasRangedWeapon).toBe(true);
      expect(status.weaponType).toBe('crossbow');
    });

    it('should detect loaded crossbow', () => {
      bot.heldItem = createMockCrossbow(true);
      (bot.inventory.items as any).mockReturnValue([]);

      const status = getRangedCombatStatus(bot);

      expect(status.isLoaded).toBe(true);
    });

    it('should detect when no ranged weapon held', () => {
      bot.heldItem = null;
      (bot.inventory.items as any).mockReturnValue([]);

      const status = getRangedCombatStatus(bot);

      expect(status.hasRangedWeapon).toBe(false);
      expect(status.weaponType).toBeNull();
    });
  });

  describe('hasAmmo', () => {
    it('should return true when has arrows', () => {
      const arrows = createMockArrow();
      (bot.inventory.items as any).mockReturnValue([arrows]);

      expect(hasAmmo(bot)).toBe(true);
    });

    it('should return false when no arrows', () => {
      (bot.inventory.items as any).mockReturnValue([]);

      expect(hasAmmo(bot)).toBe(false);
    });

    it('should detect spectral arrows', () => {
      const spectralArrows = { name: 'spectral_arrow', count: 32, type: 0, slot: 0 } as Item;
      (bot.inventory.items as any).mockReturnValue([spectralArrows]);

      expect(hasAmmo(bot)).toBe(true);
    });

    it('should detect tipped arrows', () => {
      const tippedArrows = { name: 'tipped_arrow', count: 16, type: 0, slot: 0 } as Item;
      (bot.inventory.items as any).mockReturnValue([tippedArrows]);

      expect(hasAmmo(bot)).toBe(true);
    });
  });

  describe('calculateAim', () => {
    it('should calculate aim for nearby target', () => {
      const target = createMockTarget(10, 64, 0);

      const aim = calculateAim(bot, target);

      expect(aim).toHaveProperty('yaw');
      expect(aim).toHaveProperty('pitch');
      expect(aim).toHaveProperty('distance');
      expect(aim).toHaveProperty('canHit');
    });

    it('should calculate aim for distant target', () => {
      const target = createMockTarget(50, 64, 0);

      const aim = calculateAim(bot, target);

      expect(aim.distance).toBeCloseTo(50, 0);
    });

    it('should calculate aim for target above', () => {
      const target = createMockTarget(10, 80, 0);

      const aim = calculateAim(bot, target);

      expect(aim.pitch).toBeLessThan(0); // Looking up (negative pitch)
    });

    it('should calculate aim for target below', () => {
      const target = createMockTarget(10, 50, 0);

      const aim = calculateAim(bot, target);

      expect(aim.pitch).toBeGreaterThan(0); // Looking down (positive pitch)
    });

    it('should report canHit when in range', () => {
      const target = createMockTarget(20, 64, 0);

      const aim = calculateAim(bot, target);

      expect(aim.canHit).toBe(true);
    });

    it('should report cannot hit when too far', () => {
      const target = createMockTarget(100, 64, 0);

      const aim = calculateAim(bot, target);

      expect(aim.canHit).toBe(false);
    });
  });
});
