/**
 * Auto-Defense Service
 *
 * Provides passive auto-defense capabilities:
 * - Automatically fights back when attacked
 * - Can be enabled/disabled per bot
 * - Reports actions to event system for agent awareness
 */

import type { Bot } from 'mineflayer';
import type { Entity } from 'prismarine-entity';
import type { Item } from 'prismarine-item';
import type { ManagedBot } from '../types/bot.js';
import { logger } from '../utils/logger.js';
import { pushEvent } from './event.service.js';

/** Entity with optional username (for players) */
type EntityWithUsername = Entity & { username?: string };

const log = logger.child('auto-defense');

/** Auto-defense configuration */
export interface AutoDefenseConfig {
  /** Whether auto-defense is enabled */
  enabled: boolean;
  /** Minimum health to engage (flee below this) */
  minHealthToFight: number;
  /** Attack range */
  attackRange: number;
  /** Whether to chase attackers */
  chase: boolean;
  /** Maximum chase distance */
  maxChaseDistance: number;
  /** Attack hostile mobs that get close (not just when attacked) */
  proactiveDefense: boolean;
  /** Proactive defense radius */
  proactiveRadius: number;
}

/** Default auto-defense config */
export const DEFAULT_AUTO_DEFENSE_CONFIG: AutoDefenseConfig = {
  enabled: false, // Disabled by default - agent controls when to enable
  minHealthToFight: 6,
  attackRange: 4,
  chase: true,
  maxChaseDistance: 16,
  proactiveDefense: false,
  proactiveRadius: 8,
};

/** Auto-defense state attached to bot */
export interface AutoDefenseState {
  config: AutoDefenseConfig;
  currentTarget: Entity | null;
  isAttacking: boolean;
  lastAttackTime: number;
  listeners: {
    entityHurt?: (entity: Entity) => void;
    physicsTick?: () => void;
  };
}

/** Get or create auto-defense state for a bot */
function getDefenseState(bot: Bot): AutoDefenseState {
  const managed = bot as ManagedBot;
  if (!managed.__autoDefenseState) {
    managed.__autoDefenseState = {
      config: { ...DEFAULT_AUTO_DEFENSE_CONFIG },
      currentTarget: null,
      isAttacking: false,
      lastAttackTime: 0,
      listeners: {},
    };
  }
  return managed.__autoDefenseState;
}

/** Hostile mobs for proactive defense */
const HOSTILE_MOBS = new Set([
  'zombie', 'skeleton', 'spider', 'creeper', 'enderman', 'witch',
  'zombie_villager', 'drowned', 'husk', 'stray', 'phantom',
  'slime', 'magma_cube', 'blaze', 'ghast', 'wither_skeleton',
  'piglin_brute', 'hoglin', 'zoglin', 'pillager', 'vindicator',
  'evoker', 'ravager', 'vex', 'warden', 'guardian', 'elder_guardian',
]);

/** Check if entity is hostile */
function isHostile(entity: Entity): boolean {
  if (!entity?.name) return false;
  const name = entity.name.toLowerCase();
  return HOSTILE_MOBS.has(name) || [...HOSTILE_MOBS].some(h => name.includes(h));
}

/** Get best weapon from inventory */
function getBestWeapon(bot: Bot): Item | null {
  const weapons = bot.inventory.items().filter(i =>
    i.name.includes('sword') || i.name.includes('axe')
  );

  if (weapons.length === 0) return null;

  // Sort by tier
  const tierOrder = ['netherite', 'diamond', 'iron', 'golden', 'stone', 'wooden'];
  weapons.sort((a, b) => {
    const aTier = tierOrder.findIndex(t => a.name.includes(t));
    const bTier = tierOrder.findIndex(t => b.name.includes(t));
    return (aTier === -1 ? 999 : aTier) - (bTier === -1 ? 999 : bTier);
  });

  return weapons[0];
}

/**
 * Initialize auto-defense for a bot
 */
