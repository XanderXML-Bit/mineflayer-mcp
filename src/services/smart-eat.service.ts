/**
 * Smart Eat Service
 *
 * Intelligent eating behavior that:
 * - Monitors hunger and health levels
 * - Checks for nearby hostiles before eating
 * - Flees to safe distance if hostiles are near
 * - Eats food when safe
 * - Reports events to agent
 *
 * Replaces mineflayer-auto-eat with smarter combat-aware logic.
 */

import type { Bot } from 'mineflayer';
import type { Entity } from 'prismarine-entity';
import type { Item } from 'prismarine-item';
import type { ManagedBot } from '../types/bot.js';
import { logger } from '../utils/logger.js';
import { pushEvent } from './event.service.js';

const log = logger.child('smart-eat');

/** Bot with smart eat state */
interface BotWithSmartEatState extends ManagedBot {
  __smartEatState?: SmartEatState;
}

/** Bot with pathfinder plugin */
interface BotWithPathfinder {
  pathfinder?: {
    goto: (goal: unknown) => Promise<void>;
  };
}

/** Hostile mob names */
const HOSTILE_MOBS = new Set([
  'zombie', 'skeleton', 'spider', 'creeper', 'enderman', 'witch',
  'zombie_villager', 'drowned', 'husk', 'stray', 'phantom',
  'slime', 'magma_cube', 'blaze', 'ghast', 'wither_skeleton',
  'piglin_brute', 'hoglin', 'zoglin', 'pillager', 'vindicator',
  'evoker', 'ravager', 'vex', 'warden', 'guardian', 'elder_guardian',
  'cave_spider', 'silverfish', 'endermite', 'shulker',
]);

/** Food items ranked by saturation restoration */
const FOOD_PRIORITY: Record<string, number> = {
  enchanted_golden_apple: 100,
  golden_apple: 95,
  golden_carrot: 90,
  cooked_beef: 85,
  steak: 85,
  cooked_porkchop: 80,
  cooked_mutton: 75,
  cooked_salmon: 70,
  cooked_cod: 65,
  cooked_chicken: 60,
  cooked_rabbit: 55,
  bread: 50,
  baked_potato: 45,
  beetroot_soup: 40,
  mushroom_stew: 40,
  rabbit_stew: 85,
  suspicious_stew: 35,
  carrot: 30,
  apple: 25,
  melon_slice: 20,
  sweet_berries: 15,
  glow_berries: 15,
  dried_kelp: 10,
  cookie: 10,
  pumpkin_pie: 50,
  beetroot: 10,
  potato: 5,
  // Raw foods (emergency only)
  beef: 3,
  porkchop: 3,
  mutton: 3,
  chicken: 2,
  rabbit: 2,
  cod: 2,
  salmon: 2,
  tropical_fish: 1,
  pufferfish: 0, // Never eat - causes poison
  rotten_flesh: 1, // Emergency only - causes hunger
  spider_eye: 0, // Never eat - causes poison
  poisonous_potato: 0, // Never eat
};

/** Smart eat configuration */
export interface SmartEatConfig {
  /** Whether smart eating is enabled */
  enabled: boolean;
  /** Minimum hunger level to trigger eating (0-20) */
  minHunger: number;
  /** Minimum health to trigger emergency eating (0-20) */
  emergencyHealthThreshold: number;
  /** Safe distance from hostiles before eating */
  safeDistance: number;
  /** Maximum flee distance */
  maxFleeDistance: number;
  /** Check interval in milliseconds */
  checkIntervalMs: number;
  /** Attack range of most mobs (don't eat within this) */
  hostileAttackRange: number;
}

/** Default configuration */
export const DEFAULT_SMART_EAT_CONFIG: SmartEatConfig = {
  enabled: true,
  minHunger: 14, // Eat when hunger drops below 14 (out of 20)
  emergencyHealthThreshold: 10, // Emergency eat when health is low
  safeDistance: 12, // Flee to 12 blocks away before eating
  maxFleeDistance: 24, // Don't flee more than 24 blocks
  checkIntervalMs: 1000, // Check every second
  hostileAttackRange: 4, // Most mobs attack within 4 blocks
};

