/**
 * Elytra Flight Service
 *
 * Manages elytra flying mechanics:
 * - Starting flight (jump while falling)
 * - Gliding navigation
 * - Firework rocket boosts
 * - Safe landing
 * - Flight path planning
 *
 * Elytra mechanics:
 * - Must be equipped in chestplate slot
 * - Activate by pressing jump while falling
 * - Look direction controls flight direction
 * - Looking down = speed up + lose altitude
 * - Looking up = slow down + gain altitude (temporarily)
 * - Fireworks provide forward thrust
 * - Durability decreases per second of flight
 */

import type { Bot } from 'mineflayer';
import type { Item } from 'prismarine-item';
import { Vec3 } from 'vec3';
import type { ManagedBot } from '../types/bot.js';
import { logger } from '../utils/logger.js';
import { pushEvent } from './event.service.js';

const log = logger.child('elytra-service');

/** Bot with elytra state - uses ManagedBot directly since it already has __elytraState */
type BotWithElytraState = ManagedBot;

/** Item with optional durability property */
type ItemWithDurability = Item & {
  durabilityUsed?: number;
};

/** Entity with elytra flying property */
interface EntityWithElytraFlying {
  elytraFlying?: boolean;
}

/** Elytra flight configuration */
export interface ElytraConfig {
  /** Whether elytra features are enabled */
  enabled: boolean;
  /** Minimum altitude to maintain during flight */
  minAltitude: number;
  /** Maximum altitude for flight */
  maxAltitude: number;
  /** Firework boost interval (ms) */
  boostIntervalMs: number;
  /** Auto-boost when losing altitude */
  autoBoost: boolean;
  /** Landing approach distance */
  landingApproachDistance: number;
  /** Minimum durability before landing */
  minDurabilityPercent: number;
}

/** Default configuration */
export const DEFAULT_ELYTRA_CONFIG: ElytraConfig = {
  enabled: true,
  minAltitude: 20,
  maxAltitude: 200,
  boostIntervalMs: 3000,
  autoBoost: true,
  landingApproachDistance: 50,
  minDurabilityPercent: 10,
};

/** Flight state */
interface ElytraState {
  config: ElytraConfig;
  isFlying: boolean;
  isLanding: boolean;
  flightStartTime: number;
  flightStartPos: Vec3 | null;
  targetPos: Vec3 | null;
  lastBoostTime: number;
  boostCount: number;
}

/** Get or create elytra state */
function getElytraState(bot: Bot): ElytraState {
  const managed = bot as BotWithElytraState;
  if (!managed.__elytraState) {
    managed.__elytraState = {
      config: { ...DEFAULT_ELYTRA_CONFIG },
      isFlying: false,
      isLanding: false,
      flightStartTime: 0,
      flightStartPos: null,
      targetPos: null,
      lastBoostTime: 0,
      boostCount: 0,
    };
  }
  return managed.__elytraState;
}

/**
 * Find elytra in inventory or equipped
 */
export function findElytra(bot: Bot): { item: Item; location: 'inventory' | 'chest' } | null {
  // Check chest slot first (slot 6 is chestplate)
  const chestSlot = bot.inventory.slots[6];
  if (chestSlot?.name === 'elytra') {
    return { item: chestSlot, location: 'chest' };
  }

  // Check inventory
  const inventoryElytra = bot.inventory.items().find((item) => item.name === 'elytra');
  if (inventoryElytra) {
    return { item: inventoryElytra, location: 'inventory' };
  }

  return null;
}

/**
 * Check if elytra is equipped
 */
export function isElytraEquipped(bot: Bot): boolean {
  const chestSlot = bot.inventory.slots[6];
  return chestSlot?.name === 'elytra';
}

/**
 * Get elytra durability
 */
export function getElytraDurability(bot: Bot): { current: number; max: number; percent: number } | null {
  const elytra = findElytra(bot);
  if (!elytra) return null;

  const maxDurability = 432; // Elytra max durability
  const damage = (elytra.item as ItemWithDurability).durabilityUsed || 0;
  const current = maxDurability - damage;
  const percent = (current / maxDurability) * 100;

  return { current, max: maxDurability, percent };
}

/**
 * Find firework rockets in inventory
 */
export function findFireworks(bot: Bot): Item[] {
  return bot.inventory.items().filter((item) => item.name === 'firework_rocket');
}

/**
 * Equip elytra to chest slot
 */
export async function equipElytra(bot: Bot): Promise<boolean> {
  if (isElytraEquipped(bot)) return true;

  const elytra = findElytra(bot);
  if (!elytra || elytra.location === 'chest') return false;

  try {
    await bot.equip(elytra.item, 'torso');
    log.debug('Elytra equipped');
    return true;
  } catch (error) {
    log.debug('Failed to equip elytra', { error });
    return false;
  }
}

/**
 * Check if currently flying with elytra
 */
export function isElytraFlying(bot: Bot): boolean {
  return (bot.entity as EntityWithElytraFlying)?.elytraFlying === true;
}

/**
 * Start elytra flight
 */
