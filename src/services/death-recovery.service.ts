/**
 * Death Recovery Service
 *
 * Tracks death events and provides tools for recovering dropped items.
 */

import type { Bot } from 'mineflayer';

import { getMemoryService } from './memory.service.js';
import { logger } from '../utils/logger.js';

/** Bot with game dimension */
interface BotWithGame {
  game?: { dimension?: string };
}

const log = logger.child('death-recovery');

export interface DeathRecord {
  position: { x: number; y: number; z: number };
  timestamp: number;
  cause: string;
  dimension: string;
  recovered: boolean;
  recoveryAttempts: number;
}

const MEMORY_KEY = 'death_records';
const MAX_DEATH_HISTORY = 10;

let deathRecords: DeathRecord[] = [];
let initialized = false;

/**
 * Initialize death recovery service - load from memory
 */
function ensureInitialized(): void {
  if (initialized) return;

  const memory = getMemoryService();
  const stored = memory.recall(MEMORY_KEY);
  if (stored && Array.isArray(stored.value)) {
    deathRecords = stored.value;
  }
  initialized = true;
}

/**
 * Save death records to memory
 */
function saveToMemory(): void {
  const memory = getMemoryService();
  memory.remember(MEMORY_KEY, deathRecords, 'task');
}

/**
 * Record a death event
 */
export function recordDeath(
  bot: Bot,
  cause: string = 'unknown'
): DeathRecord {
  ensureInitialized();

  if (!bot.entity) {
    log.warn('Cannot record death - bot has no entity');
    return {
      position: { x: 0, y: 0, z: 0 },
      timestamp: Date.now(),
      cause,
      dimension: 'overworld',
      recovered: false,
      recoveryAttempts: 0,
    };
  }

  const pos = bot.entity.position;
  const botWithGame = bot as unknown as BotWithGame;
  const dimension = (botWithGame.game?.dimension || 'overworld')
    .replace('minecraft:', '')
    .replace('the_', '');

  const record: DeathRecord = {
    position: { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) },
    timestamp: Date.now(),
    cause,
    dimension,
    recovered: false,
    recoveryAttempts: 0,
  };

  // Add to beginning of array
  deathRecords.unshift(record);

  // Trim to max history
  if (deathRecords.length > MAX_DEATH_HISTORY) {
    deathRecords = deathRecords.slice(0, MAX_DEATH_HISTORY);
  }

  saveToMemory();
  log.info('Death recorded', { position: record.position, cause, dimension });

  return record;
}

/**
 * Get the last death record (if not recovered)
 */
export function getLastDeath(): DeathRecord | null {
  ensureInitialized();

  if (deathRecords.length === 0) {
    return null;
  }

  const last = deathRecords[0];
  if (last.recovered) {
    return null; // Already recovered
  }

  return last;
}

/**
 * Get all death records
 */
export function getDeathHistory(): DeathRecord[] {
  ensureInitialized();
  return [...deathRecords];
}

/**
 * Mark the last death as recovered
 */
export function markRecovered(): boolean {
  ensureInitialized();

  if (deathRecords.length === 0) {
    return false;
  }

  const last = deathRecords[0];
  if (last.recovered) {
    return false;
  }

  last.recovered = true;
  saveToMemory();
  log.info('Death marked as recovered', { position: last.position });

  return true;
}

/**
 * Increment recovery attempts for the last death
 */
export function incrementRecoveryAttempts(): number {
  ensureInitialized();

  if (deathRecords.length === 0) {
    return 0;
  }

  const last = deathRecords[0];
  last.recoveryAttempts++;
  saveToMemory();

  return last.recoveryAttempts;
}

/**
 * Check if items are likely still available (5 minute despawn timer)
 */
export function itemsLikelyAvailable(): { available: boolean; timeRemaining: number } {
  ensureInitialized();

  if (deathRecords.length === 0) {
    return { available: false, timeRemaining: 0 };
  }

  const last = deathRecords[0];
  if (last.recovered) {
    return { available: false, timeRemaining: 0 };
  }

  const DESPAWN_TIME_MS = 5 * 60 * 1000; // 5 minutes
  const elapsed = Date.now() - last.timestamp;
  const remaining = DESPAWN_TIME_MS - elapsed;

  return {
    available: remaining > 0,
    timeRemaining: Math.max(0, remaining),
  };
}

/**
 * Clear all death records
 */
export function clearDeathHistory(): void {
  ensureInitialized();
  deathRecords = [];
  saveToMemory();
  log.info('Death history cleared');
}

/**
 * Get death statistics
 */
export function getDeathStats(): {
  totalDeaths: number;
  recoveredCount: number;
  unrecovedCount: number;
  causeBreakdown: Record<string, number>;
} {
  ensureInitialized();

  const stats = {
    totalDeaths: deathRecords.length,
    recoveredCount: 0,
    unrecovedCount: 0,
    causeBreakdown: {} as Record<string, number>,
  };

  for (const record of deathRecords) {
    if (record.recovered) {
      stats.recoveredCount++;
    } else {
      stats.unrecovedCount++;
    }

    stats.causeBreakdown[record.cause] = (stats.causeBreakdown[record.cause] || 0) + 1;
  }

  return stats;
}