/** Smart eat state attached to bot */
interface SmartEatState {
  config: SmartEatConfig;
  checkInterval?: ReturnType<typeof setInterval>;
  isEating: boolean;
  isFleeing: boolean;
  lastEatTime: number;
}

/** Get or create smart eat state for a bot */
function getEatState(bot: Bot): SmartEatState {
  const managed = bot as BotWithSmartEatState;
  if (!managed.__smartEatState) {
    managed.__smartEatState = {
      config: { ...DEFAULT_SMART_EAT_CONFIG },
      isEating: false,
      isFleeing: false,
      lastEatTime: 0,
    };
  }
  return managed.__smartEatState;
}

/**
 * Check if entity is a hostile mob
 */
function isHostile(entity: Entity): boolean {
  if (!entity?.name) return false;
  const name = entity.name.toLowerCase();
  return HOSTILE_MOBS.has(name) || [...HOSTILE_MOBS].some((h) => name.includes(h));
}

/**
 * Find nearby hostile entities
 */
function findNearbyHostiles(bot: Bot, range: number): Entity[] {
  if (!bot.entity?.position) return [];

  return Object.values(bot.entities)
    .filter((e): e is Entity => e !== null && e !== bot.entity && e.position !== null)
    .filter((e) => isHostile(e))
    .filter((e) => e.position.distanceTo(bot.entity.position) <= range)
    .sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position));
}

/**
 * Get distance to nearest hostile
 */
function getNearestHostileDistance(bot: Bot): number {
  const hostiles = findNearbyHostiles(bot, 32);
  if (hostiles.length === 0) return Infinity;
  return hostiles[0].position.distanceTo(bot.entity.position);
}

/**
 * Find best food in inventory
 */
function findBestFood(bot: Bot): Item | null {
  const foods = bot.inventory.items().filter((item) => {
    const priority = FOOD_PRIORITY[item.name];
    return priority !== undefined && priority > 0;
  });

  if (foods.length === 0) return null;

  // Sort by priority (highest first)
  foods.sort((a, b) => {
    const aPriority = FOOD_PRIORITY[a.name] ?? 0;
    const bPriority = FOOD_PRIORITY[b.name] ?? 0;
    return bPriority - aPriority;
  });

  return foods[0];
}

/**
 * Flee from hostiles using basic movement controls (no pathfinder dependency)
 */
async function fleeWithBasicMovement(bot: Bot, dx: number, dz: number, durationMs: number): Promise<void> {
  // Look away from hostiles
  const yaw = Math.atan2(-dx, dz);
  await bot.look(yaw, 0, true);

  // Sprint away
  bot.setControlState('forward', true);
  bot.setControlState('sprint', true);

  await new Promise((r) => setTimeout(r, durationMs));

  bot.setControlState('forward', false);
  bot.setControlState('sprint', false);
}

/**
 * Flee from hostiles to a safe distance
 */
