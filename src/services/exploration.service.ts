/**
 * Exploration Service
 *
 * Track explored areas and points of interest.
 * Persists via MemoryService for cross-session access.
 */

import type { Bot } from 'mineflayer';
import { remember, recall } from './memory.service.js';
import { logger } from '../utils/logger.js';

const log = logger.child('exploration');

export interface PointOfInterest {
  type: string; // 'village', 'dungeon', 'mineshaft', 'stronghold', 'monument', etc.
  position: { x: number; y: number; z: number };
  dimension: string;
  discoveredAt: number;
  notes?: string;
}

export interface ExploredChunk {
  x: number;
  z: number;
  dimension: string;
  exploredAt: number;
  pois: string[]; // POI IDs in this chunk
}

export interface ExplorationStats {
  chunksExplored: number;
  poisDiscovered: number;
  byDimension: Record<string, number>;
  byPoiType: Record<string, number>;
}

// Memory keys
const EXPLORED_CHUNKS_KEY = 'exploration:chunks';
const POIS_KEY = 'exploration:pois';
const LAST_DIRECTION_KEY = 'exploration:last_direction';

// Maximum chunks to store (prevents unbounded memory growth)
const MAX_CHUNKS = 10000;

/**
 * Get chunk coordinates from world position
 */
function getChunkCoords(x: number, z: number): { chunkX: number; chunkZ: number } {
  return {
    chunkX: Math.floor(x / 16),
    chunkZ: Math.floor(z / 16),
  };
}

/**
 * Generate chunk ID
 */
function chunkId(chunkX: number, chunkZ: number, dimension: string): string {
  return `${dimension}:${chunkX},${chunkZ}`;
}

/**
 * Get dimension from bot
 */
function getDimension(bot: Bot): string {
  const dim = String(bot.game?.dimension ?? 'overworld');
  if (dim.includes('nether')) return 'nether';
  if (dim.includes('end')) return 'end';
  return 'overworld';
}

/**
 * Get all explored chunks
 */
function getExploredChunks(): Map<string, ExploredChunk> {
  const data = recall<Record<string, ExploredChunk>>(EXPLORED_CHUNKS_KEY, 'spatial');
  return new Map(Object.entries(data ?? {}));
}

/**
 * Save explored chunks with LRU eviction if over limit
 */
function saveExploredChunks(chunks: Map<string, ExploredChunk>): void {
  // Evict oldest chunks if over limit
  if (chunks.size > MAX_CHUNKS) {
    const sortedEntries = Array.from(chunks.entries())
      .sort((a, b) => b[1].exploredAt - a[1].exploredAt) // Most recent first
      .slice(0, MAX_CHUNKS); // Keep only MAX_CHUNKS most recent
    chunks = new Map(sortedEntries);
    log.debug('Evicted old exploration chunks', { remaining: chunks.size });
  }
  remember(EXPLORED_CHUNKS_KEY, Object.fromEntries(chunks), 'spatial');
}

/**
 * Get all points of interest
 */
function getAllPOIs(): Map<string, PointOfInterest> {
  const data = recall<Record<string, PointOfInterest>>(POIS_KEY, 'spatial');
  return new Map(Object.entries(data ?? {}));
}

/**
 * Save points of interest
 */
function savePOIs(pois: Map<string, PointOfInterest>): void {
  remember(POIS_KEY, Object.fromEntries(pois), 'spatial');
}

/**
 * Mark a chunk as explored
 */
export function markExplored(
  bot: Bot,
  x?: number,
  z?: number
): ExploredChunk {
  const pos = bot.entity.position;
  const worldX = x ?? pos.x;
  const worldZ = z ?? pos.z;
  const dimension = getDimension(bot);

  const { chunkX, chunkZ } = getChunkCoords(worldX, worldZ);
  const id = chunkId(chunkX, chunkZ, dimension);

  const chunks = getExploredChunks();

  // Check if already explored
  const existing = chunks.get(id);
  if (existing) {
    return existing;
  }

  const chunk: ExploredChunk = {
    x: chunkX,
    z: chunkZ,
    dimension,
    exploredAt: Date.now(),
    pois: [],
  };

  chunks.set(id, chunk);
  saveExploredChunks(chunks);

  log.debug('Marked chunk as explored', { chunkX, chunkZ, dimension });

  return chunk;
}

/**
 * Check if a chunk is explored
 */
export function isExplored(
  chunkX: number,
  chunkZ: number,
  dimension: string = 'overworld'
): boolean {
  const chunks = getExploredChunks();
  return chunks.has(chunkId(chunkX, chunkZ, dimension));
}

/**
 * Add a point of interest
 */
export function addPointOfInterest(
  type: string,
  position: { x: number; y: number; z: number },
  dimension: string = 'overworld',
  notes?: string
): PointOfInterest {
  const pois = getAllPOIs();

  // Generate ID based on position
  const id = `${dimension}:${type}:${Math.floor(position.x)},${Math.floor(position.y)},${Math.floor(position.z)}`;

  const poi: PointOfInterest = {
    type,
    position: {
      x: Math.floor(position.x),
      y: Math.floor(position.y),
      z: Math.floor(position.z),
    },
    dimension,
    discoveredAt: Date.now(),
    notes,
  };

  pois.set(id, poi);
  savePOIs(pois);

  // Also mark the chunk as explored with this POI
  const { chunkX, chunkZ } = getChunkCoords(position.x, position.z);
  const chunks = getExploredChunks();
  const cId = chunkId(chunkX, chunkZ, dimension);

  const existingChunk = chunks.get(cId);
  if (existingChunk) {
    if (!existingChunk.pois.includes(id)) {
      existingChunk.pois.push(id);
      saveExploredChunks(chunks);
    }
  }

  log.info('Added POI', { type, position, dimension });

  return poi;
}

