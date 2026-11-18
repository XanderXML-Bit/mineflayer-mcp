/**
 * Trident Service
 *
 * Handles trident mechanics including:
 * - Riptide travel (launch in water/rain)
 * - Channeling (summon lightning)
 * - Loyalty (trident returns)
 * - Impaling (extra damage to aquatic mobs)
 *
 * Riptide mechanics:
 * - Only works in water or during rain/thunderstorm
 * - Launches player in the direction they're looking
 * - Cannot throw trident when Riptide is active
 * - Level 1: 6 blocks, Level 2: 12 blocks, Level 3: 18 blocks
 */

import type { Bot } from 'mineflayer';
import type { Entity } from 'prismarine-entity';
import type { Item } from 'prismarine-item';
import { Vec3 } from 'vec3';
import type { ManagedBot } from '../types/bot.js';
import { logger } from '../utils/logger.js';
import { pushEvent } from './event.service.js';

const log = logger.child('trident-service');

/** Bot with trident state - uses ManagedBot directly since it already has __tridentState */
type BotWithTridentState = ManagedBot;

/** Entity with water state property */
interface EntityWithWaterState {
  isInWater?: boolean;
}

/** Bot with thunder state property */
interface BotWithThunderState {
  thunderState?: number;
}

/** Trident enchantment info */
export interface TridentEnchantments {
  riptide: number; // 0-3
  channeling: boolean;
  loyalty: number; // 0-3
  impaling: number; // 0-5
  unbreaking: number;
  mending: boolean;
}

/** Trident service configuration */
export interface TridentConfig {
  /** Whether trident features are enabled */
  enabled: boolean;
  /** Auto-use riptide when in water and need to travel */
  autoRiptide: boolean;
  /** Maximum distance to use riptide for travel */
  maxRiptideDistance: number;
  /** Charge time for riptide (ms) */
  riptideChargeMs: number;
}

/** Default configuration */
export const DEFAULT_TRIDENT_CONFIG: TridentConfig = {
  enabled: true,
  autoRiptide: false, // Manual by default
  maxRiptideDistance: 100,
  riptideChargeMs: 500,
};

/** Riptide launch distances per level */
const RIPTIDE_DISTANCES: Record<number, number> = {
  1: 6,
  2: 12,
  3: 18,
};

/** Trident state */
interface TridentState {
  config: TridentConfig;
  isRiptiding: boolean;
  riptideStartTime: number;
  lastRiptidePos: Vec3 | null;
}

/** Get or create trident state */
function getTridentState(bot: Bot): TridentState {
  const managed = bot as BotWithTridentState;
  if (!managed.__tridentState) {
    managed.__tridentState = {
      config: { ...DEFAULT_TRIDENT_CONFIG },
      isRiptiding: false,
      riptideStartTime: 0,
      lastRiptidePos: null,
    };
  }
  return managed.__tridentState;
}

/**
 * Find trident in inventory
 */
export function findTrident(bot: Bot): Item | null {
  return bot.inventory.items().find((item) => item.name === 'trident') || null;
}

/**
 * Check if currently holding a trident
 */
function isHoldingTrident(bot: Bot): boolean {
  return bot.heldItem?.name === 'trident';
}

/**
 * Get trident enchantments
 */