async function fleeToSafety(bot: Bot, config: SmartEatConfig): Promise<boolean> {
  const hostiles = findNearbyHostiles(bot, config.safeDistance);
  if (hostiles.length === 0) return true; // Already safe

  const state = getEatState(bot);
  state.isFleeing = true;

  pushEvent(bot, 'auto_eat_started', {
    action: 'fleeing',
    reason: 'hostiles_nearby',
    hostileCount: hostiles.length,
    nearestHostile: hostiles[0].name,
  });

  try {
    // Calculate flee direction (away from center of hostiles)
    let avgX = 0, avgZ = 0;
    for (const hostile of hostiles) {
      avgX += hostile.position.x;
      avgZ += hostile.position.z;
    }
    avgX /= hostiles.length;
    avgZ /= hostiles.length;

    const dx = bot.entity.position.x - avgX;
    const dz = bot.entity.position.z - avgZ;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;

    // Normalize direction
    const normDx = dx / len;
    const normDz = dz / len;

    // Calculate target position
    const fleeDistance = Math.min(config.safeDistance, config.maxFleeDistance);
    const targetX = bot.entity.position.x + normDx * fleeDistance;
    const targetZ = bot.entity.position.z + normDz * fleeDistance;

    // Check if pathfinder is available and loaded
    const botWithPathfinder = bot as unknown as BotWithPathfinder;
    const pathfinder = botWithPathfinder.pathfinder;
    if (pathfinder && typeof pathfinder.goto === 'function') {
      // Use pathfinder for smarter navigation
      try {
        const { default: pathfinderPkg } = await import('mineflayer-pathfinder');
        const { goals } = pathfinderPkg;
        const goal = new goals.GoalNear(targetX, bot.entity.position.y, targetZ, 2);

        await Promise.race([
          pathfinder.goto(goal),
          new Promise((_, reject) => setTimeout(() => reject(new Error('flee_timeout')), 5000)),
        ]);
      } catch (pathError) {
        // Pathfinder failed, fall back to basic movement
        log.debug('Pathfinder flee failed, using basic movement', { error: pathError });
        await fleeWithBasicMovement(bot, normDx, normDz, 2000);
      }
    } else {
      // No pathfinder available, use basic movement controls
      log.debug('No pathfinder available, using basic movement');
      await fleeWithBasicMovement(bot, normDx, normDz, 2000);
    }

    // Check if we're now safe
    const newDistance = getNearestHostileDistance(bot);
    state.isFleeing = false;

    return newDistance >= config.safeDistance;
  } catch (err) {
    log.debug('Flee failed', { error: err });
    state.isFleeing = false;

    // Even if pathfinding failed, check if we moved far enough
    return getNearestHostileDistance(bot) >= config.hostileAttackRange + 2;
  }
}

/**
 * Eat food safely
 */
async function eatFood(bot: Bot, food: Item): Promise<boolean> {
  const state = getEatState(bot);
  state.isEating = true;

  pushEvent(bot, 'auto_eat_started', {
    food: food.name,
    hunger: bot.food,
    health: bot.health,
  });

  try {
    // Equip food
    await bot.equip(food, 'hand');

    // Start eating
    bot.activateItem(false);

    // Wait for eating to complete (food takes ~1.6 seconds to consume)
    await new Promise((r) => setTimeout(r, 1800));

    // Deactivate in case still held
    try {
      bot.deactivateItem();
    } catch {}

    state.isEating = false;
    state.lastEatTime = Date.now();

    pushEvent(bot, 'auto_eat_finished', {
      food: food.name,
      hunger: bot.food,
      health: bot.health,
      saturation: bot.foodSaturation,
    });

    log.debug('Ate food', { food: food.name, hunger: bot.food });
    return true;
  } catch (err) {
    state.isEating = false;
    log.debug('Failed to eat', { error: err });
    return false;
  }
}

/**
 * Check if bot should eat now
 */
function shouldEat(bot: Bot, config: SmartEatConfig): boolean {
  // Don't eat if full
  if (bot.food >= 20) return false;

  // Emergency eating when low health
  if (bot.health <= config.emergencyHealthThreshold && bot.food < 20) {
    return true;
  }

  // Normal eating when hungry
  return bot.food < config.minHunger;
}

/**
 * Main eat check - called periodically
 */
async function checkAndEat(bot: Bot): Promise<void> {
  const state = getEatState(bot);
  if (!state.config.enabled) return;
  if (state.isEating || state.isFleeing) return;
  if (!bot.entity?.position) return;

  // Check if we should eat
  if (!shouldEat(bot, state.config)) return;

  // Find food
  const food = findBestFood(bot);
  if (!food) {
    log.debug('No food available');
    return;
  }

  // Check for nearby hostiles
  const nearestHostileDistance = getNearestHostileDistance(bot);
  const isEmergency = bot.health <= state.config.emergencyHealthThreshold;

  if (nearestHostileDistance < state.config.hostileAttackRange) {
    // Hostile is in attack range - must flee first
    log.debug('Hostile in attack range, fleeing before eating', {
      distance: nearestHostileDistance,
      isEmergency,
    });

    const reachedSafety = await fleeToSafety(bot, state.config);

    if (!reachedSafety && !isEmergency) {
      // Couldn't reach safety and not emergency - abort
      log.debug('Could not reach safety, aborting eat');
      return;
    }

    // If emergency, eat anyway even if not fully safe
    if (!reachedSafety && isEmergency) {
      log.debug('Emergency eating despite hostiles');
    }
  } else if (nearestHostileDistance < state.config.safeDistance) {
    // Hostile is nearby but not in attack range
    // If emergency, eat now. Otherwise, flee first.
    if (!isEmergency) {
      log.debug('Hostile nearby, fleeing for safety', { distance: nearestHostileDistance });
      const reachedSafety = await fleeToSafety(bot, state.config);
      if (!reachedSafety) {
        log.debug('Could not reach full safety, but proceeding to eat');
      }
    }
  }

  // Now eat
  await eatFood(bot, food);
}

