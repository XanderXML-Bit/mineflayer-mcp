/**
 * MLG Water Bucket Service
 *
 * Automatically saves the bot from fall damage by placing a water bucket
 * just before hitting the ground. The classic "MLG water" technique.
 *
 * How it works:
 * 1. Monitors bot's velocity and position during falls
 * 2. Predicts ground impact time
 * 3. Places water bucket at the right moment
 * 4. Picks up the water after landing
 *
 * Requirements:
 * - Water bucket in inventory
 * - Not in the Nether (water evaporates)
 * - Solid block below to place water on
 */

import type { Bot } from 'mineflayer';
import type { Item } from 'prismarine-item';
import { Vec3 } from 'vec3';
import type { ManagedBot } from '../types/bot.js';
import { logger } from '../utils/logger.js';
import { pushEvent } from './event.service.js';

const log = logger.child('mlg-water');

/** Bot with MLG state - uses ManagedBot directly since it already has __mlgState */
type BotWithMLGState = ManagedBot;

/** Bot with game dimension property */
interface BotWithGame {
  game?: { dimension?: string };
}

/** Entity with isInWater property */
interface EntityWithWaterState {
  isInWater?: boolean;
}

/** MLG Water configuration */
export interface MLGWaterConfig {
  /** Whether MLG water is enabled */
  enabled: boolean;
  /** Minimum fall distance to trigger MLG (blocks) */
  minFallDistance: number;
  /** Height above ground to place water (blocks) */
  placeHeight: number;
  /** Time to wait before picking up water (ms) */
  pickupDelayMs: number;
  /** Whether to auto-pickup water after landing */
  autoPickup: boolean;
}

/** Default configuration */
export const DEFAULT_MLG_CONFIG: MLGWaterConfig = {
  enabled: true,
  minFallDistance: 4, // Only trigger for falls that would cause damage
  placeHeight: 2, // Place water when 2 blocks from ground
  pickupDelayMs: 500, // Wait 500ms after landing to pick up
  autoPickup: true,
};

/** MLG state */
interface MLGState {
  config: MLGWaterConfig;
  checkInterval?: ReturnType<typeof setInterval>;
  isFalling: boolean;
  fallStartY: number;
  lastWaterPos: Vec3 | null;
  isPerformingMLG: boolean;
  previousY: number;
  previousVelocityY: number;
  /** Pending pickup timeout */
  pickupTimeout?: ReturnType<typeof setTimeout>;
}

/** Get or create MLG state for a bot */
function getMLGState(bot: Bot): MLGState {
  const managed = bot as BotWithMLGState;
  if (!managed.__mlgState) {
    managed.__mlgState = {
      config: { ...DEFAULT_MLG_CONFIG },
      isFalling: false,
      fallStartY: 0,
      lastWaterPos: null,
      isPerformingMLG: false,
      previousY: 0,
      previousVelocityY: 0,
    };
  }
  return managed.__mlgState;
}

/**
 * Check if we're in the Nether (water evaporates)
 */
function isInNether(bot: Bot): boolean {
  const botWithGame = bot as unknown as BotWithGame;
  const dim = botWithGame.game?.dimension || 'overworld';
  return dim.includes('nether');
}

/**
 * Find water bucket in inventory
 */
function findWaterBucket(bot: Bot): Item | null {
  return bot.inventory.items().find((item) => item.name === 'water_bucket') || null;
}

/**
 * Find empty bucket in inventory (for picking up water)
 */
function findEmptyBucket(bot: Bot): Item | null {
  return bot.inventory.items().find((item) => item.name === 'bucket') || null;
}

/**
 * Get the ground level directly below the bot
 */
function getGroundLevel(bot: Bot): number | null {
  if (!bot.entity?.position) return null;

  const pos = bot.entity.position.clone();

  // Scan downward to find solid ground
  for (let y = Math.floor(pos.y) - 1; y >= pos.y - 100 && y >= -64; y--) {
    const block = bot.blockAt(new Vec3(Math.floor(pos.x), y, Math.floor(pos.z)));
    if (block && block.boundingBox !== 'empty' && !block.name.includes('water')) {
      return y + 1; // Return the Y level above the solid block
    }
  }

  return null;
}

/**
 * Check if there's a valid block to place water on
 */
