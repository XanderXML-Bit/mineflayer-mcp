/**
 * Storage Index Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getAllStorageLocations,
  findItemInStorage,
  labelStorage,
  getStorageByLabel,
  getStorageSummary,
  removeFromIndex,
  clearStorageIndex,
} from '../../../src/services/storage-index.service.js';
import { remember, recall, shutdownMemoryService, getMemoryService } from '../../../src/services/memory.service.js';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Helper to directly add storage locations for testing
function addTestStorage(
  id: string,
  position: { x: number; y: number; z: number },
  type: 'chest' | 'barrel' | 'shulker_box' | 'ender_chest',
  contents: { item: string; count: number; slot: number }[],
  dimension: string = 'overworld',
  label?: string
): void {
  // Get or create index using recall
  const existingIndex = recall<string[]>('storage:__index', 'resource');
  const indexList = existingIndex ?? [];

  if (!indexList.includes(id)) {
    indexList.push(id);
    remember('storage:__index', indexList, 'resource');
  }

  // Create storage location
  const location = {
    id,
    position,
    type,
    contents,
    totalItems: contents.reduce((sum, c) => sum + c.count, 0),
    totalSlots: type === 'barrel' ? 27 : 27,
    lastScanned: Date.now(),
    dimension,
    label,
  };

  remember(`storage:${id}`, location, 'resource');
}

describe('StorageIndexService', () => {
  // Seed the memory singleton with an owned temporary directory instead of the default ./data path.
  let memoryDir: string;

  beforeEach(() => {
    shutdownMemoryService();
    memoryDir = mkdtempSync(join(tmpdir(), 'mc-mcp-storage-'));
    getMemoryService(memoryDir);
    clearStorageIndex();
  });

  afterEach(() => {
    clearStorageIndex();
    shutdownMemoryService();
    rmSync(memoryDir, { recursive: true });
  });

  describe('getAllStorageLocations', () => {
    it('should return empty array when no storage indexed', () => {
      const locations = getAllStorageLocations();
      expect(locations).toEqual([]);
    });

    it('should return all indexed storage locations', () => {
      addTestStorage(
        'overworld:100,64,100',
        { x: 100, y: 64, z: 100 },
        'chest',
        [{ item: 'diamond', count: 10, slot: 0 }]
      );
      addTestStorage(
        'overworld:200,64,200',
        { x: 200, y: 64, z: 200 },
        'barrel',
        [{ item: 'iron_ingot', count: 64, slot: 0 }]
      );

      const locations = getAllStorageLocations();
      expect(locations.length).toBe(2);
    });
  });

  describe('findItemInStorage', () => {
    beforeEach(() => {
      addTestStorage(
        'overworld:100,64,100',
        { x: 100, y: 64, z: 100 },
        'chest',
        [
          { item: 'diamond', count: 10, slot: 0 },
          { item: 'diamond_sword', count: 1, slot: 1 },
          { item: 'iron_ingot', count: 32, slot: 2 },
        ]
      );
      addTestStorage(
        'overworld:200,64,200',
        { x: 200, y: 64, z: 200 },
        'barrel',
        [
          { item: 'diamond', count: 5, slot: 0 },
          { item: 'gold_ingot', count: 16, slot: 1 },
        ]
      );
    });

    it('should find items by name (partial match)', () => {
      const results = findItemInStorage('diamond');

      expect(results.length).toBe(2);
      // Results should be sorted by count (most first)
      // First chest has 10 diamond + 1 diamond_sword = 11 total
      expect(results[0].itemCount).toBe(11);
      expect(results[1].itemCount).toBe(5);
    });

    it('should find items by partial name', () => {
      const results = findItemInStorage('ingot');

      expect(results.length).toBe(2);
      expect(results.some((r) => r.location.contents.some((c) => c.item === 'iron_ingot'))).toBe(true);
      expect(results.some((r) => r.location.contents.some((c) => c.item === 'gold_ingot'))).toBe(true);
    });

    it('should return empty array when item not found', () => {
      const results = findItemInStorage('emerald');
      expect(results).toEqual([]);
    });

    it('should be case insensitive', () => {
      const results = findItemInStorage('DIAMOND');
      expect(results.length).toBe(2);
    });
  });

  describe('labelStorage', () => {
    it('should label a storage location', () => {
      addTestStorage(
        'overworld:100,64,100',
        { x: 100, y: 64, z: 100 },
        'chest',
        [{ item: 'diamond', count: 10, slot: 0 }]
      );

      const result = labelStorage({ x: 100, y: 64, z: 100 }, 'Diamond Chest');
      expect(result).toBe(true);

      const location = getStorageByLabel('Diamond Chest');
      expect(location).not.toBeNull();
      expect(location?.label).toBe('Diamond Chest');
    });

    it('should return false for non-existent storage', () => {
      const result = labelStorage({ x: 999, y: 999, z: 999 }, 'Missing');
      expect(result).toBe(false);
    });
  });

  describe('getStorageByLabel', () => {
    beforeEach(() => {
      addTestStorage(
        'overworld:100,64,100',
        { x: 100, y: 64, z: 100 },
        'chest',
        [{ item: 'diamond', count: 10, slot: 0 }],
        'overworld',
        'Valuables'
      );
    });

    it('should find storage by label', () => {
      const location = getStorageByLabel('Valuables');

      expect(location).not.toBeNull();
      expect(location?.position.x).toBe(100);
    });

    it('should be case insensitive', () => {
      const location = getStorageByLabel('valuables');
      expect(location).not.toBeNull();
    });

    it('should return null for non-existent label', () => {
      const location = getStorageByLabel('Missing');
      expect(location).toBeNull();
    });
  });

  describe('getStorageSummary', () => {
    it('should return empty summary for no storage', () => {
      const summary = getStorageSummary();

      expect(summary.totalLocations).toBe(0);
      expect(summary.totalItems).toEqual({});
      expect(summary.byType).toEqual({});
    });

    it('should summarize storage correctly', () => {
      addTestStorage(
        'overworld:100,64,100',
        { x: 100, y: 64, z: 100 },
        'chest',
        [
          { item: 'diamond', count: 10, slot: 0 },
          { item: 'iron_ingot', count: 32, slot: 1 },
        ]
      );
      addTestStorage(
        'overworld:200,64,200',
        { x: 200, y: 64, z: 200 },
        'barrel',
        [
          { item: 'diamond', count: 5, slot: 0 },
          { item: 'gold_ingot', count: 16, slot: 1 },
        ]
      );

      const summary = getStorageSummary();

      expect(summary.totalLocations).toBe(2);
      expect(summary.totalItems['diamond']).toBe(15);
      expect(summary.totalItems['iron_ingot']).toBe(32);
      expect(summary.totalItems['gold_ingot']).toBe(16);
      expect(summary.byType['chest']).toBe(1);
      expect(summary.byType['barrel']).toBe(1);
    });

    it('should return recently scanned locations', () => {
      addTestStorage(
        'overworld:100,64,100',
        { x: 100, y: 64, z: 100 },
        'chest',
        []
      );
      addTestStorage(
        'overworld:200,64,200',
        { x: 200, y: 64, z: 200 },
        'chest',
        []
      );

      const summary = getStorageSummary();
      expect(summary.recentlyScanned.length).toBeLessThanOrEqual(5);
    });
  });

  describe('removeFromIndex', () => {
    it('should remove a storage location', () => {
      addTestStorage(
        'overworld:100,64,100',
        { x: 100, y: 64, z: 100 },
        'chest',
        [{ item: 'diamond', count: 10, slot: 0 }]
      );

      const result = removeFromIndex({ x: 100, y: 64, z: 100 });
      expect(result).toBe(true);

      const locations = getAllStorageLocations();
      expect(locations.length).toBe(0);
    });

    it('should return false for non-existent location', () => {
      const result = removeFromIndex({ x: 999, y: 999, z: 999 });
      expect(result).toBe(false);
    });
  });

  describe('clearStorageIndex', () => {
    it('should clear all storage data', () => {
      addTestStorage(
        'overworld:100,64,100',
        { x: 100, y: 64, z: 100 },
        'chest',
        [{ item: 'diamond', count: 10, slot: 0 }]
      );
      addTestStorage(
        'overworld:200,64,200',
        { x: 200, y: 64, z: 200 },
        'barrel',
        [{ item: 'iron_ingot', count: 64, slot: 0 }]
      );

      const count = clearStorageIndex();
      expect(count).toBe(2);

      const locations = getAllStorageLocations();
      expect(locations.length).toBe(0);
    });

    it('should return 0 when nothing to clear', () => {
      const count = clearStorageIndex();
      expect(count).toBe(0);
    });
  });
});
