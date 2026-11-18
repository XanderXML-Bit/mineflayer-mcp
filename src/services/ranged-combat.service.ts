/**
 * Ranged Combat Service
 *
 * Modern implementation for bow/crossbow aiming and trajectory calculation.
 * Calculates projectile trajectories accounting for gravity and drag.
 * Provides auto-aim functionality for ranged combat.
 */

import type { Bot } from 'mineflayer';
import type { Entity } from 'prismarine-entity';
import type { Item } from 'prismarine-item';
import type { Vec3 } from 'vec3';
import { logger } from '../utils/logger.js';
import { pushEvent } from './event.service.js';

const log = logger.child('ranged-combat');

/** Projectile physics constants (Minecraft values) */
const PHYSICS = {
  /** Arrow initial velocity (blocks/tick) */
  ARROW_VELOCITY: 3.0,
  /** Gravity acceleration (blocks/tick^2) */
  GRAVITY: 0.05,
  /** Air drag coefficient per tick */
  DRAG: 0.99,
  /** Ticks per second */
  TICKS_PER_SECOND: 20,
  /** Maximum simulation ticks */
  MAX_SIMULATION_TICKS: 200,
};

/** Weapon charge times in milliseconds */
const CHARGE_TIMES = {
  bow: {
    min: 200,
    optimal: 1000, // Full charge
    max: 1200,
  },
  crossbow: {
    base: 1250, // Base crossbow load time
    quickCharge1: 1000, // -0.25 seconds per level
    quickCharge2: 750,
    quickCharge3: 500,
  },
};

/** Crossbow enchantment info */
interface CrossbowEnchantments {
  multishot: boolean;
  piercing: number; // 0-4
  quickCharge: number; // 0-3
  unbreaking: number;
  mending: boolean;
}

/** Arrow types for crossbow loading */
type ArrowType = 'arrow' | 'spectral_arrow' | 'tipped_arrow' | 'firework_rocket';

/** Ranged combat configuration */
export interface RangedCombatConfig {
  /** Whether ranged combat is enabled */
  enabled: boolean;
  /** Lead target based on velocity */
  leadTarget: boolean;
  /** Maximum engagement range */
  maxRange: number;
  /** Minimum engagement range (use melee below this) */
  minRange: number;
  /** Number of trajectory iterations for accuracy */
  trajectoryIterations: number;
}

/** Default configuration */
export const DEFAULT_RANGED_CONFIG: RangedCombatConfig = {
  enabled: true,
  leadTarget: true,
  maxRange: 64,
  minRange: 8,
  trajectoryIterations: 20,
};

/** Stored config per bot */
const botConfigs = new WeakMap<Bot, RangedCombatConfig>();

/** Active shot states per bot */
const activeShots = new WeakMap<Bot, { target: Entity; startTime: number }>();

/**
 * Get config for a bot
 */
function getConfig(bot: Bot): RangedCombatConfig {
  if (!botConfigs.has(bot)) {
    botConfigs.set(bot, { ...DEFAULT_RANGED_CONFIG });
  }
  const config = botConfigs.get(bot);
  return config ?? { ...DEFAULT_RANGED_CONFIG };
}

/**
 * Calculate the pitch angle needed to hit a target at a given distance and height difference
 * Uses iterative trajectory simulation for accuracy
 */
function calculatePitch(
  horizontalDistance: number,
  heightDifference: number,
  velocity: number,
  iterations: number
): number {
  // Start with a rough estimate using simple projectile motion
  // h = v*t*sin(theta) - 0.5*g*t^2
  // d = v*t*cos(theta)

  let bestPitch = 0;
  let bestError = Infinity;

  // Search through pitch angles
  for (let pitch = -90; pitch <= 90; pitch += 180 / iterations) {
    const pitchRad = (pitch * Math.PI) / 180;

    // Simulate trajectory
    let x = 0;
    let y = 0;
    let vx = velocity * Math.cos(pitchRad);
    let vy = velocity * Math.sin(pitchRad);

    for (let tick = 0; tick < PHYSICS.MAX_SIMULATION_TICKS; tick++) {
      // Apply physics
      vy -= PHYSICS.GRAVITY;
      vx *= PHYSICS.DRAG;
      vy *= PHYSICS.DRAG;

      x += vx;
      y += vy;

      // Check if we've reached the target horizontal distance
      if (x >= horizontalDistance) {
        const error = Math.abs(y - heightDifference);
        if (error < bestError) {
          bestError = error;
          bestPitch = pitch;
        }
        break;
      }

      // Gone too far down
      if (y < heightDifference - 50) break;
    }
  }

  return bestPitch;
}

/**
 * Calculate yaw angle to face a target position
 */
