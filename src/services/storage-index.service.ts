/**
 * Storage Index Service
 *
 * Track and remember contents of chests and other storage containers.
 * Persists via MemoryService for cross-session access.
 */

import type { Bot } from 'mineflayer';
import type { Block } from 'prismarine-block';
import { Vec3 } from 'vec3';
import minecraftData from 'minecraft-data';
import { remember, recall, forget } from './memory.service.js';
import { logger } from '../utils/logger.js';

const log = logger.child('storage-index');

export interface StorageItem {
  item: string;
  count: number;
  slot: number;
}

export interface StorageLocation {
  id: string; // Unique identifier based on position
  position: { x: number; y: number; z: number };
  type: 'chest' | 'barrel' | 'shulker_box' | 'ender_chest' | 'trapped_chest' | 'unknown';
  contents: StorageItem[];
  totalItems: number;
  totalSlots: number;
  lastScanned: number;
  label?: string;
  dimension: string;
}

export interface StorageSearchResult {
  location: StorageLocation;
  itemCount: number;
  slots: number[];
}

export interface StorageSummary {
  totalLocations: number;
  totalItems: Record<string, number>;
  byType: Record<string, number>;
  recentlyScanned: StorageLocation[];
}

// Memory key prefix for storage locations
const _STORAGE_PREFIX = 'storage:';

/**
 * Generate a unique ID for a storage location
 */
function generateStorageId(position: { x: number; y: number; z: number }, dimension: string): string {
  return `${dimension}:${Math.floor(position.x)},${Math.floor(position.y)},${Math.floor(position.z)}`;
}

/**
 * Get storage type from block name
 */
function getStorageType(blockName: string): StorageLocation['type'] {
  if (blockName === 'chest') return 'chest';
  if (blockName === 'trapped_chest') return 'trapped_chest';
  if (blockName === 'barrel') return 'barrel';
  if (blockName === 'ender_chest') return 'ender_chest';
  if (blockName.includes('shulker_box')) return 'shulker_box';
  return 'unknown';
}

/**
 * Get dimension name from bot
 */
function getDimension(bot: Bot): string {
  const dim = String(bot.game?.dimension ?? 'overworld');
  if (dim.includes('nether')) return 'nether';
  if (dim.includes('end')) return 'end';
  return 'overworld';
}

/**
 * Get all indexed storage locations
 */
export function getAllStorageLocations(): StorageLocation[] {
  const locations: StorageLocation[] = [];

  // Recall all storage memories
  // Since we can't enumerate memory keys, we maintain a list
  const indexList = recall<string[]>('storage:__index', 'resource');
  if (!indexList) return locations;

  for (const id of indexList) {
    const location = recall<StorageLocation>(`storage:${id}`, 'resource');
    if (location) {
      locations.push(location);
    }
  }

  return locations;
}

/**
 * Save a storage location to memory
 */
function saveStorageLocation(location: StorageLocation): void {
  // Get or create index
  const indexList = recall<string[]>('storage:__index', 'resource') ?? [];

  // Use Set for O(1) lookup instead of O(n) includes
  const indexSet = new Set(indexList);
  if (!indexSet.has(location.id)) {
    indexList.push(location.id);
    remember('storage:__index', indexList, 'resource');
  }

  remember(`storage:${location.id}`, location, 'resource');
}

/**
 * Remove a storage location from memory
 */
function removeStorageLocation(id: string): boolean {
  const indexList = recall<string[]>('storage:__index', 'resource') ?? [];
  const newIndex = indexList.filter((i) => i !== id);

  if (newIndex.length !== indexList.length) {
    remember('storage:__index', newIndex, 'resource');
    forget(`storage:${id}`, 'resource');
    return true;
  }

  return false;
}

/**
 * Index a storage container at a position
 * Opens the container, reads contents, and saves to memory
 */
export async function indexStorage(
  bot: Bot,
  position: { x: number; y: number; z: number }
): Promise<StorageLocation | null> {
  const block = bot.blockAt(new Vec3(position.x, position.y, position.z));
  if (!block) {
    log.warn('No block at position', { position });
    return null;
  }

  const storageType = getStorageType(block.name);
  if (storageType === 'unknown') {
    log.warn('Block is not a storage container', { block: block.name });
    return null;
  }

  const dimension = getDimension(bot);
  const id = generateStorageId(position, dimension);

  try {
    // Open the container
    const container = await bot.openContainer(block);

    // Read contents
    const contents: StorageItem[] = [];
    const slots = container.containerItems();

    for (const item of slots) {
      if (item) {
        contents.push({
          item: item.name,
          count: item.count,
          slot: item.slot,
        });
      }
    }

    // Close container
    container.close();

    // Create location record
    const location: StorageLocation = {
      id,
      position: {
        x: Math.floor(position.x),
        y: Math.floor(position.y),
        z: Math.floor(position.z),
      },
      type: storageType,
      contents,
      totalItems: contents.reduce((sum, c) => sum + c.count, 0),
      totalSlots: container.inventoryStart ?? 27, // Default chest size
      lastScanned: Date.now(),
      dimension,
    };

    // Check if there was a label
    const existing = recall<StorageLocation>(`storage:${id}`, 'resource');
    if (existing?.label) {
      location.label = existing.label;
    }

    // Save to memory
    saveStorageLocation(location);

    log.info('Indexed storage', {
      id,
      type: storageType,
      items: contents.length,
      total: location.totalItems,
    });

    return location;
  } catch (error) {
    log.error('Failed to index storage', { error, position });
    return null;
  }
}

