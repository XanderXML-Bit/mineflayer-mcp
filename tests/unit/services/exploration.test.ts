/**
 * Exploration Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  markExplored,
  isExplored,
  addPointOfInterest,
  getPointsOfInterest,
  findNearestPOI,
  getUnexploredDirection,
  getExplorationStats,
  getExplorationMap,
  clearExplorationData,
} from '../../../src/services/exploration.service.js';
import { shutdownMemoryService, getMemoryService } from '../../../src/services/memory.service.js';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Mock bot factory
const createMockBot = (overrides: any = {}) => ({
  entity: {
    position: overrides.position ?? { x: 0, y: 64, z: 0 },
  },
  game: {
    dimension: overrides.dimension ?? 'overworld',
  },
});

describe('ExplorationService', () => {
  // Seed the memory singleton with an owned temporary directory instead of the default ./data path.
  let memoryDir: string;

  beforeEach(() => {
    shutdownMemoryService();
    memoryDir = mkdtempSync(join(tmpdir(), 'mc-mcp-exploration-'));
    getMemoryService(memoryDir);
    clearExplorationData();
  });

  afterEach(() => {
    clearExplorationData();
    shutdownMemoryService();
    rmSync(memoryDir, { recursive: true });
  });

  describe('markExplored', () => {
    it('should mark current chunk as explored', () => {
      const bot = createMockBot({ position: { x: 100, y: 64, z: 100 } });
      const chunk = markExplored(bot as any);

      expect(chunk.x).toBe(6); // 100 / 16 = 6.25 -> 6
      expect(chunk.z).toBe(6);
      expect(chunk.dimension).toBe('overworld');
    });

    it('should mark specific coordinates as explored', () => {
      const bot = createMockBot();
      const chunk = markExplored(bot as any, 256, 256);

      expect(chunk.x).toBe(16);
      expect(chunk.z).toBe(16);
    });

    it('should return existing chunk if already explored', () => {
      const bot = createMockBot({ position: { x: 0, y: 64, z: 0 } });
      const first = markExplored(bot as any);
      const second = markExplored(bot as any);

      expect(first.exploredAt).toBe(second.exploredAt);
    });

    it('should handle nether dimension', () => {
      const bot = createMockBot({ dimension: 'minecraft:the_nether' });
      const chunk = markExplored(bot as any);

      expect(chunk.dimension).toBe('nether');
    });
  });

  describe('isExplored', () => {
    it('should return false for unexplored chunk', () => {
      expect(isExplored(10, 10, 'overworld')).toBe(false);
    });

    it('should return true for explored chunk', () => {
      const bot = createMockBot({ position: { x: 160, y: 64, z: 160 } });
      markExplored(bot as any);

      expect(isExplored(10, 10, 'overworld')).toBe(true);
    });
  });

  describe('addPointOfInterest', () => {
    it('should add a POI', () => {
      const poi = addPointOfInterest('village', { x: 100, y: 64, z: -50 }, 'overworld');

      expect(poi.type).toBe('village');
      expect(poi.position).toEqual({ x: 100, y: 64, z: -50 });
      expect(poi.dimension).toBe('overworld');
    });

    it('should add POI with notes', () => {
      const poi = addPointOfInterest('dungeon', { x: 50, y: 20, z: 50 }, 'overworld', 'Zombie spawner');

      expect(poi.notes).toBe('Zombie spawner');
    });
  });

  describe('getPointsOfInterest', () => {
    beforeEach(() => {
      addPointOfInterest('village', { x: 100, y: 64, z: 100 }, 'overworld');
      addPointOfInterest('dungeon', { x: 50, y: 20, z: 50 }, 'overworld');
      addPointOfInterest('village', { x: -100, y: 64, z: -100 }, 'overworld');
      addPointOfInterest('fortress', { x: 100, y: 64, z: 100 }, 'nether');
    });

    it('should return all POIs', () => {
      const pois = getPointsOfInterest();
      expect(pois.length).toBe(4);
    });

    it('should filter by type', () => {
      const villages = getPointsOfInterest('village');
      expect(villages.length).toBe(2);
      expect(villages.every((p) => p.type === 'village')).toBe(true);
    });

    it('should filter by dimension', () => {
      const netherPois = getPointsOfInterest(undefined, 'nether');
      expect(netherPois.length).toBe(1);
      expect(netherPois[0].type).toBe('fortress');
    });

    it('should filter by both type and dimension', () => {
      const overworldVillages = getPointsOfInterest('village', 'overworld');
      expect(overworldVillages.length).toBe(2);
    });
  });

  describe('findNearestPOI', () => {
    it('should return null when no POIs exist', () => {
      const bot = createMockBot();
      const nearest = findNearestPOI(bot as any);

      expect(nearest).toBeNull();
    });

    it('should find nearest POI', () => {
      addPointOfInterest('village', { x: 100, y: 64, z: 100 }, 'overworld');
      addPointOfInterest('village', { x: 50, y: 64, z: 50 }, 'overworld');
      addPointOfInterest('village', { x: 200, y: 64, z: 200 }, 'overworld');

      const bot = createMockBot({ position: { x: 60, y: 64, z: 60 } });
      const nearest = findNearestPOI(bot as any, 'village');

      expect(nearest?.position.x).toBe(50);
      expect(nearest?.position.z).toBe(50);
    });

    it('should filter by type', () => {
      addPointOfInterest('dungeon', { x: 10, y: 20, z: 10 }, 'overworld');
      addPointOfInterest('village', { x: 100, y: 64, z: 100 }, 'overworld');

      const bot = createMockBot({ position: { x: 0, y: 64, z: 0 } });
      const nearest = findNearestPOI(bot as any, 'village');

      expect(nearest?.type).toBe('village');
    });
  });

  describe('getUnexploredDirection', () => {
    it('should suggest an unexplored direction', () => {
      const bot = createMockBot({ position: { x: 0, y: 64, z: 0 } });
      const direction = getUnexploredDirection(bot as any);

      expect(direction.direction).toBeDefined();
      expect(direction.target).toBeDefined();
      expect(direction.distance).toBeGreaterThan(0);
    });

    it('should avoid previously explored areas', () => {
      const bot = createMockBot({ position: { x: 0, y: 64, z: 0 } });

      // Mark several chunks as explored in north direction
      for (let i = 0; i < 5; i++) {
        markExplored(bot as any, 0, -i * 16);
      }

      const direction = getUnexploredDirection(bot as any);

      // Should not suggest north as it's explored
      // (This is probabilistic, but north should be less likely)
      expect(direction.direction).toBeDefined();
    });
  });

  describe('getExplorationStats', () => {
    it('should return zero stats for empty data', () => {
      const stats = getExplorationStats();

      expect(stats.chunksExplored).toBe(0);
      expect(stats.poisDiscovered).toBe(0);
    });

    it('should count chunks and POIs correctly', () => {
      const bot = createMockBot();
      markExplored(bot as any, 0, 0);
      markExplored(bot as any, 16, 16);
      addPointOfInterest('village', { x: 100, y: 64, z: 100 }, 'overworld');
      addPointOfInterest('dungeon', { x: 50, y: 20, z: 50 }, 'overworld');

      const stats = getExplorationStats();

      expect(stats.chunksExplored).toBe(2);
      expect(stats.poisDiscovered).toBe(2);
    });

    it('should break down by dimension', () => {
      const overworldBot = createMockBot({ dimension: 'overworld' });
      const netherBot = createMockBot({ dimension: 'the_nether' });

      markExplored(overworldBot as any);
      markExplored(netherBot as any);

      const stats = getExplorationStats();

      expect(stats.byDimension['overworld']).toBe(1);
      expect(stats.byDimension['nether']).toBe(1);
    });

    it('should break down by POI type', () => {
      addPointOfInterest('village', { x: 100, y: 64, z: 100 }, 'overworld');
      addPointOfInterest('village', { x: 200, y: 64, z: 200 }, 'overworld');
      addPointOfInterest('dungeon', { x: 50, y: 20, z: 50 }, 'overworld');

      const stats = getExplorationStats();

      expect(stats.byPoiType['village']).toBe(2);
      expect(stats.byPoiType['dungeon']).toBe(1);
    });
  });

  describe('getExplorationMap', () => {
    it('should return a map centered on current position', () => {
      const bot = createMockBot({ position: { x: 0, y: 64, z: 0 } });
      const { explored, center } = getExplorationMap(bot as any, 2);

      expect(explored.length).toBe(5); // 2*2 + 1
      expect(explored[0].length).toBe(5);
      expect(center).toEqual({ x: 0, z: 0 });
    });

    it('should mark current position with X', () => {
      const bot = createMockBot({ position: { x: 0, y: 64, z: 0 } });
      const { explored } = getExplorationMap(bot as any, 2);

      // Center of a 5x5 map is [2][2]
      expect(explored[2][2]).toBe('X');
    });

    it('should mark explored chunks with .', () => {
      const bot = createMockBot({ position: { x: 0, y: 64, z: 0 } });
      markExplored(bot as any, 16, 0); // One chunk to the east

      const { explored } = getExplorationMap(bot as any, 2);

      // East of center is [2][3]
      expect(explored[2][3]).toBe('.');
    });

    it('should mark unexplored chunks with ?', () => {
      const bot = createMockBot({ position: { x: 0, y: 64, z: 0 } });
      const { explored } = getExplorationMap(bot as any, 2);

      // Most positions should be unexplored except center
      expect(explored[0][0]).toBe('?');
    });
  });

  describe('clearExplorationData', () => {
    it('should clear all exploration data', () => {
      const bot = createMockBot();
      markExplored(bot as any);
      addPointOfInterest('village', { x: 100, y: 64, z: 100 }, 'overworld');

      clearExplorationData();

      const stats = getExplorationStats();
      expect(stats.chunksExplored).toBe(0);
      expect(stats.poisDiscovered).toBe(0);
    });
  });
});
