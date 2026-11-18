/**
 * Bed Spawn Service Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Bot } from 'mineflayer';


import {
  initializeBedSpawnService,
  configureBedSpawnService,
  getBedSpawnStatus,
  
  registerBed,
  setSpawnPoint,
  getKnownBeds,
  getCurrentSpawnPoint,
  getBackupSpawnPoint,
  canSleepNow,
  labelBed,
  removeBed,
  exportBedData,
  importBedData,
  DEFAULT_BED_SPAWN_CONFIG,
} from '../../../src/services/bed-spawn.service.js';

function createMockBot(): Bot {
  const inventory = {
    items: vi.fn().mockReturnValue([]),
    slots: {} as Record<number, any>,
  };

  const bot = {
    username: 'TestBot',
    entity: {
      position: { x: 0, y: 64, z: 0, distanceTo: vi.fn().mockReturnValue(5) },
    },
    entities: {},
    inventory,
    health: 20,
    time: { timeOfDay: 13000 }, // Night time
    isRaining: false,
    game: { dimension: 'minecraft:overworld' },
    findBlocks: vi.fn().mockReturnValue([]),
    blockAt: vi.fn().mockReturnValue(null),
    activateBlock: vi.fn().mockResolvedValue(undefined),
    sleep: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
    waitForTicks: vi.fn().mockResolvedValue(undefined),
    pathfinder: { setGoal: vi.fn() },
  } as unknown as Bot;

  return bot;
}

function _createMockBed(x: number, y: number, z: number): { position: any; name: string } {
  return {
    position: { x, y, z },
    name: 'red_bed',
  };
}

describe('BedSpawnService', () => {
  let bot: Bot;

  beforeEach(() => {
    bot = createMockBot();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('DEFAULT_BED_SPAWN_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_BED_SPAWN_CONFIG.enabled).toBe(true);
      expect(DEFAULT_BED_SPAWN_CONFIG.maxBedsTracked).toBe(20);
      expect(DEFAULT_BED_SPAWN_CONFIG.scanRadius).toBe(64);
      expect(DEFAULT_BED_SPAWN_CONFIG.autoSetSpawn).toBe(true);
    });
  });

  describe('initializeBedSpawnService', () => {
    it('should initialize with default config', () => {
      initializeBedSpawnService(bot);
      const status = getBedSpawnStatus(bot);

      expect(status.enabled).toBe(true);
      expect(status.config.maxBedsTracked).toBe(20);
    });

    it('should accept custom config', () => {
      initializeBedSpawnService(bot, { scanRadius: 100 });
      const status = getBedSpawnStatus(bot);

      expect(status.config.scanRadius).toBe(100);
    });
  });

  describe('configureBedSpawnService', () => {
    it('should update config', () => {
      initializeBedSpawnService(bot);
      configureBedSpawnService(bot, { maxBedsTracked: 50 });

      expect(getBedSpawnStatus(bot).config.maxBedsTracked).toBe(50);
    });
  });

  describe('getBedSpawnStatus', () => {
    it('should return current status', () => {
      initializeBedSpawnService(bot);
      const status = getBedSpawnStatus(bot);

      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('config');
      expect(status).toHaveProperty('knownBeds');
      expect(status).toHaveProperty('currentSpawnPoint');
      expect(status).toHaveProperty('canSleepNow');
      expect(status).toHaveProperty('dimension');
    });

    it('should report dimension', () => {
      initializeBedSpawnService(bot);
      const status = getBedSpawnStatus(bot);

      expect(status.dimension).toBe('overworld');
    });
  });

  describe('registerBed', () => {
    it('should register a new bed', () => {
      initializeBedSpawnService(bot);

      registerBed(bot, {
        position: { x: 10, y: 64, z: 10 },
        dimension: 'overworld',
        isSpawnPoint: false,
      });

      const beds = getKnownBeds(bot);
      expect(beds.length).toBe(1);
      expect(beds[0].position.x).toBe(10);
    });

    it('should track multiple beds', () => {
      initializeBedSpawnService(bot);

      registerBed(bot, { position: { x: 10, y: 64, z: 10 }, dimension: 'overworld', isSpawnPoint: false });
      registerBed(bot, { position: { x: 20, y: 64, z: 20 }, dimension: 'overworld', isSpawnPoint: false });

      const beds = getKnownBeds(bot);
      expect(beds.length).toBe(2);
    });
  });

  describe('setSpawnPoint', () => {
    it('should set a bed as spawn point', () => {
      initializeBedSpawnService(bot);

      const bed = {
        position: { x: 10, y: 64, z: 10 },
        dimension: 'overworld' as const,
        isSpawnPoint: false,
        discoveredAt: Date.now(),
      };

      registerBed(bot, bed);
      setSpawnPoint(bot, bed);

      const spawnPoint = getCurrentSpawnPoint(bot);
      expect(spawnPoint).not.toBeNull();
      expect(spawnPoint?.isSpawnPoint).toBe(true);
    });

    it('should demote previous spawn to backup', () => {
      initializeBedSpawnService(bot);

      const bed1 = {
        position: { x: 10, y: 64, z: 10 },
        dimension: 'overworld' as const,
        isSpawnPoint: false,
        discoveredAt: Date.now(),
      };
      const bed2 = {
        position: { x: 20, y: 64, z: 20 },
        dimension: 'overworld' as const,
        isSpawnPoint: false,
        discoveredAt: Date.now(),
      };

      registerBed(bot, bed1);
      setSpawnPoint(bot, bed1);

      registerBed(bot, bed2);
      setSpawnPoint(bot, bed2);

      const currentSpawn = getCurrentSpawnPoint(bot);
      const backupSpawn = getBackupSpawnPoint(bot);

      expect(currentSpawn?.position.x).toBe(20);
      expect(backupSpawn?.position.x).toBe(10);
    });
  });

  describe('getKnownBeds', () => {
    it('should filter beds by dimension', () => {
      initializeBedSpawnService(bot);

      registerBed(bot, { position: { x: 10, y: 64, z: 10 }, dimension: 'overworld', isSpawnPoint: false });
      registerBed(bot, { position: { x: 20, y: 64, z: 20 }, dimension: 'nether', isSpawnPoint: false });

      const overworldBeds = getKnownBeds(bot, 'overworld');
      expect(overworldBeds.length).toBe(1);
      expect(overworldBeds[0].dimension).toBe('overworld');
    });

    it('should sort spawn points first', () => {
      initializeBedSpawnService(bot);

      const bed1 = { position: { x: 10, y: 64, z: 10 }, dimension: 'overworld' as const, isSpawnPoint: false, discoveredAt: Date.now() };
      const bed2 = { position: { x: 20, y: 64, z: 20 }, dimension: 'overworld' as const, isSpawnPoint: false, discoveredAt: Date.now() };

      registerBed(bot, bed1);
      registerBed(bot, bed2);
      setSpawnPoint(bot, bed2);

      const beds = getKnownBeds(bot);
      expect(beds[0].isSpawnPoint).toBe(true);
    });
  });

  describe('canSleepNow', () => {
    it('should allow sleep at night in overworld', () => {
      (bot as any).time.timeOfDay = 13000; // Night
      (bot as any).game.dimension = 'minecraft:overworld';

      initializeBedSpawnService(bot);
      const result = canSleepNow(bot);

      expect(result.canSleep).toBe(true);
    });

    it('should not allow sleep during day', () => {
      (bot as any).time.timeOfDay = 6000; // Day

      initializeBedSpawnService(bot);
      const result = canSleepNow(bot);

      expect(result.canSleep).toBe(false);
      expect(result.reason).toBe('not_night');
    });

    it('should not allow sleep in nether', () => {
      (bot as any).game.dimension = 'minecraft:the_nether';
      (bot as any).time.timeOfDay = 13000;

      initializeBedSpawnService(bot);
      const result = canSleepNow(bot);

      expect(result.canSleep).toBe(false);
      expect(result.reason).toBe('wrong_dimension');
    });
  });

  describe('labelBed', () => {
    it('should label a registered bed', () => {
      initializeBedSpawnService(bot);

      registerBed(bot, { position: { x: 10, y: 64, z: 10 }, dimension: 'overworld', isSpawnPoint: false });
      const result = labelBed(bot, { x: 10, y: 64, z: 10 }, 'Home Base');

      expect(result).toBe(true);
      const beds = getKnownBeds(bot);
      expect(beds[0].label).toBe('Home Base');
    });

    it('should return false for unknown bed', () => {
      initializeBedSpawnService(bot);
      const result = labelBed(bot, { x: 999, y: 64, z: 999 }, 'Unknown');

      expect(result).toBe(false);
    });
  });

  describe('removeBed', () => {
    it('should remove a bed from tracking', () => {
      initializeBedSpawnService(bot);

      registerBed(bot, { position: { x: 10, y: 64, z: 10 }, dimension: 'overworld', isSpawnPoint: false });
      const result = removeBed(bot, { x: 10, y: 64, z: 10 });

      expect(result).toBe(true);
      expect(getKnownBeds(bot).length).toBe(0);
    });

    it('should handle removing spawn point', () => {
      initializeBedSpawnService(bot);

      const bed1 = { position: { x: 10, y: 64, z: 10 }, dimension: 'overworld' as const, isSpawnPoint: false, discoveredAt: Date.now() };
      const bed2 = { position: { x: 20, y: 64, z: 20 }, dimension: 'overworld' as const, isSpawnPoint: false, discoveredAt: Date.now() };

      registerBed(bot, bed1);
      setSpawnPoint(bot, bed1);
      registerBed(bot, bed2);
      setSpawnPoint(bot, bed2);

      // Remove current spawn, backup should become current
      removeBed(bot, { x: 20, y: 64, z: 20 });

      const currentSpawn = getCurrentSpawnPoint(bot);
      expect(currentSpawn?.position.x).toBe(10);
    });
  });

  describe('exportBedData / importBedData', () => {
    it('should export bed data', () => {
      initializeBedSpawnService(bot);

      const bed = { position: { x: 10, y: 64, z: 10 }, dimension: 'overworld' as const, isSpawnPoint: false, discoveredAt: Date.now() };
      registerBed(bot, bed);
      setSpawnPoint(bot, bed);

      const data = exportBedData(bot);

      expect(data.beds.length).toBe(1);
      expect(data.currentSpawnPoint).not.toBeNull();
    });

    it('should import bed data', () => {
      initializeBedSpawnService(bot);

      const data = {
        beds: [{ position: { x: 10, y: 64, z: 10 }, dimension: 'overworld' as const, isSpawnPoint: true, discoveredAt: Date.now() }],
        currentSpawnPoint: { position: { x: 10, y: 64, z: 10 }, dimension: 'overworld' as const, isSpawnPoint: true, discoveredAt: Date.now() },
      };

      importBedData(bot, data);

      const beds = getKnownBeds(bot);
      expect(beds.length).toBe(1);
    });
  });
});