/**
 * Initialize smart eating for a bot
 */
export function initializeSmartEat(bot: Bot, config?: Partial<SmartEatConfig>): void {
  const state = getEatState(bot);

  if (config) {
    state.config = { ...state.config, ...config };
  }

  // Clean up existing interval
  if (state.checkInterval) {
    clearInterval(state.checkInterval);
    state.checkInterval = undefined;
  }

  if (!state.config.enabled) {
    log.debug('Smart eating disabled', { username: bot.username });
    return;
  }

  // Set up periodic check
  state.checkInterval = setInterval(() => {
    checkAndEat(bot).catch((err) => {
      log.debug('Smart eat check error', { error: err });
    });
  }, state.config.checkIntervalMs);

  log.info('Smart eating initialized', { username: bot.username, config: state.config });
}

/**
 * Enable or disable smart eating
 */
export function setSmartEatEnabled(bot: Bot, enabled: boolean): void {
  const state = getEatState(bot);
  state.config.enabled = enabled;
  initializeSmartEat(bot, state.config);
  log.info('Smart eating toggled', { username: bot.username, enabled });
}

/**
 * Configure smart eating
 */
export function configureSmartEat(bot: Bot, config: Partial<SmartEatConfig>): void {
  const state = getEatState(bot);
  state.config = { ...state.config, ...config };

  if (state.config.enabled) {
    initializeSmartEat(bot, state.config);
  }

  log.debug('Smart eating configured', { username: bot.username, config: state.config });
}

/**
 * Get current smart eat status
 */
export function getSmartEatStatus(bot: Bot): {
  enabled: boolean;
  config: SmartEatConfig;
  isEating: boolean;
  isFleeing: boolean;
  hunger: number;
  health: number;
  hasFoodInInventory: boolean;
  bestFood: string | null;
  nearestHostileDistance: number;
  isSafeToEat: boolean;
} {
  const state = getEatState(bot);
  const bestFood = findBestFood(bot);
  const nearestHostileDistance = getNearestHostileDistance(bot);

  return {
    enabled: state.config.enabled,
    config: state.config,
    isEating: state.isEating,
    isFleeing: state.isFleeing,
    hunger: bot.food,
    health: bot.health,
    hasFoodInInventory: bestFood !== null,
    bestFood: bestFood?.name ?? null,
    nearestHostileDistance: nearestHostileDistance === Infinity ? -1 : Math.round(nearestHostileDistance),
    isSafeToEat: nearestHostileDistance >= state.config.hostileAttackRange,
  };
}

/**
 * Force eat now (manual trigger)
 */
export async function eatNow(bot: Bot): Promise<boolean> {
  const state = getEatState(bot);
  if (state.isEating) return false;

  const food = findBestFood(bot);
  if (!food) return false;

  return eatFood(bot, food);
}

/**
 * Clean up smart eat listeners
 */
export function cleanupSmartEat(bot: Bot): void {
  const managed = bot as BotWithSmartEatState;
  const state = managed.__smartEatState;

  if (!state) return;

  if (state.checkInterval) {
    clearInterval(state.checkInterval);
    state.checkInterval = undefined;
  }

  log.debug('Smart eating cleaned up', { username: bot.username });
}