/**
 * Get points of interest by type
 */
export function getPointsOfInterest(
  type?: string,
  dimension?: string
): PointOfInterest[] {
  const pois = getAllPOIs();
  let results = Array.from(pois.values());

  if (type) {
    results = results.filter((p) => p.type.toLowerCase() === type.toLowerCase());
  }

  if (dimension) {
    results = results.filter((p) => p.dimension === dimension);
  }

  return results;
}

/**
 * Find nearest POI of a type
 */
export function findNearestPOI(
  bot: Bot,
  type?: string
): PointOfInterest | null {
  const pos = bot.entity.position;
  const dimension = getDimension(bot);
  const pois = getPointsOfInterest(type, dimension);

  if (pois.length === 0) return null;

  // Sort by distance
  pois.sort((a, b) => {
    const distA = Math.sqrt(
      Math.pow(a.position.x - pos.x, 2) + Math.pow(a.position.z - pos.z, 2)
    );
    const distB = Math.sqrt(
      Math.pow(b.position.x - pos.x, 2) + Math.pow(b.position.z - pos.z, 2)
    );
    return distA - distB;
  });

  return pois[0];
}

/**
 * Get an unexplored direction to suggest for exploration
 */
export function getUnexploredDirection(bot: Bot): {
  direction: string;
  target: { x: number; z: number };
  distance: number;
} {
  const pos = bot.entity.position;
  const dimension = getDimension(bot);
  const chunks = getExploredChunks();

  // Get last direction to avoid going back
  const lastDirection = recall<string>(LAST_DIRECTION_KEY, 'spatial') ?? '';

  // Directions to check (prioritize different from last)
  const directions = [
    { name: 'north', dx: 0, dz: -1 },
    { name: 'south', dx: 0, dz: 1 },
    { name: 'east', dx: 1, dz: 0 },
    { name: 'west', dx: -1, dz: 0 },
    { name: 'northeast', dx: 1, dz: -1 },
    { name: 'northwest', dx: -1, dz: -1 },
    { name: 'southeast', dx: 1, dz: 1 },
    { name: 'southwest', dx: -1, dz: 1 },
  ];

  // Reorder to put last direction at end
  const orderedDirs = [
    ...directions.filter((d) => d.name !== lastDirection),
    ...directions.filter((d) => d.name === lastDirection),
  ];

  // Find first unexplored direction
  for (const dir of orderedDirs) {
    // Check chunks 2-5 chunks away in this direction
    for (let dist = 2; dist <= 5; dist++) {
      const targetX = pos.x + dir.dx * dist * 16;
      const targetZ = pos.z + dir.dz * dist * 16;
      const { chunkX, chunkZ } = getChunkCoords(targetX, targetZ);

      if (!chunks.has(chunkId(chunkX, chunkZ, dimension))) {
        // Save this direction
        remember(LAST_DIRECTION_KEY, dir.name, 'spatial');

        return {
          direction: dir.name,
          target: { x: Math.floor(targetX), z: Math.floor(targetZ) },
          distance: dist * 16,
        };
      }
    }
  }

  // All nearby areas explored, suggest random far direction
  const randomDir = orderedDirs[Math.floor(Math.random() * orderedDirs.length)];
  const farDist = 10;
  const targetX = pos.x + randomDir.dx * farDist * 16;
  const targetZ = pos.z + randomDir.dz * farDist * 16;

  remember(LAST_DIRECTION_KEY, randomDir.name, 'spatial');

  return {
    direction: randomDir.name,
    target: { x: Math.floor(targetX), z: Math.floor(targetZ) },
    distance: farDist * 16,
  };
}

/**
 * Get exploration statistics
 */
export function getExplorationStats(): ExplorationStats {
  const chunks = getExploredChunks();
  const pois = getAllPOIs();

  const byDimension: Record<string, number> = {};
  const byPoiType: Record<string, number> = {};

  for (const chunk of chunks.values()) {
    byDimension[chunk.dimension] = (byDimension[chunk.dimension] ?? 0) + 1;
  }

  for (const poi of pois.values()) {
    byPoiType[poi.type] = (byPoiType[poi.type] ?? 0) + 1;
  }

  return {
    chunksExplored: chunks.size,
    poisDiscovered: pois.size,
    byDimension,
    byPoiType,
  };
}

/**
 * Get exploration map for an area
 */
export function getExplorationMap(
  bot: Bot,
  radius: number = 5
): { explored: string[][]; center: { x: number; z: number } } {
  const pos = bot.entity.position;
  const dimension = getDimension(bot);
  const { chunkX: centerX, chunkZ: centerZ } = getChunkCoords(pos.x, pos.z);
  const chunks = getExploredChunks();

  const map: string[][] = [];

  for (let dz = -radius; dz <= radius; dz++) {
    const row: string[] = [];
    for (let dx = -radius; dx <= radius; dx++) {
      const cx = centerX + dx;
      const cz = centerZ + dz;

      if (dx === 0 && dz === 0) {
        row.push('X'); // Current position
      } else {
        const chunk = chunks.get(chunkId(cx, cz, dimension));
        if (chunk) {
          if (chunk.pois.length > 0) {
            row.push('P'); // Has POI
          } else {
            row.push('.'); // Explored
          }
        } else {
          row.push('?'); // Unexplored
        }
      }
    }
    map.push(row);
  }

  return {
    explored: map,
    center: { x: centerX, z: centerZ },
  };
}

/**
 * Clear all exploration data
 */
export function clearExplorationData(): void {
  remember(EXPLORED_CHUNKS_KEY, {}, 'spatial');
  remember(POIS_KEY, {}, 'spatial');
  remember(LAST_DIRECTION_KEY, '', 'spatial');
  log.info('Cleared all exploration data');
}