function calculateYaw(bot: Bot, targetPos: Vec3): number {
  const dx = targetPos.x - bot.entity.position.x;
  const dz = targetPos.z - bot.entity.position.z;
  return Math.atan2(-dx, dz);
}

/**
 * Predict target position based on velocity
 */
function predictTargetPosition(
  target: Entity,
  flightTime: number
): Vec3 {
  const pos = target.position.clone();
  const vel = target.velocity;

  if (vel) {
    pos.x += vel.x * flightTime * PHYSICS.TICKS_PER_SECOND;
    pos.y += vel.y * flightTime * PHYSICS.TICKS_PER_SECOND;
    pos.z += vel.z * flightTime * PHYSICS.TICKS_PER_SECOND;
  }

  return pos;
}

/**
 * Estimate flight time to target (rough approximation)
 */
function estimateFlightTime(distance: number): number {
  // Rough estimate: time = distance / average_velocity
  // Average velocity accounting for drag
  const avgVelocity = PHYSICS.ARROW_VELOCITY * 0.8;
  return distance / avgVelocity / PHYSICS.TICKS_PER_SECOND;
}

/**
 * Calculate aim angles for hitting a target
 */
export function calculateAim(
  bot: Bot,
  target: Entity
): { yaw: number; pitch: number; distance: number; canHit: boolean } {
  const config = getConfig(bot);

  if (!target.position || !bot.entity?.position) {
    return { yaw: 0, pitch: 0, distance: Infinity, canHit: false };
  }

  // Calculate distance
  const dx = target.position.x - bot.entity.position.x;
  const dy = target.position.y - bot.entity.position.y;
  const dz = target.position.z - bot.entity.position.z;
  const _horizontalDistance = Math.sqrt(dx * dx + dz * dz);
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // Check range
  if (distance > config.maxRange || distance < config.minRange) {
    return { yaw: 0, pitch: 0, distance, canHit: false };
  }

  // Get target position (with leading if enabled)
  let targetPos = target.position.clone();
  if (config.leadTarget && target.velocity) {
    const flightTime = estimateFlightTime(distance);
    targetPos = predictTargetPosition(target, flightTime);
  }

  // Aim at center mass (slightly above feet)
  targetPos.y += target.height ? target.height * 0.6 : 1.0;

  // Recalculate with predicted position
  const predDx = targetPos.x - bot.entity.position.x;
  const predDy = targetPos.y - bot.entity.position.y;
  const predDz = targetPos.z - bot.entity.position.z;
  const predHorizontalDistance = Math.sqrt(predDx * predDx + predDz * predDz);

  // Calculate angles
  const yaw = calculateYaw(bot, targetPos);
  const pitch = calculatePitch(
    predHorizontalDistance,
    predDy,
    PHYSICS.ARROW_VELOCITY,
    config.trajectoryIterations
  );

  // Convert pitch to Minecraft format (negative = up)
  const mcPitch = -pitch;

  return {
    yaw,
    pitch: mcPitch,
    distance,
    canHit: true,
  };
}

/**
 * Get the weapon type from held item
 */
function getWeaponType(bot: Bot): 'bow' | 'crossbow' | null {
  const held = bot.heldItem;
  if (!held) return null;

  const name = held.name.toLowerCase();
  if (name.includes('crossbow')) return 'crossbow';
  if (name.includes('bow')) return 'bow';
  return null;
}

/** NBT data structure for crossbow */
interface CrossbowNBT {
  value?: {
    ChargedProjectiles?: {
      value?: {
        value?: Array<{ id?: { value?: string } }>;
      };
    };
  };
}

/**
 * Check if crossbow is loaded
 */
