/**
 * Shield Blocking Service
 *
 * Automatically manages shield blocking in combat:
 * - Blocks when taking damage from in front
 * - Lowers shield briefly to counter-attack
 * - Handles shield cooldown after axe hits
 * - Coordinates with combat services
 *
 * Shield mechanics:
 * - Blocks 100% of melee damage from front 180 degrees
 * - Blocks arrows, fireballs, tridents
 * - Gets disabled for 5 seconds when hit by axe
 * - Cannot attack while blocking
 */

import type { Bot } from 'mineflayer';
import type { Entity } from 'prismarine-entity';
import type { Item } from 'prismarine-item';
import type { ManagedBot } from '../types/bot.js';
import { logger } from '../utils/logger.js';
import { pushEvent } from './event.service.js';

const log = logger.child('shield-service');

/** Bot with shield state - uses ManagedBot directly since it already has __shieldState */
type BotWithShieldState = ManagedBot;

/** Shield service configuration */
export interface ShieldConfig {
  /** Whether shield auto-blocking is enabled */
  enabled: boolean;
  /** Auto-block when hostile is within this range */
  autoBlockRange: number;
  /** Time to lower shield for counter-attack (ms) */
  counterAttackWindowMs: number;
  /** Cooldown after blocking before lowering again (ms) */
  blockCooldownMs: number;
  /** Health threshold to always keep shield up */
  alwaysBlockHealthThreshold: number;
  /** Shield disabled duration after axe hit (ms) */
  axeDisableDurationMs: number;
}

/** Default configuration */
export const DEFAULT_SHIELD_CONFIG: ShieldConfig = {
  enabled: true,
  autoBlockRange: 6, // Block when hostile within 6 blocks
  counterAttackWindowMs: 400, // Lower shield for 400ms to attack
  blockCooldownMs: 200, // Wait 200ms between block toggles
  alwaysBlockHealthThreshold: 6, // Always block when health below 6
  axeDisableDurationMs: 5000, // Shield disabled for 5 seconds after axe hit
};

/** Hostile mob names */
const HOSTILE_MOBS = new Set([
  'zombie', 'skeleton', 'spider', 'creeper', 'enderman', 'witch',
  'zombie_villager', 'drowned', 'husk', 'stray', 'phantom',
  'slime', 'magma_cube', 'blaze', 'ghast', 'wither_skeleton',
  'piglin_brute', 'hoglin', 'zoglin', 'pillager', 'vindicator',
  'evoker', 'ravager', 'vex', 'warden', 'guardian', 'elder_guardian',
  'cave_spider', 'silverfish', 'endermite', 'shulker', 'piglin',
]);

/** Shield state */
interface ShieldState {
  config: ShieldConfig;
  isBlocking: boolean;
  isDisabled: boolean;
  disabledUntil: number;
  lastBlockTime: number;
  lastDamageTime: number;
  checkInterval?: ReturnType<typeof setInterval>;
  damageListener?: (entity: Entity) => void;
}

/** Get or create shield state for a bot */
function getShieldState(bot: Bot): ShieldState {
  const managed = bot as BotWithShieldState;
  if (!managed.__shieldState) {
    managed.__shieldState = {
      config: { ...DEFAULT_SHIELD_CONFIG },
      isBlocking: false,
      isDisabled: false,
      disabledUntil: 0,
      lastBlockTime: 0,
      lastDamageTime: 0,
    };
  }
  return managed.__shieldState;
}

/**
 * Check if entity is hostile
 */
function isHostile(entity: Entity): boolean {
  if (!entity?.name) return false;
  const name = entity.name.toLowerCase();
  return HOSTILE_MOBS.has(name) || [...HOSTILE_MOBS].some((h) => name.includes(h));
}

/**
 * Check if entity is a player (potential PvP threat)
 */
function isPlayer(entity: Entity): boolean {
  return entity.type === 'player';
}

/**
 * Find shield in inventory or offhand
 */
function findShield(bot: Bot): { item: Item; location: 'inventory' | 'offhand' } | null {
  // Check offhand first
  const offhand = bot.inventory.slots[45];
  if (offhand?.name === 'shield') {
    return { item: offhand, location: 'offhand' };
  }

  // Check inventory
  const inventoryShield = bot.inventory.items().find((item) => item.name === 'shield');
  if (inventoryShield) {
    return { item: inventoryShield, location: 'inventory' };
  }

  return null;
}

/**
 * Check if shield is in offhand and ready
 */
function hasShieldReady(bot: Bot): boolean {
  const offhand = bot.inventory.slots[45];
  return offhand?.name === 'shield';
}

/**
 * Find nearby threats - optimized single-pass with cached distances
 */
function findNearbyThreats(bot: Bot, range: number): Entity[] {
  if (!bot.entity?.position) return [];

  const botPos = bot.entity.position;
  const threats: Array<{ entity: Entity; dist: number }> = [];

  for (const e of Object.values(bot.entities)) {
    if (!e || e === bot.entity || !e.position) continue;
    if (!isHostile(e) && !isPlayer(e)) continue;

    const dist = e.position.distanceTo(botPos);
    if (dist <= range) {
      threats.push({ entity: e, dist });
    }
  }

  // Sort by cached distance to avoid recalculating
  threats.sort((a, b) => a.dist - b.dist);
  return threats.map((t) => t.entity);
}