export async function startFlight(bot: Bot): Promise<{ success: boolean; reason?: string }> {
  const state = getElytraState(bot);

  if (state.isFlying || isElytraFlying(bot)) {
    return { success: true }; // Already flying
  }

  // Equip elytra if not equipped
  if (!isElytraEquipped(bot)) {
    const equipped = await equipElytra(bot);
    if (!equipped) {
      return { success: false, reason: 'no_elytra' };
    }
  }

  // Check durability
  const durability = getElytraDurability(bot);
  if (durability && durability.percent < state.config.minDurabilityPercent) {
    return { success: false, reason: 'low_durability' };
  }

  // Need to be falling to start flight
  if (bot.entity.onGround) {
    // Jump first
    bot.setControlState('jump', true);
    await new Promise((r) => setTimeout(r, 100));
    bot.setControlState('jump', false);
    await new Promise((r) => setTimeout(r, 200));
  }

  // Check if in air
  if (bot.entity.onGround) {
    return { success: false, reason: 'not_airborne' };
  }

  // Activate elytra (press jump while falling)
  bot.setControlState('jump', true);
  await new Promise((r) => setTimeout(r, 50));
  bot.setControlState('jump', false);

  // Wait a moment and check if flying
  await new Promise((r) => setTimeout(r, 200));

  if (isElytraFlying(bot)) {
    state.isFlying = true;
    state.flightStartTime = Date.now();
    state.flightStartPos = bot.entity.position.clone();
    state.boostCount = 0;

    pushEvent(bot, 'tool_switched', {
      action: 'elytra_flight_started',
      position: {
        x: bot.entity.position.x,
        y: bot.entity.position.y,
        z: bot.entity.position.z,
      },
    });

    log.info('Elytra flight started');
    return { success: true };
  }

  return { success: false, reason: 'flight_not_activated' };
}

/**
 * Use firework rocket for boost
 */
export async function useFireworkBoost(bot: Bot): Promise<boolean> {
  const state = getElytraState(bot);

  if (!isElytraFlying(bot)) return false;

  const fireworks = findFireworks(bot);
  if (fireworks.length === 0) {
    log.debug('No firework rockets available');
    return false;
  }

  try {
    // Equip firework to offhand or hand
    await bot.equip(fireworks[0], 'hand');

    // Use firework
    bot.activateItem(false);

    state.lastBoostTime = Date.now();
    state.boostCount++;

    log.debug('Firework boost used', { boostCount: state.boostCount });
    return true;
  } catch (error) {
    log.debug('Failed to use firework', { error });
    return false;
  }
}

/**
 * Control flight direction
 */
export async function setFlightDirection(
  bot: Bot,
  target: Vec3 | { x: number; y: number; z: number }
): Promise<void> {
  if (!isElytraFlying(bot)) return;

  const targetVec = target instanceof Vec3 ? target : new Vec3(target.x, target.y, target.z);
  const direction = targetVec.minus(bot.entity.position).normalize();

  const yaw = Math.atan2(-direction.x, direction.z);
  const horizontalDist = Math.sqrt(direction.x * direction.x + direction.z * direction.z);
  let pitch = -Math.atan2(direction.y, horizontalDist);

  // Clamp pitch to prevent stalling or diving too steep
  pitch = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, pitch));

  await bot.look(yaw, pitch, true);
}

/**
 * Land safely
 */
export async function landSafely(bot: Bot): Promise<{ success: boolean; reason?: string }> {
  const state = getElytraState(bot);

  if (!isElytraFlying(bot)) {
    return { success: true }; // Not flying
  }

  state.isLanding = true;

  try {
    // Find ground level
    const groundLevel = findGroundLevel(bot);
    if (groundLevel === null) {
      return { success: false, reason: 'no_ground_found' };
    }

    const altitude = bot.entity.position.y - groundLevel;

    // Gradually descend
    while (isElytraFlying(bot) && altitude > 3) {
      // Look slightly down to descend
      const currentYaw = bot.entity.yaw;
      await bot.look(currentYaw, 0.3, true); // Slight downward pitch

      await new Promise((r) => setTimeout(r, 100));

      // Check altitude
      const newGroundLevel = findGroundLevel(bot);
      if (newGroundLevel !== null) {
        const newAltitude = bot.entity.position.y - newGroundLevel;
        if (newAltitude <= 3) break;
      }
    }

    // Final approach - level out
    await bot.look(bot.entity.yaw, 0, true);

    // Wait for landing
    const landStart = Date.now();
    while (!bot.entity.onGround && Date.now() - landStart < 10000) {
      await new Promise((r) => setTimeout(r, 100));
    }

    state.isFlying = false;
    state.isLanding = false;

    if (bot.entity.onGround) {
      pushEvent(bot, 'tool_switched', {
        action: 'elytra_landed',
        flightDuration: Date.now() - state.flightStartTime,
        boostsUsed: state.boostCount,
      });

      log.info('Landed safely', {
        flightDuration: Math.round((Date.now() - state.flightStartTime) / 1000),
        boostsUsed: state.boostCount,
      });

      return { success: true };
    }

    return { success: false, reason: 'landing_timeout' };
  } catch (error) {
    state.isLanding = false;
    log.debug('Landing failed', { error });
    return { success: false, reason: 'landing_error' };
  }
}

