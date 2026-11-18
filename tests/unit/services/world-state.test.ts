/**
 * World State Service Tests
 */

import { describe, it, expect } from 'vitest';
import {
  getWorldState,
  isNightTime,
  isSafeToSleep,
  getDangerLevel,
} from '../../../src/services/world-state.service.js';

// Mock position factory with offset method
const createMockPosition = (x: number = 0, y: number = 64, z: number = 0) => ({
  x,
  y,
  z,
  offset: (dx: number, dy: number, dz: number) => createMockPosition(x + dx, y + dy, z + dz),
});

// Mock bot factory
const createMockBot = (overrides: any = {}) => ({
  entity: {
    position: createMockPosition(0, 64, 0),
  },
  time: {
    timeOfDay: 6000, // Noon
    day: 1,
    ...overrides.time,
  },
  isRaining: overrides.isRaining ?? false,
  thunderState: overrides.thunderState ?? 0,
  game: {
    dimension: 'overworld',
    ...overrides.game,
  },
  blockAt: (_pos: any) => ({
    name: overrides.blockName ?? 'air',  // Default to air for underground check
    skyLight: overrides.skyLight ?? 15,
    light: overrides.light ?? 15,
    biome: { name: overrides.biome ?? 'plains' },
  }),
  world: {
    getBiome: () => ({ name: overrides.biome ?? 'plains' }),
  },
  spawnPoint: overrides.spawnPoint ?? { x: 0, y: 64, z: 0 },
  entities: overrides.entities ?? {},
  ...overrides,
});

describe('WorldStateService', () => {
  describe('getWorldState', () => {
    it('should return day phase during daytime', () => {
      const bot = createMockBot({ time: { timeOfDay: 6000 } });
      const state = getWorldState(bot as any);

      expect(state.time.phase).toBe('day');
    });

    it('should return night phase during nighttime', () => {
      const bot = createMockBot({ time: { timeOfDay: 18000 } });
      const state = getWorldState(bot as any);

      expect(state.time.phase).toBe('night');
    });

    it('should return dawn phase at dawn', () => {
      const bot = createMockBot({ time: { timeOfDay: 500 } });
      const state = getWorldState(bot as any);

      expect(state.time.phase).toBe('dawn');
    });

    it('should return dusk phase at dusk', () => {
      const bot = createMockBot({ time: { timeOfDay: 12500 } });
      const state = getWorldState(bot as any);

      expect(state.time.phase).toBe('dusk');
    });

    it('should detect rain', () => {
      const bot = createMockBot({ isRaining: true });
      const state = getWorldState(bot as any);

      expect(state.weather).toBe('rain');
    });

    it('should detect thunder', () => {
      const bot = createMockBot({ isRaining: true, thunderState: 1 });
      const state = getWorldState(bot as any);

      expect(state.weather).toBe('thunder');
    });

    it('should return biome', () => {
      const bot = createMockBot({ biome: 'desert' });
      const state = getWorldState(bot as any);

      expect(state.biome).toBe('desert');
    });

    it('should detect overworld dimension', () => {
      const bot = createMockBot({ game: { dimension: 'overworld' } });
      const state = getWorldState(bot as any);

      expect(state.dimension).toBe('overworld');
    });

    it('should detect nether dimension', () => {
      const bot = createMockBot({ game: { dimension: 'the_nether' } });
      const state = getWorldState(bot as any);

      expect(state.dimension).toBe('nether');
    });

    it('should detect end dimension', () => {
      const bot = createMockBot({ game: { dimension: 'the_end' } });
      const state = getWorldState(bot as any);

      expect(state.dimension).toBe('end');
    });

    it('should return spawn point', () => {
      const bot = createMockBot({ spawnPoint: { x: 100, y: 64, z: -50 } });
      const state = getWorldState(bot as any);

      expect(state.spawnPoint).toEqual({ x: 100, y: 64, z: -50 });
    });
  });

  describe('isNightTime', () => {
    it('should return true at night', () => {
      const bot = createMockBot({ time: { timeOfDay: 18000 } });
      expect(isNightTime(bot as any)).toBe(true);
    });

    it('should return false during day', () => {
      const bot = createMockBot({ time: { timeOfDay: 6000 } });
      expect(isNightTime(bot as any)).toBe(false);
    });
  });

  describe('isSafeToSleep', () => {
    it('should return safe true at night in overworld', () => {
      const bot = createMockBot({
        time: { timeOfDay: 18000 },
        game: { dimension: 'overworld' },
      });
      const result = isSafeToSleep(bot as any);

      expect(result.safe).toBe(true);
    });

    it('should return safe false during day', () => {
      const bot = createMockBot({ time: { timeOfDay: 6000 } });
      const result = isSafeToSleep(bot as any);

      expect(result.safe).toBe(false);
      expect(result.reason).toContain('night');
    });

    it('should return safe false with hostile mobs nearby', () => {
      const zombie = {
        name: 'zombie',
        position: { distanceTo: () => 5 },
      };
      const bot = createMockBot({
        time: { timeOfDay: 18000 },
        entities: { 1: zombie },
      });
      const result = isSafeToSleep(bot as any);

      expect(result.safe).toBe(false);
      expect(result.reason).toContain('hostile');
    });
  });

  describe('getDangerLevel', () => {
    it('should return low danger during day', () => {
      const bot = createMockBot({
        time: { timeOfDay: 6000 },
        light: 15,
        entities: {},
      });
      const result = getDangerLevel(bot as any);

      expect(result.level).toBeLessThanOrEqual(3);
      expect(result.description).toMatch(/safe|low/);
    });

    it('should return higher danger at night', () => {
      const bot = createMockBot({
        time: { timeOfDay: 18000 },
        light: 0,
        entities: {},
      });
      const result = getDangerLevel(bot as any);

      expect(result.level).toBeGreaterThan(0);
    });

    it('should include factors in response', () => {
      const bot = createMockBot({
        time: { timeOfDay: 18000 },
        light: 0,
      });
      const result = getDangerLevel(bot as any);

      expect(result.factors).toBeDefined();
      expect(Array.isArray(result.factors)).toBe(true);
    });
  });
});
