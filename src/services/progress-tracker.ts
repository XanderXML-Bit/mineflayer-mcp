/**
 * Progress Tracker Service
 *
 * Monitors bot progress during tasks and provides progress-based timeout functionality.
 * Timer only runs when bot is NOT making progress (stalled), resets on progress.
 */

import type { Bot } from 'mineflayer';
import type { ManagedBot } from '../types/bot.js';
import type {
  ProgressState,
  ProgressCheckResult,
  ProgressIndicators,
  TaskType,
  TimestampedPosition,
  ProgressTimeoutConfig,
} from '../types/progress.js';
import { DEFAULT_PROGRESS_CONFIG } from '../types/progress.js';
import { logger } from '../utils/logger.js';
import { EventEmitter } from 'events';

const log = logger.child('progress-tracker');

/** Progress tracker state attached to bot */
export interface ProgressTrackerState {
  currentTask: ProgressState | null;
  trackingInterval: ReturnType<typeof setInterval> | null;
  emitter: EventEmitter;
}

/**
 * Get or initialize progress tracker state on bot
 */
function getTrackerState(bot: Bot): ProgressTrackerState {
  const managed = bot as ManagedBot;
  if (!managed.__progressTracker) {
    managed.__progressTracker = {
      currentTask: null,
      trackingInterval: null,
      emitter: new EventEmitter(),
    };
  }
  return managed.__progressTracker as ProgressTrackerState;
}

/**
 * Calculate hash of inventory for change detection
 */
function hashInventory(bot: Bot): string {
  try {
    const items = bot.inventory.items();
    const sorted = items
      .map((i) => `${i.name}:${i.count}`)
      .sort()
      .join(',');
    return sorted;
  } catch {
    return '';
  }
}

/**
 * Calculate distance between two positions
 */
function distance(a: TimestampedPosition, b: TimestampedPosition): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Create initial progress indicators
 */
function createInitialIndicators(bot: Bot): ProgressIndicators {
  return {
    blocksMinedCount: 0,
    distanceTraveled: 0,
    itemsCollected: 0,
    itemsCrafted: 0,
    damageDealt: 0,
    cropsHarvested: 0,
    lastInventoryHash: hashInventory(bot),
  };
}

/**
 * Start tracking progress for a task
 */
export function startProgressTracking(
  bot: Bot,
  taskType: TaskType,
  config: Partial<ProgressTimeoutConfig> = {}
): void {
  const state = getTrackerState(bot);
  const fullConfig = { ...DEFAULT_PROGRESS_CONFIG, ...config };

  // Stop any existing tracking
  stopProgressTracking(bot);

  const now = Date.now();
  const pos = bot.entity?.position;

  state.currentTask = {
    taskType,
    startedAt: now,
    lastProgressAt: now,
    positions: pos
      ? [{ x: pos.x, y: pos.y, z: pos.z, timestamp: now }]
      : [],
    indicators: createInitialIndicators(bot),
  };

  log.debug('Started progress tracking', { taskType });

  // Set up tracking interval
  state.trackingInterval = setInterval(() => {
    checkAndUpdateProgress(bot, fullConfig);
  }, fullConfig.checkIntervalMs);

  // Set up event listeners for progress indicators
  setupProgressListeners(bot);
}

/**
 * Stop tracking progress
 */
export function stopProgressTracking(bot: Bot): void {
  const state = getTrackerState(bot);

  if (state.trackingInterval) {
    clearInterval(state.trackingInterval);
    state.trackingInterval = null;
  }

  state.currentTask = null;
  cleanupProgressListeners(bot);

  log.debug('Stopped progress tracking');
}

/**
 * Check current progress and update state
 */
function checkAndUpdateProgress(
  bot: Bot,
  config: ProgressTimeoutConfig
): ProgressCheckResult {
  const state = getTrackerState(bot);
  const task = state.currentTask;

  if (!task) {
    return {
      isProgressing: false,
      stallDurationMs: 0,
      indicators: createInitialIndicators(bot),
      reason: 'No active task',
    };
  }

  const now = Date.now();
  const pos = bot.entity?.position;
  let madeProgress = false;
  let reason = '';

  // Check position movement
  if (pos) {
    const currentPos: TimestampedPosition = {
      x: pos.x,
      y: pos.y,
      z: pos.z,
      timestamp: now,
    };

    task.positions.push(currentPos);

    // Keep only recent positions
    if (task.positions.length > config.positionHistorySize) {
      task.positions.shift();
    }

    // Check if moved significantly since last check
    if (task.positions.length >= 2) {
      const prevPos = task.positions[task.positions.length - 2];
      const moved = distance(currentPos, prevPos);

      if (moved > config.movementThreshold) {
        task.indicators.distanceTraveled += moved;
        madeProgress = true;
        reason = `Moved ${moved.toFixed(2)} blocks`;
      }
    }
  }

  // Check inventory changes
  const currentHash = hashInventory(bot);
  if (currentHash !== task.indicators.lastInventoryHash) {
    task.indicators.lastInventoryHash = currentHash;
    madeProgress = true;
    reason = reason || 'Inventory changed';
  }

  // Update progress timestamp if progress was made
  if (madeProgress) {
    task.lastProgressAt = now;
  }

  const stallDurationMs = now - task.lastProgressAt;

  // Emit stalled event if stall timeout exceeded
  if (stallDurationMs >= config.stallTimeoutMs) {
    state.emitter.emit('stalled', {
      taskType: task.taskType,
      stallDurationMs,
      indicators: task.indicators,
    });
  }

  return {
    isProgressing: madeProgress,
    stallDurationMs,
    indicators: { ...task.indicators },
    reason,
  };
}