export function initializeAutoDefense(bot: Bot, config?: Partial<AutoDefenseConfig>): void {
  const state = getDefenseState(bot);

  if (config) {
    state.config = { ...state.config, ...config };
  }

  // Clean up existing listeners if any
  cleanupAutoDefenseListeners(bot);

  if (!state.config.enabled) {
    log.debug('Auto-defense disabled', { username: bot.username });
    return;
  }

  log.info('Initializing auto-defense', { username: bot.username, config: state.config });

  // Listen for damage to self
  state.listeners.entityHurt = (entity: Entity) => {
    if (entity !== bot.entity) return;
    if (!state.config.enabled) return;

    // Find nearest attacker within 8 blocks using single-pass algorithm
    const botPos = bot.entity.position;
    let attacker: Entity | null = null;
    let minDist = 8; // Max attack range

    for (const e of Object.values(bot.entities)) {
      if (!e || e === bot.entity || !e.position) continue;
      if (!isHostile(e) && e.type !== 'player') continue;

      const dist = e.position.distanceTo(botPos);
      if (dist < minDist) {
        minDist = dist;
        attacker = e;
      }
    }

    if (attacker && !state.isAttacking) {
      log.info('Received damage, engaging attacker', {
        username: bot.username,
        attacker: attacker.name || (attacker as EntityWithUsername).username,
        health: bot.health,
      });

      // Check if we should fight or flee
      if (bot.health < state.config.minHealthToFight) {
        log.info('Health too low, not engaging', { health: bot.health });
        pushEvent(bot, 'health_low', { health: bot.health, action: 'flee_recommended' });
        return;
      }

      state.currentTarget = attacker;
      state.isAttacking = true;

      pushEvent(bot, 'auto_attack_started', {
        target: attacker.name || (attacker as EntityWithUsername).username || 'unknown',
        distance: Math.round(minDist),
        health: bot.health,
      });
    }
  };

  bot.on('entityHurt', state.listeners.entityHurt);

  // Track last scan time for throttling proactive defense
  let lastProactiveScan = 0;

  // Physics tick for combat loop
  state.listeners.physicsTick = async () => {
    if (!state.config.enabled) return;
    if (!state.isAttacking && !state.config.proactiveDefense) return;

    const now = Date.now();

    // Proactive defense - scan for nearby hostiles (throttled to every 200ms)
    if (state.config.proactiveDefense && !state.currentTarget && now - lastProactiveScan > 200) {
      lastProactiveScan = now;

      // Single-pass algorithm to find nearest hostile
      const botPos = bot.entity.position;
      const maxRadius = state.config.proactiveRadius;
      let nearbyHostile: Entity | null = null;
      let minDist = maxRadius;

      for (const e of Object.values(bot.entities)) {
        if (!e || e === bot.entity || !e.position) continue;
        if (!isHostile(e)) continue;

        const dist = e.position.distanceTo(botPos);
        if (dist < minDist) {
          minDist = dist;
          nearbyHostile = e;
        }
      }

      if (nearbyHostile) {
        state.currentTarget = nearbyHostile;
        state.isAttacking = true;

        pushEvent(bot, 'auto_attack_started', {
          target: nearbyHostile.name || 'unknown',
          distance: Math.round(minDist),
          health: bot.health,
          reason: 'proactive_defense',
        });
      }
    }

    if (!state.currentTarget || !state.isAttacking) return;

    // Check if target still exists
    const target = bot.entities[state.currentTarget.id];
    if (!target || !target.position) {
      log.debug('Target no longer exists', { username: bot.username });
      endCombat(bot, state, 'target_gone');
      return;
    }

    const distance = target.position.distanceTo(bot.entity.position);

    // Check if target is too far (fled or we should stop chasing)
    if (distance > state.config.maxChaseDistance) {
      log.debug('Target fled, ending combat', { username: bot.username, distance });
      endCombat(bot, state, 'target_fled');
      return;
    }

    // Check health
    if (bot.health < state.config.minHealthToFight) {
      log.info('Health too low, disengaging', { username: bot.username, health: bot.health });
      endCombat(bot, state, 'low_health');
      return;
    }

    // Attack if in range and cooldown passed
    if (distance < state.config.attackRange && now - state.lastAttackTime > 500) {
      try {
        // Equip weapon
        const weapon = getBestWeapon(bot);
        if (weapon) {
          await bot.equip(weapon, 'hand');
        }

        await bot.attack(target);
        state.lastAttackTime = now;
      } catch {
        // Target may have died or moved
      }
    }

    // Chase if enabled and out of range
    if (state.config.chase && distance > state.config.attackRange && distance < state.config.maxChaseDistance) {
      try {
        await bot.lookAt(target.position.offset(0, target.height * 0.8, 0));
        bot.setControlState('forward', true);
        bot.setControlState('sprint', distance > 6);
      } catch {
        // Ignore movement errors
      }
    } else {
      bot.setControlState('forward', false);
      bot.setControlState('sprint', false);
    }
  };

  bot.on('physicsTick', state.listeners.physicsTick);

  log.info('Auto-defense initialized', { username: bot.username });
}