function canPlaceWaterBelow(bot: Bot): { canPlace: boolean; targetPos?: Vec3 } {
  if (!bot.entity?.position) return { canPlace: false };

  const groundLevel = getGroundLevel(bot);
  if (groundLevel === null) return { canPlace: false };

  // Check if there's a solid block to place water on
  const groundBlock = bot.blockAt(new Vec3(
    Math.floor(bot.entity.position.x),
    groundLevel - 1,
    Math.floor(bot.entity.position.z)
  ));

  if (!groundBlock || groundBlock.boundingBox === 'empty') {
    return { canPlace: false };
  }

  return {
    canPlace: true,
    targetPos: new Vec3(
      Math.floor(bot.entity.position.x),
      groundLevel,
      Math.floor(bot.entity.position.z)
    ),
  };
}

/**
 * Perform the MLG water bucket place
 */
async function performMLG(bot: Bot): Promise<boolean> {
  const state = getMLGState(bot);

  if (state.isPerformingMLG) return false;
  state.isPerformingMLG = true;

  try {
    // Find water bucket
    const waterBucket = findWaterBucket(bot);
    if (!waterBucket) {
      log.debug('No water bucket available for MLG');
      return false;
    }

    // Check if we can place water
    const placeCheck = canPlaceWaterBelow(bot);
    if (!placeCheck.canPlace || !placeCheck.targetPos) {
      log.debug('Cannot place water below');
      return false;
    }

    // Equip water bucket
    await bot.equip(waterBucket, 'hand');

    // Look straight down
    await bot.look(bot.entity.yaw, Math.PI / 2, true);

    // Get the block to place water on
    const groundBlock = bot.blockAt(new Vec3(
      placeCheck.targetPos.x,
      placeCheck.targetPos.y - 1,
      placeCheck.targetPos.z
    ));

    if (!groundBlock) {
      return false;
    }

    // Place water
    try {
      await bot.activateBlock(groundBlock);
      state.lastWaterPos = placeCheck.targetPos.clone();

      pushEvent(bot, 'tool_switched', {
        action: 'mlg_water_placed',
        position: { x: placeCheck.targetPos.x, y: placeCheck.targetPos.y, z: placeCheck.targetPos.z },
        fallDistance: state.fallStartY - bot.entity.position.y,
      });

      log.info('MLG water placed!', {
        fallDistance: Math.round(state.fallStartY - bot.entity.position.y),
      });

      // Schedule water pickup (tracked for cleanup)
      if (state.config.autoPickup) {
        // Clear any pending pickup timeout
        if (state.pickupTimeout) {
          clearTimeout(state.pickupTimeout);
        }
        state.pickupTimeout = setTimeout(() => {
          pickupWater(bot).catch(() => {});
          state.pickupTimeout = undefined;
        }, state.config.pickupDelayMs);
      }

      return true;
    } catch (err) {
      log.debug('Failed to place water', { error: err });
      return false;
    }
  } catch (error) {
    log.debug('MLG failed', { error });
    return false;
  } finally {
    state.isPerformingMLG = false;
    state.isFalling = false;
  }
}

/**
 * Pick up the placed water
 */
async function pickupWater(bot: Bot): Promise<boolean> {
  const state = getMLGState(bot);

  if (!state.lastWaterPos) return false;

  try {
    // Find empty bucket
    const bucket = findEmptyBucket(bot);
    if (!bucket) {
      log.debug('No empty bucket to pick up water');
      return false;
    }

    // Equip bucket
    await bot.equip(bucket, 'hand');

    // Look at water
    await bot.lookAt(state.lastWaterPos);

    // Get water block
    const waterBlock = bot.blockAt(state.lastWaterPos);
    if (!waterBlock || !waterBlock.name.includes('water')) {
      log.debug('Water not found at expected position');
      return false;
    }

    // Pick up water
    await bot.activateBlock(waterBlock);

    log.debug('Water picked up');
    state.lastWaterPos = null;

    return true;
  } catch (error) {
    log.debug('Failed to pick up water', { error });
    return false;
  }
}

/**
 * Main check - called every tick
 */