/**
 * Find an item across all indexed storage
 */
export function findItemInStorage(itemName: string): StorageSearchResult[] {
  const results: StorageSearchResult[] = [];
  const locations = getAllStorageLocations();
  const searchLower = itemName.toLowerCase();

  for (const location of locations) {
    const matchingItems = location.contents.filter((c) =>
      c.item.toLowerCase().includes(searchLower)
    );

    if (matchingItems.length > 0) {
      results.push({
        location,
        itemCount: matchingItems.reduce((sum, m) => sum + m.count, 0),
        slots: matchingItems.map((m) => m.slot),
      });
    }
  }

  // Sort by count (most first)
  return results.sort((a, b) => b.itemCount - a.itemCount);
}

/**
 * Label a storage location for easy reference
 */
export function labelStorage(
  position: { x: number; y: number; z: number },
  label: string,
  dimension: string = 'overworld'
): boolean {
  const id = generateStorageId(position, dimension);
  const location = recall<StorageLocation>(`storage:${id}`, 'resource');

  if (!location) {
    log.warn('Storage location not found for labeling', { id });
    return false;
  }

  location.label = label;
  saveStorageLocation(location);

  log.info('Labeled storage', { id, label });
  return true;
}

/**
 * Get a storage location by label
 */
export function getStorageByLabel(label: string): StorageLocation | null {
  const locations = getAllStorageLocations();
  const labelLower = label.toLowerCase();

  return (
    locations.find((l) => l.label?.toLowerCase() === labelLower) ?? null
  );
}

/**
 * Get summary of all indexed storage
 */
export function getStorageSummary(): StorageSummary {
  const locations = getAllStorageLocations();
  const totalItems: Record<string, number> = {};
  const byType: Record<string, number> = {};

  for (const location of locations) {
    // Count by type
    byType[location.type] = (byType[location.type] ?? 0) + 1;

    // Aggregate items
    for (const item of location.contents) {
      totalItems[item.item] = (totalItems[item.item] ?? 0) + item.count;
    }
  }

  // Sort locations by last scanned
  const recentlyScanned = locations
    .sort((a, b) => b.lastScanned - a.lastScanned)
    .slice(0, 5);

  return {
    totalLocations: locations.length,
    totalItems,
    byType,
    recentlyScanned,
  };
}

/**
 * Storage block names for O(1) lookup
 */
const STORAGE_BLOCK_NAMES = new Set([
  'chest',
  'trapped_chest',
  'barrel',
  'ender_chest',
  'shulker_box',
  'white_shulker_box',
  'orange_shulker_box',
  'magenta_shulker_box',
  'light_blue_shulker_box',
  'yellow_shulker_box',
  'lime_shulker_box',
  'pink_shulker_box',
  'gray_shulker_box',
  'light_gray_shulker_box',
  'cyan_shulker_box',
  'purple_shulker_box',
  'blue_shulker_box',
  'brown_shulker_box',
  'green_shulker_box',
  'red_shulker_box',
  'black_shulker_box',
]);

/**
 * Find nearby storage containers
 * Uses mineflayer's findBlocks API for efficient O(n) searching
 */
export function findNearbyStorage(
  bot: Bot,
  radius: number = 32
): Block[] {
  // Get minecraft-data for this version
  const mcData = minecraftData(bot.version);

  // Build list of storage block IDs for efficient matching
  const storageBlockIds: number[] = [];
  for (const name of STORAGE_BLOCK_NAMES) {
    const blockData = mcData.blocksByName[name];
    if (blockData) {
      storageBlockIds.push(blockData.id);
    }
  }

  // Use findBlocks API - much more efficient than triple nested loop
  // This uses mineflayer's internal chunk scanning which is O(n) where n is blocks in radius
  const positions = bot.findBlocks({
    matching: storageBlockIds,
    maxDistance: radius,
    count: 1000, // Reasonable limit
  });

  // Convert positions to blocks
  const storageBlocks: Block[] = [];
  for (const pos of positions) {
    const block = bot.blockAt(pos);
    if (block) {
      storageBlocks.push(block);
    }
  }

  return storageBlocks;
}

/**
 * Remove a storage location from the index
 */
export function removeFromIndex(
  position: { x: number; y: number; z: number },
  dimension: string = 'overworld'
): boolean {
  const id = generateStorageId(position, dimension);
  return removeStorageLocation(id);
}

/**
 * Clear all storage index data
 */
export function clearStorageIndex(): number {
  const locations = getAllStorageLocations();
  const count = locations.length;

  for (const location of locations) {
    removeStorageLocation(location.id);
  }

  // Clear index list
  forget('storage:__index', 'resource');

  log.info('Cleared storage index', { count });
  return count;
}