function isCrossbowLoaded(bot: Bot): boolean {
  const held = bot.heldItem;
  if (!held || !held.name.includes('crossbow')) return false;

  try {
    const nbt = held.nbt as CrossbowNBT | undefined;
    const charged = nbt?.value?.ChargedProjectiles;
    return charged !== undefined && (charged.value?.value?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Get crossbow enchantments
 */
function getCrossbowEnchantments(bot: Bot): CrossbowEnchantments | null {
  const held = bot.heldItem;
  if (!held || !held.name.includes('crossbow')) return null;

  const result: CrossbowEnchantments = {
    multishot: false,
    piercing: 0,
    quickCharge: 0,
    unbreaking: 0,
    mending: false,
  };

  try {
    const enchants = held.enchants || [];
    for (const ench of enchants) {
      switch (ench.name) {
        case 'multishot':
          result.multishot = true;
          break;
        case 'piercing':
          result.piercing = ench.lvl || 1;
          break;
        case 'quick_charge':
          result.quickCharge = ench.lvl || 1;
          break;
        case 'unbreaking':
          result.unbreaking = ench.lvl || 1;
          break;
        case 'mending':
          result.mending = true;
          break;
      }
    }
  } catch {
    // Enchantment parsing failed
  }

  return result;
}

/**
 * Get crossbow charge time based on Quick Charge level
 */
function getCrossbowChargeTime(bot: Bot): number {
  const enchants = getCrossbowEnchantments(bot);
  if (!enchants) return CHARGE_TIMES.crossbow.base;

  switch (enchants.quickCharge) {
    case 1:
      return CHARGE_TIMES.crossbow.quickCharge1;
    case 2:
      return CHARGE_TIMES.crossbow.quickCharge2;
    case 3:
      return CHARGE_TIMES.crossbow.quickCharge3;
    default:
      return CHARGE_TIMES.crossbow.base;
  }
}

/**
 * Get loaded projectile type from crossbow
 */
function getLoadedProjectile(bot: Bot): ArrowType | null {
  const held = bot.heldItem;
  if (!held || !held.name.includes('crossbow')) return null;

  try {
    const nbt = held.nbt as CrossbowNBT | undefined;
    const charged = nbt?.value?.ChargedProjectiles?.value?.value;
    if (!charged || charged.length === 0) return null;

    const projectile = charged[0];
    const id = projectile?.id?.value || '';

    if (id.includes('firework')) return 'firework_rocket';
    if (id.includes('spectral')) return 'spectral_arrow';
    if (id.includes('tipped')) return 'tipped_arrow';
    return 'arrow';
  } catch {
    return null;
  }
}

/**
 * Find best arrow type in inventory for crossbow
 */
function _findBestArrow(bot: Bot): { item: Item; type: ArrowType } | null {
  const items = bot.inventory.items();

  // Priority: tipped arrows > spectral > regular > fireworks (for flight)
  const priorities: ArrowType[] = ['tipped_arrow', 'spectral_arrow', 'arrow', 'firework_rocket'];

  for (const type of priorities) {
    const item = items.find((i) => {
      const name = i.name.toLowerCase();
      switch (type) {
        case 'tipped_arrow':
          return name.includes('tipped_arrow');
        case 'spectral_arrow':
          return name === 'spectral_arrow';
        case 'arrow':
          return name === 'arrow';
        case 'firework_rocket':
          return name === 'firework_rocket';
        default:
          return false;
      }
    });

    if (item) {
      return { item, type };
    }
  }

  return null;
}

/**
 * Aim and shoot at a target
 */
export async function shootAt(
  bot: Bot,
  target: Entity,
  options: { chargeTime?: number } = {}
): Promise<{ success: boolean; reason?: string }> {
  const config = getConfig(bot);
  if (!config.enabled) {
    return { success: false, reason: 'ranged_combat_disabled' };
  }

  const weaponType = getWeaponType(bot);
  if (!weaponType) {
    return { success: false, reason: 'no_ranged_weapon' };
  }

  // Calculate aim
  const aim = calculateAim(bot, target);
  if (!aim.canHit) {
    return { success: false, reason: 'target_out_of_range' };
  }

  try {
    // Look at target with correct angles
    await bot.look(aim.yaw, aim.pitch, true);

    if (weaponType === 'crossbow') {
      // Crossbow: load if not loaded, then shoot
      if (!isCrossbowLoaded(bot)) {
        const chargeTime = getCrossbowChargeTime(bot);
        bot.activateItem(false);
        await new Promise((r) => setTimeout(r, chargeTime));
        bot.deactivateItem();
        // Wait for crossbow to be loaded
        await new Promise((r) => setTimeout(r, 100));
      }

      // Get enchantment info for logging
      const enchants = getCrossbowEnchantments(bot);
      const projectileType = getLoadedProjectile(bot);

      // Shoot loaded crossbow
      bot.activateItem(false);
      bot.deactivateItem();

      // Log multishot info
      if (enchants?.multishot) {
        log.debug('Multishot crossbow fired', { projectiles: 3 });
      }
      if (projectileType === 'firework_rocket') {
        log.debug('Firework rocket fired');
      }
    } else {
      // Bow: draw and release
      const chargeTime = options.chargeTime ?? CHARGE_TIMES.bow.optimal;

      bot.activateItem(false);

      // Store active shot
      activeShots.set(bot, { target, startTime: Date.now() });

      // Wait for charge
      await new Promise((r) => setTimeout(r, chargeTime));

      // Re-aim just before release (target may have moved)
      const finalAim = calculateAim(bot, target);
      if (finalAim.canHit) {
        await bot.look(finalAim.yaw, finalAim.pitch, true);
      }

      bot.deactivateItem();
      activeShots.delete(bot);
    }

    // Get target name - Entity may have username for players
    const targetWithUser = target as Entity & { username?: string };
    const targetName = target.name || targetWithUser.username || 'unknown';

    log.debug('Shot fired', {
      target: targetName,
      distance: aim.distance,
      weapon: weaponType,
    });

    pushEvent(bot, 'auto_attack_started', {
      target: targetName,
      weapon: weaponType,
      distance: Math.round(aim.distance),
      ranged: true,
    });

    return { success: true };
  } catch (err) {
    activeShots.delete(bot);
    log.debug('Failed to shoot', { error: err });
    return { success: false, reason: 'shoot_failed' };
  }
}

/**
 * Rapid fire mode - shoot as fast as possible
 */
export async function rapidFire(
  bot: Bot,
  target: Entity,
  shots: number = 3
): Promise<{ hits: number; total: number }> {
  let hits = 0;

  for (let i = 0; i < shots; i++) {
    // Check if target still valid
    if (!bot.entities[target.id]) break;

    const result = await shootAt(bot, target, { chargeTime: 300 }); // Quick shots
    if (result.success) hits++;

    // Small delay between shots
    await new Promise((r) => setTimeout(r, 200));
  }

  return { hits, total: shots };
}

/**
 * Configure ranged combat
 */
export function configureRangedCombat(bot: Bot, config: Partial<RangedCombatConfig>): void {
  const current = getConfig(bot);
  botConfigs.set(bot, { ...current, ...config });
  log.debug('Ranged combat configured', { username: bot.username, config: botConfigs.get(bot) });
}

/**
 * Get ranged combat status
 */
export function getRangedCombatStatus(bot: Bot): {
  enabled: boolean;
  config: RangedCombatConfig;
  hasRangedWeapon: boolean;
  weaponType: 'bow' | 'crossbow' | null;
  isLoaded: boolean;
  isShooting: boolean;
  crossbowEnchants: CrossbowEnchantments | null;
  loadedProjectile: ArrowType | null;
  chargeTime: number;
  hasAmmo: boolean;
} {
  const config = getConfig(bot);
  const weaponType = getWeaponType(bot);
  const activeShot = activeShots.get(bot);
  const enchants = weaponType === 'crossbow' ? getCrossbowEnchantments(bot) : null;

  return {
    enabled: config.enabled,
    config,
    hasRangedWeapon: weaponType !== null,
    weaponType,
    isLoaded: weaponType === 'crossbow' ? isCrossbowLoaded(bot) : true,
    isShooting: !!activeShot,
    crossbowEnchants: enchants,
    loadedProjectile: getLoadedProjectile(bot),
    chargeTime: weaponType === 'crossbow' ? getCrossbowChargeTime(bot) : CHARGE_TIMES.bow.optimal,
    hasAmmo: hasAmmo(bot),
  };
}

/**
 * Find and equip a ranged weapon
 */
export async function equipRangedWeapon(bot: Bot): Promise<boolean> {
  // Prefer crossbow if loaded, otherwise bow
  const items = bot.inventory.items();

  // Check for loaded crossbow first
  const loadedCrossbow = items.find((i) => {
    if (!i.name.includes('crossbow')) return false;
    try {
      const nbt = i.nbt as CrossbowNBT | undefined;
      const charged = nbt?.value?.ChargedProjectiles;
      return charged !== undefined && (charged.value?.value?.length ?? 0) > 0;
    } catch {
      return false;
    }
  });

  if (loadedCrossbow) {
    try {
      await bot.equip(loadedCrossbow, 'hand');
      return true;
    } catch {}
  }

  // Try bow
  const bow = items.find((i) => i.name.includes('bow') && !i.name.includes('crossbow'));
  if (bow) {
    try {
      await bot.equip(bow, 'hand');
      return true;
    } catch {}
  }

  // Try any crossbow
  const crossbow = items.find((i) => i.name.includes('crossbow'));
  if (crossbow) {
    try {
      await bot.equip(crossbow, 'hand');
      return true;
    } catch {}
  }

  return false;
}

/**
 * Check if we have arrows in inventory
 */
export function hasAmmo(bot: Bot): boolean {
  const weaponType = getWeaponType(bot);

  if (weaponType === 'crossbow' && isCrossbowLoaded(bot)) {
    return true; // Already loaded
  }

  return bot.inventory.items().some((i) =>
    i.name.includes('arrow') || i.name.includes('firework_rocket')
  );
}

/**
 * Enable or disable ranged combat
 */
export function setRangedCombatEnabled(bot: Bot, enabled: boolean): void {
  const config = getConfig(bot);
  config.enabled = enabled;
  log.info('Ranged combat toggled', { username: bot.username, enabled });
}