/**
 * Check if threat is in front of bot (shield blocks 180 degree arc)
 */
function isThreatInFront(bot: Bot, threat: Entity): boolean {
  if (!bot.entity?.position || !threat.position) return false;

  const dx = threat.position.x - bot.entity.position.x;
  const dz = threat.position.z - bot.entity.position.z;
  const threatAngle = Math.atan2(-dx, -dz); // Angle to threat

  const botYaw = bot.entity.yaw;
  let angleDiff = Math.abs(threatAngle - botYaw);

  // Normalize to 0-PI
  if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

  // Front 180 degrees = PI/2 radians each side
  return angleDiff < Math.PI / 2;
}

/**
 * Raise shield (start blocking)
 */
async function raiseShield(bot: Bot): Promise<boolean> {
  const state = getShieldState(bot);

  if (state.isBlocking) return true;
  if (state.isDisabled && Date.now() < state.disabledUntil) return false;
  if (!hasShieldReady(bot)) return false;

  try {
    // Activate shield (right-click with shield in offhand)
    bot.activateItem(true); // true = offhand
    state.isBlocking = true;
    state.lastBlockTime = Date.now();

    log.debug('Shield raised');
    return true;
  } catch (error) {
    log.debug('Failed to raise shield', { error });
    return false;
  }
}

/**
 * Lower shield (stop blocking)
 */
function lowerShield(bot: Bot): void {
  const state = getShieldState(bot);

  if (!state.isBlocking) return;

  try {
    bot.deactivateItem();
    state.isBlocking = false;
    log.debug('Shield lowered');
  } catch (error) {
    log.debug('Failed to lower shield', { error });
  }
}

/**
 * Equip shield to offhand if not already there
 */
async function equipShieldToOffhand(bot: Bot): Promise<boolean> {
  if (hasShieldReady(bot)) return true;

  const shield = findShield(bot);
  if (!shield || shield.location === 'offhand') return false;

  try {
    await bot.equip(shield.item, 'off-hand');
    log.debug('Shield equipped to offhand');
    return true;
  } catch (error) {
    log.debug('Failed to equip shield', { error });
    return false;
  }
}

/**
 * Handle being hit by an axe (disables shield)
 */
function _handleAxeHit(bot: Bot): void {
  const state = getShieldState(bot);
  state.isDisabled = true;
  state.disabledUntil = Date.now() + state.config.axeDisableDurationMs;
  state.isBlocking = false;

  pushEvent(bot, 'tool_switched', {
    action: 'shield_disabled',
    reason: 'axe_hit',
    disabledFor: state.config.axeDisableDurationMs,
  });

  log.info('Shield disabled by axe hit');

  // Re-enable after duration
  setTimeout(() => {
    if (Date.now() >= state.disabledUntil) {
      state.isDisabled = false;
      log.debug('Shield re-enabled after axe cooldown');
    }
  }, state.config.axeDisableDurationMs);
}

/**
 * Counter-attack: briefly lower shield to attack, then raise again
 */
export async function counterAttack(
  bot: Bot,
  target: Entity,
  attackCallback?: () => Promise<void>
): Promise<boolean> {
  const state = getShieldState(bot);

  if (!state.isBlocking) return false;

  const wasBlocking = state.isBlocking;

  try {
    // Lower shield
    lowerShield(bot);

    // Perform attack
    if (attackCallback) {
      await attackCallback();
    } else {
      await bot.lookAt(target.position.offset(0, target.height * 0.8, 0));
      await bot.attack(target);
    }

    // Wait briefly
    await new Promise((r) => setTimeout(r, state.config.counterAttackWindowMs));

    // Raise shield again if we were blocking and should continue
    if (wasBlocking && state.config.enabled) {
      const threats = findNearbyThreats(bot, state.config.autoBlockRange);
      if (threats.length > 0 || bot.health < state.config.alwaysBlockHealthThreshold) {
        await raiseShield(bot);
      }
    }

    return true;
  } catch (error) {
    log.debug('Counter-attack failed', { error });
    return false;
  }
}

/**
 * Main check - called periodically
 */