/** End combat and clean up */
function endCombat(bot: Bot, state: AutoDefenseState, reason: string): void {
  if (!state.isAttacking) return;

  state.isAttacking = false;
  const targetName = state.currentTarget?.name || (state.currentTarget as EntityWithUsername)?.username || 'unknown';
  state.currentTarget = null;

  bot.setControlState('forward', false);
  bot.setControlState('sprint', false);

  pushEvent(bot, 'auto_attack_ended', {
    reason,
    health: bot.health,
    target: targetName,
  });

  log.debug('Combat ended', { username: bot.username, reason });
}

/**
 * Enable or disable auto-defense
 */
export function setAutoDefenseEnabled(bot: Bot, enabled: boolean): void {
  const state = getDefenseState(bot);
  const wasEnabled = state.config.enabled;
  state.config.enabled = enabled;

  if (enabled && !wasEnabled) {
    initializeAutoDefense(bot, state.config);
  } else if (!enabled && wasEnabled) {
    if (state.isAttacking) {
      endCombat(bot, state, 'disabled');
    }
  }

  log.info('Auto-defense toggled', { username: bot.username, enabled });
}

/**
 * Configure auto-defense
 */
export function configureAutoDefense(bot: Bot, config: Partial<AutoDefenseConfig>): void {
  const state = getDefenseState(bot);
  state.config = { ...state.config, ...config };

  // Re-initialize if needed
  if (state.config.enabled) {
    initializeAutoDefense(bot, state.config);
  }

  log.debug('Auto-defense configured', { username: bot.username, config: state.config });
}

/**
 * Get current auto-defense status
 */
export function getAutoDefenseStatus(bot: Bot): {
  enabled: boolean;
  isAttacking: boolean;
  currentTarget: string | null;
  config: AutoDefenseConfig;
} {
  const state = getDefenseState(bot);
  return {
    enabled: state.config.enabled,
    isAttacking: state.isAttacking,
    currentTarget: state.currentTarget?.name || (state.currentTarget as EntityWithUsername)?.username || null,
    config: state.config,
  };
}

/**
 * Clean up auto-defense listeners
 */
export function cleanupAutoDefenseListeners(bot: Bot): void {
  const managed = bot as ManagedBot;
  const state = managed.__autoDefenseState;

  if (!state) return;

  if (state.listeners.entityHurt) {
    bot.removeListener('entityHurt', state.listeners.entityHurt);
  }
  if (state.listeners.physicsTick) {
    bot.removeListener('physicsTick', state.listeners.physicsTick);
  }

  state.listeners = {};
  state.isAttacking = false;
  state.currentTarget = null;

  bot.setControlState('forward', false);
  bot.setControlState('sprint', false);

  log.debug('Auto-defense listeners cleaned up', { username: bot.username });
}