export function getTridentEnchantments(bot: Bot, item?: Item): TridentEnchantments | null {
  const trident = item || bot.heldItem;
  if (!trident || trident.name !== 'trident') return null;

  const result: TridentEnchantments = {
    riptide: 0,
    channeling: false,
    loyalty: 0,
    impaling: 0,
    unbreaking: 0,
    mending: false,
  };

  try {
    const enchants = trident.enchants || [];
    for (const ench of enchants) {
      switch (ench.name) {
        case 'riptide':
          result.riptide = ench.lvl || 1;
          break;
        case 'channeling':
          result.channeling = true;
          break;
        case 'loyalty':
          result.loyalty = ench.lvl || 1;
          break;
        case 'impaling':
          result.impaling = ench.lvl || 1;
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
 * Check if riptide can be used (in water or raining)
 */
export function canUseRiptide(bot: Bot): { canUse: boolean; reason?: string } {
  // Check if holding trident with riptide
  if (!isHoldingTrident(bot)) {
    return { canUse: false, reason: 'not_holding_trident' };
  }

  const enchants = getTridentEnchantments(bot);
  if (!enchants || enchants.riptide === 0) {
    return { canUse: false, reason: 'no_riptide_enchantment' };
  }

  // Check if in water
  if ((bot.entity as EntityWithWaterState)?.isInWater) {
    return { canUse: true };
  }

  // Check if raining
  if (bot.isRaining) {
    // Need to be exposed to sky
    const pos = bot.entity?.position;
    if (pos) {
      const blockAbove = bot.blockAt(new Vec3(
        Math.floor(pos.x),
        Math.floor(pos.y) + 2,
        Math.floor(pos.z)
      ));
      if (!blockAbove || blockAbove.boundingBox === 'empty' || blockAbove.transparent) {
        return { canUse: true };
      }
    }
    return { canUse: false, reason: 'not_exposed_to_rain' };
  }

  return { canUse: false, reason: 'not_in_water_or_rain' };
}

/**
 * Use riptide to launch in a direction
 */
export async function useRiptide(
  bot: Bot,
  direction?: Vec3
): Promise<{ success: boolean; distance?: number; reason?: string }> {
  const state = getTridentState(bot);

  if (state.isRiptiding) {
    return { success: false, reason: 'already_riptiding' };
  }

  // Equip trident if not holding
  if (!isHoldingTrident(bot)) {
    const trident = findTrident(bot);
    if (!trident) {
      return { success: false, reason: 'no_trident' };
    }
    await bot.equip(trident, 'hand');
  }

  // Check if can use riptide
  const canUse = canUseRiptide(bot);
  if (!canUse.canUse) {
    return { success: false, reason: canUse.reason };
  }

  const enchants = getTridentEnchantments(bot);
  if (!enchants) {
    return { success: false, reason: 'no_enchantments' };
  }

  state.isRiptiding = true;
  state.riptideStartTime = Date.now();
  state.lastRiptidePos = bot.entity.position.clone();

  try {
    // Look in the target direction
    if (direction) {
      const yaw = Math.atan2(-direction.x, direction.z);
      const horizontalDist = Math.sqrt(direction.x * direction.x + direction.z * direction.z);
      const pitch = -Math.atan2(direction.y, horizontalDist);
      await bot.look(yaw, pitch, true);
    }

    // Charge and release trident
    bot.activateItem(false);
    await new Promise((r) => setTimeout(r, state.config.riptideChargeMs));
    bot.deactivateItem();

    // Wait for launch to complete
    await new Promise((r) => setTimeout(r, 500));

    const distance = RIPTIDE_DISTANCES[enchants.riptide] || 6;

    pushEvent(bot, 'tool_switched', {
      action: 'riptide_used',
      level: enchants.riptide,
      expectedDistance: distance,
    });

    log.info('Riptide launched', { level: enchants.riptide, distance });

    return { success: true, distance };
  } catch (error) {
    log.debug('Riptide failed', { error });
    return { success: false, reason: 'riptide_failed' };
  } finally {
    state.isRiptiding = false;
  }
}

/**
 * Use riptide to travel to a target position
 */
export async function riptideToward(
  bot: Bot,
  target: Vec3 | { x: number; y: number; z: number }
): Promise<{ success: boolean; arrived: boolean; reason?: string }> {
  const state = getTridentState(bot);
  const targetVec = target instanceof Vec3 ? target : new Vec3(target.x, target.y, target.z);

  if (!bot.entity?.position) {
    return { success: false, arrived: false, reason: 'no_position' };
  }

  const direction = targetVec.minus(bot.entity.position).normalize();
  const distance = bot.entity.position.distanceTo(targetVec);

  if (distance > state.config.maxRiptideDistance) {
    return { success: false, arrived: false, reason: 'too_far' };
  }

  // Calculate how many riptides needed
  const enchants = getTridentEnchantments(bot, findTrident(bot) || undefined);
  const riptideDistance = RIPTIDE_DISTANCES[enchants?.riptide || 1] || 6;
  const riptideCount = Math.ceil(distance / riptideDistance);

  let totalDistance = 0;
  for (let i = 0; i < riptideCount && totalDistance < distance; i++) {
    const result = await useRiptide(bot, direction);
    if (!result.success) {
      return { success: false, arrived: false, reason: result.reason };
    }
    totalDistance += result.distance || riptideDistance;

    // Wait between riptides
    await new Promise((r) => setTimeout(r, 200));

    // Check if close enough
    if (bot.entity.position.distanceTo(targetVec) < 3) {
      return { success: true, arrived: true };
    }
  }

  const finalDistance = bot.entity.position.distanceTo(targetVec);
  return {
    success: true,
    arrived: finalDistance < 5,
    reason: finalDistance < 5 ? undefined : 'partial_travel',
  };
}

/**
 * Throw trident at target (non-riptide)
 */
export async function throwTrident(
  bot: Bot,
  target: Entity | Vec3
): Promise<{ success: boolean; reason?: string }> {
  // Equip trident if not holding
  if (!isHoldingTrident(bot)) {
    const trident = findTrident(bot);
    if (!trident) {
      return { success: false, reason: 'no_trident' };
    }
    await bot.equip(trident, 'hand');
  }

  // Check for riptide (can't throw with riptide)
  const enchants = getTridentEnchantments(bot);
  if (enchants?.riptide && enchants.riptide > 0) {
    // Check if in water/rain
    const canRiptide = canUseRiptide(bot);
    if (canRiptide.canUse) {
      return { success: false, reason: 'cannot_throw_riptide_in_water' };
    }
  }

  try {
    // Calculate aim
    const targetPos = target instanceof Vec3 ? target : target.position;
    if (!targetPos) {
      return { success: false, reason: 'no_target_position' };
    }

    // Aim slightly higher for arc
    const aimPos = targetPos.offset(0, 0.5, 0);
    await bot.lookAt(aimPos);

    // Charge and throw
    bot.activateItem(false);
    await new Promise((r) => setTimeout(r, 500)); // Charge time
    bot.deactivateItem();

    log.debug('Trident thrown', {
      target: target instanceof Vec3 ? 'position' : (target.name || 'entity'),
      hasLoyalty: enchants?.loyalty ? enchants.loyalty : 0,
      hasChanneling: enchants?.channeling,
    });

    // If has loyalty, trident will return
    if (enchants?.loyalty && enchants.loyalty > 0) {
      log.debug('Trident will return', { loyaltyLevel: enchants.loyalty });
    }

    return { success: true };
  } catch (error) {
    log.debug('Failed to throw trident', { error });
    return { success: false, reason: 'throw_failed' };
  }
}

/**
 * Check if channeling can trigger lightning
 */
export function canTriggerLightning(bot: Bot): boolean {
  const enchants = getTridentEnchantments(bot);
  if (!enchants?.channeling) return false;

  // Need thunderstorm
  const botWithThunder = bot as unknown as BotWithThunderState;
  const isThundering = bot.isRaining && (botWithThunder.thunderState ?? 0) > 0;
  if (!isThundering) return false;

  // Need to be exposed to sky
  const pos = bot.entity?.position;
  if (!pos) return false;

  const blockAbove = bot.blockAt(new Vec3(
    Math.floor(pos.x),
    Math.floor(pos.y) + 2,
    Math.floor(pos.z)
  ));

  return !blockAbove || blockAbove.boundingBox === 'empty' || blockAbove.transparent;
}

/**
 * Get trident service status
 */
export function getTridentStatus(bot: Bot): {
  enabled: boolean;
  config: TridentConfig;
  hasTrident: boolean;
  isHoldingTrident: boolean;
  enchantments: TridentEnchantments | null;
  canUseRiptide: boolean;
  riptideReason?: string;
  isRiptiding: boolean;
  canTriggerLightning: boolean;
  isInWater: boolean;
  isRaining: boolean;
} {
  const state = getTridentState(bot);
  const trident = findTrident(bot);
  const enchants = trident ? getTridentEnchantments(bot, trident) : null;
  const riptideCheck = canUseRiptide(bot);

  return {
    enabled: state.config.enabled,
    config: state.config,
    hasTrident: trident !== null,
    isHoldingTrident: isHoldingTrident(bot),
    enchantments: enchants,
    canUseRiptide: riptideCheck.canUse,
    riptideReason: riptideCheck.reason,
    isRiptiding: state.isRiptiding,
    canTriggerLightning: canTriggerLightning(bot),
    isInWater: (bot.entity as EntityWithWaterState)?.isInWater ?? false,
    isRaining: bot.isRaining,
  };
}

/**
 * Configure trident service
 */
export function configureTridentService(bot: Bot, config: Partial<TridentConfig>): void {
  const state = getTridentState(bot);
  state.config = { ...state.config, ...config };
  log.debug('Trident service configured', { config: state.config });
}

/**
 * Initialize trident service
 */
export function initializeTridentService(bot: Bot, config?: Partial<TridentConfig>): void {
  const state = getTridentState(bot);

  if (config) {
    state.config = { ...state.config, ...config };
  }

  log.info('Trident service initialized', { username: bot.username });
}