/**
 * Get current progress status
 */
export function getProgressStatus(bot: Bot): ProgressCheckResult | null {
  const state = getTrackerState(bot);
  const task = state.currentTask;

  if (!task) return null;

  const now = Date.now();
  const stallDurationMs = now - task.lastProgressAt;

  return {
    isProgressing: stallDurationMs < 2000, // Considered progressing if stalled < 2s
    stallDurationMs,
    indicators: { ...task.indicators },
  };
}

/**
 * Manually record progress (for task-specific progress indicators)
 */
export function recordProgress(
  bot: Bot,
  type: 'blockMined' | 'itemCollected' | 'itemCrafted' | 'damageDealt' | 'cropHarvested'
): void {
  const state = getTrackerState(bot);
  const task = state.currentTask;

  if (!task) return;

  task.lastProgressAt = Date.now();

  switch (type) {
    case 'blockMined':
      task.indicators.blocksMinedCount++;
      break;
    case 'itemCollected':
      task.indicators.itemsCollected++;
      break;
    case 'itemCrafted':
      task.indicators.itemsCrafted++;
      break;
    case 'damageDealt':
      task.indicators.damageDealt++;
      break;
    case 'cropHarvested':
      task.indicators.cropsHarvested++;
      break;
  }
}

/**
 * Subscribe to stalled event
 */
export function onStalled(
  bot: Bot,
  callback: (data: { taskType: TaskType; stallDurationMs: number; indicators: ProgressIndicators }) => void
): () => void {
  const state = getTrackerState(bot);
  state.emitter.on('stalled', callback);

  return () => {
    state.emitter.removeListener('stalled', callback);
  };
}

/**
 * Set up event listeners for automatic progress tracking
 */
function setupProgressListeners(bot: Bot): void {
  const managed = bot as ManagedBot;

  // Track block mining
  const onDiggingCompleted = () => {
    recordProgress(bot, 'blockMined');
  };

  // Track item collection
  const onPlayerCollect = () => {
    recordProgress(bot, 'itemCollected');
  };

  bot.on('diggingCompleted', onDiggingCompleted);
  bot.on('playerCollect', onPlayerCollect);

  // Store listeners for cleanup
  managed.__progressListeners = {
    diggingCompleted: onDiggingCompleted,
    playerCollect: onPlayerCollect,
  };
}

/**
 * Clean up progress listeners
 */
function cleanupProgressListeners(bot: Bot): void {
  const managed = bot as ManagedBot;

  if (managed.__progressListeners) {
    const listeners = managed.__progressListeners;

    if (listeners.diggingCompleted) {
      bot.removeListener('diggingCompleted', listeners.diggingCompleted);
    }
    if (listeners.playerCollect) {
      bot.removeListener('playerCollect', listeners.playerCollect);
    }

    managed.__progressListeners = undefined;
  }
}

/**
 * Create a progress-based timeout promise
 *
 * Unlike fixed timeouts, this only times out when the bot is NOT making progress.
 * The timer pauses/resets whenever progress is detected.
 */
export function createProgressTimeout(
  bot: Bot,
  taskType: TaskType,
  stallTimeoutMs: number = DEFAULT_PROGRESS_CONFIG.stallTimeoutMs
): {
  promise: Promise<never>;
  cancel: () => void;
  getStatus: () => ProgressCheckResult | null;
} {
  let cancelled = false;
  let _rejectFn: (error: Error) => void;

  const config: ProgressTimeoutConfig = {
    ...DEFAULT_PROGRESS_CONFIG,
    stallTimeoutMs,
  };

  // Start tracking
  startProgressTracking(bot, taskType, config);

  const promise = new Promise<never>((_, reject) => {
    _rejectFn = reject;

    const unsubscribe = onStalled(bot, ({ stallDurationMs }) => {
      if (cancelled) return;

      if (stallDurationMs >= stallTimeoutMs) {
        unsubscribe();
        stopProgressTracking(bot);
        reject(new Error(`Task stalled: no progress for ${Math.round(stallDurationMs / 1000)}s`));
      }
    });
  });

  return {
    promise,
    cancel: () => {
      cancelled = true;
      stopProgressTracking(bot);
    },
    getStatus: () => getProgressStatus(bot),
  };
}

/**
 * Execute a task with progress-based timeout
 *
 * The timeout only triggers when the bot is NOT making progress.
 */
export async function withProgressTimeout<T>(
  bot: Bot,
  taskType: TaskType,
  fn: () => Promise<T>,
  stallTimeoutMs: number = DEFAULT_PROGRESS_CONFIG.stallTimeoutMs
): Promise<T> {
  const timeout = createProgressTimeout(bot, taskType, stallTimeoutMs);

  try {
    const result = await Promise.race([fn(), timeout.promise]);
    timeout.cancel();
    return result as T;
  } catch (error) {
    timeout.cancel();
    throw error;
  }
}