function checkFallState(bot: Bot): void {
  const state = getMLGState(bot);

  if (!state.config.enabled) return;
  if (state.isPerformingMLG) return;
  if (!bot.entity?.position) return;
  if (isInNether(bot)) return; // Water evaporates in Nether
  if ((bot.entity as EntityWithWaterState).isInWater) return; // Already in water

  const currentY = bot.entity.position.y;
  const velocityY = bot.entity.velocity?.y ?? 0;

  // Detect start of fall
  if (!state.isFalling && velocityY < -0.5 && !bot.entity.onGround) {
    state.isFalling = true;
    state.fallStartY = currentY;
    log.debug('Fall detected', { startY: state.fallStartY, velocityY });
  }

  // Check if we should perform MLG
  if (state.isFalling && velocityY < -0.5) {
    const groundLevel = getGroundLevel(bot);
    if (groundLevel !== null) {
      const distanceToGround = currentY - groundLevel;
      const fallDistance = state.fallStartY - currentY;

      // Check if we have a water bucket
      const hasWaterBucket = findWaterBucket(bot) !== null;

      // Perform MLG if:
      // 1. We're close enough to the ground
      // 2. Fall distance is significant
      // 3. We have a water bucket
      if (
        hasWaterBucket &&
        distanceToGround <= state.config.placeHeight &&
        distanceToGround > 0 &&
        fallDistance >= state.config.minFallDistance
      ) {
        performMLG(bot).catch(() => {});
      }
    }
  }

  // Reset falling state if on ground
  if (bot.entity.onGround && state.isFalling) {
    state.isFalling = false;
    state.fallStartY = 0;
  }

  state.previousY = currentY;
  state.previousVelocityY = velocityY;
}

/**
 * Initialize MLG water service
 */
export function initializeMLGWater(bot: Bot, config?: Partial<MLGWaterConfig>): void {
  const state = getMLGState(bot);

  if (config) {
    state.config = { ...state.config, ...config };
  }

  // Clean up existing interval
  if (state.checkInterval) {
    clearInterval(state.checkInterval);
    state.checkInterval = undefined;
  }

  if (!state.config.enabled) {
    log.debug('MLG water disabled', { username: bot.username });
    return;
  }

  // Check every tick (50ms)
  state.checkInterval = setInterval(() => {
    checkFallState(bot);
  }, 50);

  log.info('MLG water service initialized', { username: bot.username });
}

/**
 * Enable or disable MLG water
 */
export function setMLGWaterEnabled(bot: Bot, enabled: boolean): void {
  const state = getMLGState(bot);
  state.config.enabled = enabled;
  initializeMLGWater(bot, state.config);
  log.info('MLG water toggled', { username: bot.username, enabled });
}

/**
 * Configure MLG water
 */
export function configureMLGWater(bot: Bot, config: Partial<MLGWaterConfig>): void {
  const state = getMLGState(bot);
  state.config = { ...state.config, ...config };

  if (state.config.enabled) {
    initializeMLGWater(bot, state.config);
  }

  log.debug('MLG water configured', { config: state.config });
}

/**
 * Get MLG water status
 */
export function getMLGWaterStatus(bot: Bot): {
  enabled: boolean;
  config: MLGWaterConfig;
  isFalling: boolean;
  fallDistance: number;
  hasWaterBucket: boolean;
  canPerformMLG: boolean;
  isInNether: boolean;
} {
  const state = getMLGState(bot);
  const hasWaterBucket = findWaterBucket(bot) !== null;
  const fallDistance = state.isFalling ? state.fallStartY - (bot.entity?.position?.y ?? 0) : 0;
  const placeCheck = canPlaceWaterBelow(bot);

  return {
    enabled: state.config.enabled,
    config: state.config,
    isFalling: state.isFalling,
    fallDistance: Math.max(0, fallDistance),
    hasWaterBucket,
    canPerformMLG: hasWaterBucket && placeCheck.canPlace && !isInNether(bot),
    isInNether: isInNether(bot),
  };
}

/**
 * Force MLG now (manual trigger)
 */
export async function performMLGNow(bot: Bot): Promise<boolean> {
  const state = getMLGState(bot);
  state.fallStartY = bot.entity?.position?.y ?? 0;
  return performMLG(bot);
}

/**
 * Clean up MLG water service
 */
export function cleanupMLGWater(bot: Bot): void {
  const managed = bot as BotWithMLGState;
  const state = managed.__mlgState;

  if (!state) return;

  // Clear check interval
  if (state.checkInterval) {
    clearInterval(state.checkInterval);
    state.checkInterval = undefined;
  }

  // Clear pending pickup timeout
  if (state.pickupTimeout) {
    clearTimeout(state.pickupTimeout);
    state.pickupTimeout = undefined;
  }

  log.debug('MLG water service cleaned up', { username: bot.username });
}
