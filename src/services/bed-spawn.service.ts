/**
 * Bed Spawn Management Service
 *
 * Manages bed locations and spawn points:
 * - Tracks known bed locations across dimensions
 * - Remembers spawn points (where bot has slept)
 * - Provides navigation to beds
 * - Handles spawn point strategy (primary, backup beds)
 * - Persists bed data to memory service
 *
 * Bed mechanics:
 * - Sleeping sets spawn point in Overworld
 * - Beds explode in Nether/End
 * - Respawn anchors work in Nether
 * - Must be night or thunderstorm to sleep
 */

import type { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import { logger } from '../utils/logger.js';
import { pushEvent } from './event.service.js';

const log = logger.child('bed-spawn');

/** Bed location information */
export interface BedLocation {
  position: { x: number; y: number; z: number };
  dimension: 'overworld' | 'nether' | 'end';
  label?: string;
  isSpawnPoint: boolean;
  lastUsed?: number;
  discoveredAt: number;
}

/** Respawn anchor information */
export interface RespawnAnchorLocation {
  position: { x: number; y: number; z: number };
  charges: number; // 0-4
  lastCharged?: number;
}

/** Bed spawn configuration */
export interface BedSpawnConfig {
  /** Whether bed tracking is enabled */
  enabled: boolean;
  /** Maximum beds to remember */
  maxBedsTracked: number;
  /** Scan radius for finding beds */
  scanRadius: number;
  /** Auto-set spawn when sleeping */
  autoSetSpawn: boolean;
}

/** Default configuration */
export const DEFAULT_BED_SPAWN_CONFIG: BedSpawnConfig = {
  enabled: true,
  maxBedsTracked: 20,
  scanRadius: 64,
  autoSetSpawn: true,
};

/** Bed spawn state */
interface BedSpawnState {
  config: BedSpawnConfig;
  beds: Map<string, BedLocation>;
  respawnAnchors: Map<string, RespawnAnchorLocation>;
  currentSpawnPoint: BedLocation | null;
  backupSpawnPoint: BedLocation | null;
}

/** Bed block names */
const BED_BLOCKS = new Set([
  'white_bed', 'orange_bed', 'magenta_bed', 'light_blue_bed',
  'yellow_bed', 'lime_bed', 'pink_bed', 'gray_bed',
  'light_gray_bed', 'cyan_bed', 'purple_bed', 'blue_bed',
  'brown_bed', 'green_bed', 'red_bed', 'black_bed',
]);

/** Get position key for map storage */
function posKey(pos: { x: number; y: number; z: number }): string {
  return `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;
}

/** Extended bot type with bed spawn state */
interface BotWithBedSpawn extends Bot {
  __bedSpawnState?: BedSpawnState;
}

/** Get or create bed spawn state for a bot */
function getBedState(bot: Bot): BedSpawnState {
  const managed = bot as BotWithBedSpawn;
  if (!managed.__bedSpawnState) {
    managed.__bedSpawnState = {
      config: { ...DEFAULT_BED_SPAWN_CONFIG },
      beds: new Map(),
      respawnAnchors: new Map(),
      currentSpawnPoint: null,
      backupSpawnPoint: null,
    };
  }
  return managed.__bedSpawnState;
}

/** Bot with game state - dimension access */
interface BotGameExtended {
  game?: { dimension?: string };
}

/**
 * Get current dimension
 */
function getCurrentDimension(bot: Bot): 'overworld' | 'nether' | 'end' {
  const botWithGame = bot as unknown as BotGameExtended;
  const dim = botWithGame.game?.dimension || 'overworld';
  if (dim.includes('nether')) return 'nether';
  if (dim.includes('end')) return 'end';
  return 'overworld';
}

/**
 * Check if a block is a bed
 */
function isBedBlock(blockName: string): boolean {
  return BED_BLOCKS.has(blockName);
}

/**
 * Find beds near the bot
 */
export function findNearbyBeds(bot: Bot, radius?: number): BedLocation[] {
  const state = getBedState(bot);
  const searchRadius = radius ?? state.config.scanRadius;
  const dimension = getCurrentDimension(bot);

  const beds: BedLocation[] = [];

  const bedBlocks = bot.findBlocks({
    matching: (block) => block !== null && isBedBlock(block.name),
    maxDistance: searchRadius,
    count: 20,
  });

  for (const pos of bedBlocks) {
    const key = posKey(pos);
    const existing = state.beds.get(key);

    const bedLocation: BedLocation = existing || {
      position: { x: pos.x, y: pos.y, z: pos.z },
      dimension,
      isSpawnPoint: false,
      discoveredAt: Date.now(),
    };

    beds.push(bedLocation);

    // Auto-register discovered beds
    if (!existing) {
      registerBed(bot, bedLocation);
    }
  }

  return beds;
}

/**
 * Register a bed location
 */
export function registerBed(
  bot: Bot,
  bed: Omit<BedLocation, 'discoveredAt'> & { discoveredAt?: number }
): void {
  const state = getBedState(bot);
  const key = posKey(bed.position);

  const bedLocation: BedLocation = {
    ...bed,
    discoveredAt: bed.discoveredAt ?? Date.now(),
  };

  state.beds.set(key, bedLocation);

  // Trim if too many
  if (state.beds.size > state.config.maxBedsTracked) {
    // Remove oldest non-spawn beds
    const sortedBeds = [...state.beds.entries()]
      .filter(([_, b]) => !b.isSpawnPoint)
      .sort((a, b) => a[1].discoveredAt - b[1].discoveredAt);

    while (state.beds.size > state.config.maxBedsTracked && sortedBeds.length > 0) {
      const oldest = sortedBeds.shift();
      if (oldest) state.beds.delete(oldest[0]);
    }
  }

  log.debug('Bed registered', { position: bed.position, label: bed.label });
}

/**
 * Set a bed as the spawn point
 */
export function setSpawnPoint(bot: Bot, bed: BedLocation): void {
  const state = getBedState(bot);
  const key = posKey(bed.position);

  // Demote current spawn to backup
  if (state.currentSpawnPoint) {
    state.backupSpawnPoint = state.currentSpawnPoint;
    const oldKey = posKey(state.currentSpawnPoint.position);
    const oldBed = state.beds.get(oldKey);
    if (oldBed) {
      oldBed.isSpawnPoint = false;
      state.beds.set(oldKey, oldBed);
    }
  }

  // Set new spawn point
  bed.isSpawnPoint = true;
  bed.lastUsed = Date.now();
  state.beds.set(key, bed);
  state.currentSpawnPoint = bed;

  pushEvent(bot, 'spawned', {
    action: 'spawn_point_set',
    position: bed.position,
    dimension: bed.dimension,
    label: bed.label,
  });

  log.info('Spawn point set', { position: bed.position, label: bed.label });
}

/**
 * Get all known beds
 */
export function getKnownBeds(bot: Bot, dimension?: 'overworld' | 'nether' | 'end'): BedLocation[] {
  const state = getBedState(bot);
  let beds = [...state.beds.values()];

  if (dimension) {
    beds = beds.filter((b) => b.dimension === dimension);
  }

  return beds.sort((a, b) => {
    // Spawn points first
    if (a.isSpawnPoint !== b.isSpawnPoint) return a.isSpawnPoint ? -1 : 1;
    // Then by last used
    return (b.lastUsed || 0) - (a.lastUsed || 0);
  });
}

/**
 * Get current spawn point
 */
export function getCurrentSpawnPoint(bot: Bot): BedLocation | null {
  const state = getBedState(bot);
  return state.currentSpawnPoint;
}

/**
 * Get backup spawn point
 */
export function getBackupSpawnPoint(bot: Bot): BedLocation | null {
  const state = getBedState(bot);
  return state.backupSpawnPoint;
}

/**
 * Find nearest bed
 */
export function findNearestBed(bot: Bot): BedLocation | null {
  if (!bot.entity?.position) return null;

  const beds = findNearbyBeds(bot);
  if (beds.length === 0) return null;

  return beds.sort((a, b) => {
    const distA = bot.entity.position.distanceTo(
      new Vec3(a.position.x, a.position.y, a.position.z)
    );
    const distB = bot.entity.position.distanceTo(
      new Vec3(b.position.x, b.position.y, b.position.z)
    );
    return distA - distB;
  })[0];
}

/**
 * Check if it's possible to sleep now
 */
export function canSleepNow(bot: Bot): { canSleep: boolean; reason?: string } {
  const dimension = getCurrentDimension(bot);

  // Can't sleep in Nether or End
  if (dimension !== 'overworld') {
    return { canSleep: false, reason: 'wrong_dimension' };
  }

  // Check time of day
  const timeOfDay = bot.time.timeOfDay;
  const isNight = timeOfDay >= 12541 && timeOfDay <= 23458;
  const botWithThunder = bot as Bot & { thunderState?: number };
  const isThundering = bot.isRaining && (botWithThunder.thunderState ?? 0) > 0;

  if (!isNight && !isThundering) {
    return { canSleep: false, reason: 'not_night' };
  }

  // Check for nearby monsters
  interface EntityLike {
    position?: { distanceTo(other: { x: number; y: number; z: number }): number };
    name?: string;
  }
  const monsters = Object.values(bot.entities).filter((e: EntityLike) => {
    if (!e || !e.position || e === bot.entity) return false;
    if (e.position.distanceTo(bot.entity.position) > 10) return false;
    const hostile = ['zombie', 'skeleton', 'spider', 'creeper', 'enderman', 'witch'];
    return hostile.some((h) => e.name?.includes(h));
  });

  if (monsters.length > 0) {
    return { canSleep: false, reason: 'monsters_nearby' };
  }

  return { canSleep: true };
}

/**
 * Sleep in a bed
 */
export async function sleepInBed(
  bot: Bot,
  bed?: BedLocation
): Promise<{ success: boolean; reason?: string; bed?: BedLocation }> {
  const state = getBedState(bot);

  // Check if we can sleep
  const sleepCheck = canSleepNow(bot);
  if (!sleepCheck.canSleep) {
    // If daytime, we can still set spawn point by clicking bed
    if (sleepCheck.reason === 'not_night' && state.config.autoSetSpawn) {
      // Find a bed to set spawn
      const targetBed = bed || findNearestBed(bot);
      if (targetBed) {
        const block = bot.blockAt(
          new Vec3(targetBed.position.x, targetBed.position.y, targetBed.position.z)
        );
        if (block) {
          try {
            await bot.activateBlock(block);
            setSpawnPoint(bot, targetBed);
            return { success: true, reason: 'spawn_set_daytime', bed: targetBed };
          } catch (err) {
            log.debug('Failed to set spawn during day', { error: err });
          }
        }
      }
    }
    return { success: false, reason: sleepCheck.reason };
  }

  // Find bed to sleep in
  const targetBed = bed || findNearestBed(bot);
  if (!targetBed) {
    return { success: false, reason: 'no_bed_found' };
  }

  try {
    const block = bot.blockAt(
      new Vec3(targetBed.position.x, targetBed.position.y, targetBed.position.z)
    );

    if (!block || !isBedBlock(block.name)) {
      return { success: false, reason: 'bed_destroyed' };
    }

    // Sleep in bed
    await bot.sleep(block);

    // Update spawn point
    setSpawnPoint(bot, targetBed);

    // Wait for sleep to complete
    await new Promise<void>((resolve) => {
      const onWake = () => {
        bot.removeListener('wake', onWake);
        resolve();
      };
      bot.on('wake', onWake);

      // Timeout after 20 seconds
      setTimeout(() => {
        bot.removeListener('wake', onWake);
        resolve();
      }, 20000);
    });

    log.info('Slept in bed', { position: targetBed.position });
    return { success: true, bed: targetBed };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.debug('Failed to sleep', { error: errMsg });
    return { success: false, reason: errMsg };
  }
}

/**
 * Navigate to nearest bed
 */
export async function goToBed(bot: Bot): Promise<{ success: boolean; bed?: BedLocation }> {
  const bed = findNearestBed(bot);
  if (!bed) {
    return { success: false };
  }

  try {
    const { goals } = await import('mineflayer-pathfinder');
    const goal = new goals.GoalNear(bed.position.x, bed.position.y, bed.position.z, 2);
    bot.pathfinder.setGoal(goal);

    // Wait for arrival
    const start = Date.now();
    while (Date.now() - start < 30000) {
      const dist = bot.entity.position.distanceTo(
        new Vec3(bed.position.x, bed.position.y, bed.position.z)
      );
      if (dist <= 3) {
        return { success: true, bed };
      }
      await bot.waitForTicks(5);
    }

    return { success: false };
  } catch (error) {
    log.debug('Failed to navigate to bed', { error });
    return { success: false };
  }
}

/**
 * Navigate to spawn point
 */
export async function goToSpawnPoint(bot: Bot): Promise<{ success: boolean; spawn?: BedLocation }> {
  const spawn = getCurrentSpawnPoint(bot);
  if (!spawn) {
    return { success: false };
  }

  try {
    const { goals } = await import('mineflayer-pathfinder');
    const goal = new goals.GoalNear(spawn.position.x, spawn.position.y, spawn.position.z, 2);
    bot.pathfinder.setGoal(goal);

    // Wait for arrival
    const start = Date.now();
    while (Date.now() - start < 60000) {
      const dist = bot.entity.position.distanceTo(
        new Vec3(spawn.position.x, spawn.position.y, spawn.position.z)
      );
      if (dist <= 3) {
        return { success: true, spawn };
      }
      await bot.waitForTicks(5);
    }

    return { success: false };
  } catch (error) {
    log.debug('Failed to navigate to spawn', { error });
    return { success: false };
  }
}

/**
 * Label a bed location
 */
export function labelBed(
  bot: Bot,
  position: { x: number; y: number; z: number },
  label: string
): boolean {
  const state = getBedState(bot);
  const key = posKey(position);
  const bed = state.beds.get(key);

  if (!bed) {
    return false;
  }

  bed.label = label;
  state.beds.set(key, bed);

  log.debug('Bed labeled', { position, label });
  return true;
}

/**
 * Remove a bed from tracking
 */
export function removeBed(bot: Bot, position: { x: number; y: number; z: number }): boolean {
  const state = getBedState(bot);
  const key = posKey(position);

  if (state.currentSpawnPoint && posKey(state.currentSpawnPoint.position) === key) {
    state.currentSpawnPoint = state.backupSpawnPoint;
    state.backupSpawnPoint = null;
  }

  return state.beds.delete(key);
}

/**
 * Get bed spawn status
 */
export function getBedSpawnStatus(bot: Bot): {
  enabled: boolean;
  config: BedSpawnConfig;
  knownBeds: number;
  currentSpawnPoint: BedLocation | null;
  backupSpawnPoint: BedLocation | null;
  canSleepNow: boolean;
  sleepReason?: string;
  nearestBedDistance: number;
  dimension: string;
} {
  const state = getBedState(bot);
  const sleepCheck = canSleepNow(bot);
  const nearestBed = findNearestBed(bot);

  let nearestBedDistance = -1;
  if (nearestBed && bot.entity?.position) {
    nearestBedDistance = Math.round(
      bot.entity.position.distanceTo(
        new Vec3(nearestBed.position.x, nearestBed.position.y, nearestBed.position.z)
      )
    );
  }

  return {
    enabled: state.config.enabled,
    config: state.config,
    knownBeds: state.beds.size,
    currentSpawnPoint: state.currentSpawnPoint,
    backupSpawnPoint: state.backupSpawnPoint,
    canSleepNow: sleepCheck.canSleep,
    sleepReason: sleepCheck.reason,
    nearestBedDistance,
    dimension: getCurrentDimension(bot),
  };
}

/**
 * Initialize bed spawn service
 */
export function initializeBedSpawnService(bot: Bot, config?: Partial<BedSpawnConfig>): void {
  const state = getBedState(bot);

  if (config) {
    state.config = { ...state.config, ...config };
  }

  // Initial scan for beds
  if (state.config.enabled) {
    findNearbyBeds(bot);
  }

  log.info('Bed spawn service initialized', { username: bot.username });
}

/**
 * Configure bed spawn service
 */
export function configureBedSpawnService(bot: Bot, config: Partial<BedSpawnConfig>): void {
  const state = getBedState(bot);
  state.config = { ...state.config, ...config };
  log.debug('Bed spawn service configured', { config: state.config });
}

/**
 * Export bed data for persistence
 */
export function exportBedData(bot: Bot): {
  beds: BedLocation[];
  currentSpawnPoint: BedLocation | null;
  backupSpawnPoint: BedLocation | null;
} {
  const state = getBedState(bot);
  return {
    beds: [...state.beds.values()],
    currentSpawnPoint: state.currentSpawnPoint,
    backupSpawnPoint: state.backupSpawnPoint,
  };
}

/**
 * Import bed data from persistence
 */
export function importBedData(
  bot: Bot,
  data: {
    beds?: BedLocation[];
    currentSpawnPoint?: BedLocation | null;
    backupSpawnPoint?: BedLocation | null;
  }
): void {
  const state = getBedState(bot);

  if (data.beds) {
    for (const bed of data.beds) {
      state.beds.set(posKey(bed.position), bed);
    }
  }

  if (data.currentSpawnPoint) {
    state.currentSpawnPoint = data.currentSpawnPoint;
  }

  if (data.backupSpawnPoint) {
    state.backupSpawnPoint = data.backupSpawnPoint;
  }

  log.debug('Bed data imported', { beds: state.beds.size });
}