async function checkAndBlock(bot: Bot): Promise<void> {
  const state = getShieldState(bot);
  if (!state.config.enabled) return;
  if (!bot.entity?.position) return;

  // Check if shield is disabled
  if (state.isDisabled && Date.now() < state.disabledUntil) {
    return;
  } else if (state.isDisabled) {
    state.isDisabled = false;
  }

  // Ensure shield is in offhand
  if (!hasShieldReady(bot)) {
    await equipShieldToOffhand(bot);
    return;
  }

  // Find threats
  const threats = findNearbyThreats(bot, state.config.autoBlockRange);
  const frontalThreats = threats.filter((t) => isThreatInFront(bot, t));

  // Decide whether to block
  const shouldBlock =
    frontalThreats.length > 0 ||
    (bot.health < state.config.alwaysBlockHealthThreshold && threats.length > 0);

  if (shouldBlock && !state.isBlocking) {
    await raiseShield(bot);

    pushEvent(bot, 'tool_switched', {
      action: 'shield_raised',
      threats: frontalThreats.length,
      nearestThreat: frontalThreats[0]?.name || threats[0]?.name,
      health: bot.health,
    });
  } else if (!shouldBlock && state.isBlocking) {
    // No threats, lower shield
    lowerShield(bot);
  }
}

/**
 * Set up damage listener for axe detection
 */
function setupDamageListener(bot: Bot): void {
  const state = getShieldState(bot);

  // Remove existing listener
  if (state.damageListener) {
    bot.removeListener('entityHurt', state.damageListener);
  }

  state.damageListener = (entity: Entity) => {
    if (entity !== bot.entity) return;
    if (!state.isBlocking) return;

    state.lastDamageTime = Date.now();

    // Check if attacker has an axe (shield gets disabled)
    // We can't easily detect this, but we can check if damage went through while blocking
    // In vanilla, if you're blocking and take damage, it might be an axe or from behind

    // For now, we'll just record the damage event
    // A more sophisticated check could track the attacker's held item
  };

  bot.on('entityHurt', state.damageListener);
}

/**
 * Initialize shield service for a bot
 */
export function initializeShieldService(bot: Bot, config?: Partial<ShieldConfig>): void {
  const state = getShieldState(bot);

  if (config) {
    state.config = { ...state.config, ...config };
  }

  // Clean up existing
  if (state.checkInterval) {
    clearInterval(state.checkInterval);
    state.checkInterval = undefined;
  }

  if (!state.config.enabled) {
    log.debug('Shield service disabled', { username: bot.username });
    return;
  }

  // Set up damage listener
  setupDamageListener(bot);

  // Set up periodic check
  state.checkInterval = setInterval(() => {
    checkAndBlock(bot).catch((e) => {
      log.debug('Shield check error', { error: e });
    });
  }, 100); // Check frequently for responsive blocking

  log.info('Shield service initialized', { username: bot.username, config: state.config });
}

/**
 * Enable or disable shield service
 */
export function setShieldServiceEnabled(bot: Bot, enabled: boolean): void {
  const state = getShieldState(bot);
  state.config.enabled = enabled;

  if (!enabled) {
    lowerShield(bot);
  }

  initializeShieldService(bot, state.config);
  log.info('Shield service toggled', { username: bot.username, enabled });
}

/**
 * Configure shield service
 */
export function configureShieldService(bot: Bot, config: Partial<ShieldConfig>): void {
  const state = getShieldState(bot);
  state.config = { ...state.config, ...config };

  if (state.config.enabled) {
    initializeShieldService(bot, state.config);
  }

  log.debug('Shield service configured', { username: bot.username, config: state.config });
}

/**
 * Get shield service status
 */
export function getShieldStatus(bot: Bot): {
  enabled: boolean;
  config: ShieldConfig;
  isBlocking: boolean;
  isDisabled: boolean;
  disabledTimeRemaining: number;
  hasShieldEquipped: boolean;
  hasShieldInInventory: boolean;
  nearbyThreats: number;
  frontalThreats: number;
} {
  const state = getShieldState(bot);
  const threats = findNearbyThreats(bot, state.config.autoBlockRange);
  const frontalThreats = threats.filter((t) => isThreatInFront(bot, t));

  return {
    enabled: state.config.enabled,
    config: state.config,
    isBlocking: state.isBlocking,
    isDisabled: state.isDisabled,
    disabledTimeRemaining: Math.max(0, state.disabledUntil - Date.now()),
    hasShieldEquipped: hasShieldReady(bot),
    hasShieldInInventory: findShield(bot) !== null,
    nearbyThreats: threats.length,
    frontalThreats: frontalThreats.length,
  };
}

/**
 * Force raise shield (manual trigger)
 */
export async function raiseShieldNow(bot: Bot): Promise<boolean> {
  await equipShieldToOffhand(bot);
  return raiseShield(bot);
}

/**
 * Force lower shield (manual trigger)
 */
export function lowerShieldNow(bot: Bot): void {
  lowerShield(bot);
}

/**
 * Clean up shield service
 */
export function cleanupShieldService(bot: Bot): void {
  const managed = bot as BotWithShieldState;
  const state = managed.__shieldState;

  if (!state) return;

  if (state.checkInterval) {
    clearInterval(state.checkInterval);
    state.checkInterval = undefined;
  }

  if (state.damageListener) {
    bot.removeListener('entityHurt', state.damageListener);
    state.damageListener = undefined;
  }

  // Lower shield on cleanup
  if (state.isBlocking) {
    try {
      bot.deactivateItem();
    } catch {}
    state.isBlocking = false;
  }

  log.debug('Shield service cleaned up', { username: bot.username });
}