/**
 * Find ground level below bot
 */
function findGroundLevel(bot: Bot): number | null {
  if (!bot.entity?.position) return null;

  const pos = bot.entity.position;
  for (let y = Math.floor(pos.y) - 1; y >= pos.y - 256 && y >= -64; y--) {
    const block = bot.blockAt(new Vec3(Math.floor(pos.x), y, Math.floor(pos.z)));
    if (block && block.boundingBox !== 'empty' && !block.name.includes('water')) {
      return y + 1;
    }
  }
  return null;
}

/**
 * Fly to a target position
 */
export async function flyTo(
  bot: Bot,
  target: Vec3 | { x: number; y: number; z: number },
  options: { landOnArrival?: boolean } = {}
): Promise<{ success: boolean; arrived: boolean; reason?: string }> {
  const state = getElytraState(bot);
  const targetVec = target instanceof Vec3 ? target : new Vec3(target.x, target.y, target.z);

  // Start flight if not flying
  if (!isElytraFlying(bot)) {
    const startResult = await startFlight(bot);
    if (!startResult.success) {
      return { success: false, arrived: false, reason: startResult.reason };
    }
  }

  state.targetPos = targetVec;

  // Flight loop
  const flightStart = Date.now();
  const maxFlightTime = 5 * 60 * 1000; // 5 minutes max

  while (isElytraFlying(bot) && Date.now() - flightStart < maxFlightTime) {
    const _distance = bot.entity.position.distanceTo(targetVec);
    const horizontalDistance = new Vec3(
      targetVec.x - bot.entity.position.x,
      0,
      targetVec.z - bot.entity.position.z
    ).distanceTo(new Vec3(0, 0, 0));

    // Check if arrived (horizontal distance)
    if (horizontalDistance < state.config.landingApproachDistance) {
      if (options.landOnArrival !== false) {
        await landSafely(bot);
      }
      return { success: true, arrived: true };
    }

    // Set flight direction
    await setFlightDirection(bot, targetVec);

    // Auto-boost if losing altitude
    const groundLevel = findGroundLevel(bot);
    if (groundLevel !== null) {
      const altitude = bot.entity.position.y - groundLevel;

      if (state.config.autoBoost && altitude < state.config.minAltitude) {
        const timeSinceBoost = Date.now() - state.lastBoostTime;
        if (timeSinceBoost > state.config.boostIntervalMs) {
          await useFireworkBoost(bot);
        }
      }
    }

    // Check durability
    const durability = getElytraDurability(bot);
    if (durability && durability.percent < state.config.minDurabilityPercent) {
      log.warn('Low elytra durability, landing');
      await landSafely(bot);
      return { success: false, arrived: false, reason: 'low_durability' };
    }

    await new Promise((r) => setTimeout(r, 100));
  }

  // Timeout or no longer flying
  if (isElytraFlying(bot)) {
    await landSafely(bot);
  }

  return { success: false, arrived: false, reason: 'flight_timeout' };
}

/**
 * Get elytra flight status
 */
export function getElytraStatus(bot: Bot): {
  enabled: boolean;
  config: ElytraConfig;
  hasElytra: boolean;
  isEquipped: boolean;
  isFlying: boolean;
  isLanding: boolean;
  durability: { current: number; max: number; percent: number } | null;
  fireworkCount: number;
  altitude: number;
  flightDuration: number;
  boostCount: number;
} {
  const state = getElytraState(bot);
  const groundLevel = findGroundLevel(bot);
  const altitude = groundLevel !== null ? bot.entity.position.y - groundLevel : -1;

  return {
    enabled: state.config.enabled,
    config: state.config,
    hasElytra: findElytra(bot) !== null,
    isEquipped: isElytraEquipped(bot),
    isFlying: isElytraFlying(bot),
    isLanding: state.isLanding,
    durability: getElytraDurability(bot),
    fireworkCount: findFireworks(bot).reduce((sum, f) => sum + f.count, 0),
    altitude: Math.round(altitude),
    flightDuration: state.isFlying ? Date.now() - state.flightStartTime : 0,
    boostCount: state.boostCount,
  };
}

/**
 * Configure elytra service
 */
export function configureElytraService(bot: Bot, config: Partial<ElytraConfig>): void {
  const state = getElytraState(bot);
  state.config = { ...state.config, ...config };
  log.debug('Elytra service configured', { config: state.config });
}

/**
 * Initialize elytra service
 */
export function initializeElytraService(bot: Bot, config?: Partial<ElytraConfig>): void {
  const state = getElytraState(bot);

  if (config) {
    state.config = { ...state.config, ...config };
  }

  log.info('Elytra service initialized', { username: bot.username });
}

/**
 * Clean up elytra service
 */
export function cleanupElytraService(bot: Bot): void {
  const managed = bot as BotWithElytraState;
  const state = managed.__elytraState;

  if (!state) return;

  // Reset flight state
  state.isFlying = false;
  state.isLanding = false;
  state.targetPos = null;

  log.debug('Elytra service cleaned up', { username: bot.username });
}
