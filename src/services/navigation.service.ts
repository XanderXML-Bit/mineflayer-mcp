/**
 * Navigation service for pathfinding and movement
 */

import type { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import type { NavigationConfig } from '../types/index.js';
// NavigationError removed - not currently used
import { logger } from '../utils/logger.js';
import { createDeadline, sleep } from '../utils/timeout.js';
import { createEquipmentService } from './equipment.service.js';
import { pickupNearbyDrops } from '../utils/mining-helpers.js';

const log = logger.child('navigation');

// Import mineflayer-pathfinder types
import pathfinderPkg from 'mineflayer-pathfinder';
import type { Block } from 'prismarine-block';
import type { Entity } from 'prismarine-entity';
const { Movements, goals } = pathfinderPkg;

/** Navigation result */
export interface NavigationResult {
  success: boolean;
  arrived: boolean;
  finalDistance: number;
  timedOut: boolean;
  reason?: string;
  recoveryAttempts: number;
}

/** Navigation options */
export interface NavigationOptions {
  range?: number;
  timeout?: number;
  allowParkour?: boolean;
  allowSprinting?: boolean;
  canDig?: boolean;
  maxDropDown?: number;
  signal?: AbortSignal;
}

/**
 * Configure movement defaults for pathfinding
 */
export function configureMovements(bot: Bot, config: Partial<NavigationConfig> = {}): InstanceType<typeof Movements> {
  const movements = new Movements(bot);

  try {
    movements.allowParkour = config.allowParkour ?? false;
    movements.allowSprinting = config.allowSprinting ?? true;
    movements.canDig = config.canDig ?? true;
    movements.maxDropDown = Math.min(config.maxDropDown ?? 3, movements.maxDropDown ?? 3);
  } catch {
    // Ignore configuration errors
  }

  return movements;
}

/**
 * Attempt to unstick a stuck bot
 */
export async function attemptUnstuck(bot: Bot): Promise<boolean> {
  log.debug('Attempting to unstick bot');

  try {
    // Strategy 1: Random direction wiggle
    const directions: Array<'forward' | 'back' | 'left' | 'right'> = ['forward', 'back', 'left', 'right'];
    const randomDir = directions[Math.floor(Math.random() * directions.length)];

    bot.setControlState(randomDir, true);
    await sleep(200);
    bot.setControlState(randomDir, false);

    // Strategy 2: Jump
    bot.setControlState('jump', true);
    await sleep(100);
    bot.setControlState('jump', false);

    // Strategy 3: Break block above if stuck
    const headPos = bot.entity.position.offset(0, 1, 0).floored();
    const blockAbove = bot.blockAt(headPos);

    // Check if block is solid and not liquid (liquid blocks have boundingBox === 'empty')
    const isLiquid = blockAbove?.name.includes('water') || blockAbove?.name.includes('lava');
    if (blockAbove && blockAbove.boundingBox !== 'empty' && !isLiquid) {
      try {
        // Auto-equip best tool for the block
        const equipment = createEquipmentService();
        await equipment.equipBestToolForBlock(bot, blockAbove.name);
        const blockPos = blockAbove.position.clone();
        await bot.dig(blockAbove);
        log.debug('Broke block above head');
        // Auto-pickup dropped items
        await sleep(50);
        await pickupNearbyDrops(bot, blockPos, 4, 2000);
      } catch {
        // Ignore dig errors
      }
    }

    return true;
  } catch (error) {
    log.warn('Unstick attempt failed', { error });
    return false;
  }
}

/**
 * Navigation service class
 */
export class NavigationService {
  private config: NavigationConfig;

  constructor(config: Partial<NavigationConfig> = {}) {
    this.config = {
      allowParkour: config.allowParkour ?? false,
      allowSprinting: config.allowSprinting ?? true,
      canDig: config.canDig ?? true,
      maxDropDown: config.maxDropDown ?? 3,
      unstuckTimeoutMs: config.unstuckTimeoutMs ?? 15000,
    };
  }

  /**
   * Navigate to a specific position
   */
  async goToPosition(
    bot: Bot,
    target: Vec3,
    options: NavigationOptions = {}
  ): Promise<NavigationResult> {
    const range = options.range ?? 1;
    const timeout = options.timeout ?? 60000;
    const deadline = createDeadline(timeout);

    const movements = configureMovements(bot, {
      allowParkour: options.allowParkour ?? this.config.allowParkour,
      allowSprinting: options.allowSprinting ?? this.config.allowSprinting,
      canDig: options.canDig ?? this.config.canDig,
      maxDropDown: options.maxDropDown ?? this.config.maxDropDown,
    });

    bot.pathfinder.setMovements(movements);
    bot.pathfinder.setGoal(new goals.GoalNear(target.x, target.y, target.z, range));

    let lastProgressAt = Date.now();
    let bestDistance = Infinity;
    let recoveryAttempts = 0;

    while (!deadline.isExpired()) {
      // Check for abort signal
      if (options.signal?.aborted) {
        bot.pathfinder.stop();
        return {
          success: false,
          arrived: false,
          finalDistance: bot.entity.position.distanceTo(target),
          timedOut: false,
          reason: 'aborted',
          recoveryAttempts,
        };
      }

      const currentDistance = bot.entity.position.distanceTo(target);

      // Check if arrived
      if (currentDistance <= Math.max(1, range) + 0.5) {
        return {
          success: true,
          arrived: true,
          finalDistance: currentDistance,
          timedOut: false,
          recoveryAttempts,
        };
      }

      // Track progress
      if (currentDistance + 0.25 < bestDistance) {
        bestDistance = currentDistance;
        lastProgressAt = Date.now();
      }

      // Check for stuck condition
      const stuckDuration = Date.now() - lastProgressAt;
      if (stuckDuration > this.config.unstuckTimeoutMs) {
        log.debug('Bot appears stuck, attempting recovery');
        await attemptUnstuck(bot);
        recoveryAttempts++;
        bestDistance = Infinity;
        lastProgressAt = Date.now();

        // Re-issue goal
        bot.pathfinder.setGoal(new goals.GoalNear(target.x, target.y, target.z, range));
      }

      await bot.waitForTicks(5);
    }

    // Timed out
    bot.pathfinder.stop();
    return {
      success: false,
      arrived: false,
      finalDistance: bot.entity.position.distanceTo(target),
      timedOut: true,
      reason: 'timeout',
      recoveryAttempts,
    };
  }

  /**
   * Navigate to find a block matching a predicate
   */
  async goToBlock(
    bot: Bot,
    predicate: (block: Block) => boolean,
    options: NavigationOptions & { maxDistance?: number } = {}
  ): Promise<{ success: boolean; block: Block | null }> {
    const maxDistance = options.maxDistance ?? 32;

    const block = bot.findBlock({
      matching: (b) => b !== null && predicate(b),
      maxDistance,
    });

    if (!block) {
      return { success: false, block: null };
    }

    const pos = block.position;
    const target = new Vec3(pos.x, pos.y, pos.z);

    const result = await this.goToPosition(bot, target, options);

    return {
      success: result.arrived,
      block: result.arrived ? block : null,
    };
  }

  /**
   * Follow an entity
   */
  async followEntity(
    bot: Bot,
    entity: Entity,
    options: { distance?: number; timeout?: number; signal?: AbortSignal } = {}
  ): Promise<void> {
    const distance = options.distance ?? 2;
    const movements = configureMovements(bot, this.config);

    bot.pathfinder.setMovements(movements);
    bot.pathfinder.setGoal(new goals.GoalFollow(entity, distance), true);
  }

  /**
   * Stop following
   */
  stopFollow(bot: Bot): void {
    bot.pathfinder.stop();
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<NavigationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): NavigationConfig {
    return { ...this.config };
  }
}

/**
 * Create a navigation service
 */
export function createNavigationService(config?: Partial<NavigationConfig>): NavigationService {
  return new NavigationService(config);
}

/**
 * Navigate to a block matching a predicate (standalone helper)
 */
export async function pathfindToPredicate(
  bot: Bot,
  predicate: (b: Block) => boolean,
  maxDistance = 32,
  range = 1,
  timeoutMs = 45000
): Promise<Block> {
  const block = bot.findBlock({
    matching: (b) => b !== null && predicate(b),
    maxDistance,
  });

  if (!block) {
    throw new Error('Target not found nearby');
  }

  const pos = block.position;
  const movements = configureMovements(bot);
  bot.pathfinder.setMovements(movements);
  bot.pathfinder.setGoal(new goals.GoalNear(pos.x, pos.y, pos.z, range));

  const start = Date.now();
  const idleMs = 15000;
  let lastProgressAt = start;
  let best = Infinity;

  while (Date.now() - start < timeoutMs) {
    const dist = bot.entity.position.distanceTo(new Vec3(pos.x, pos.y, pos.z));
    if (dist <= Math.max(1, range) + 0.5) break;

    if (dist + 0.25 < best) {
      best = dist;
      lastProgressAt = Date.now();
    }

    if (Date.now() - lastProgressAt > idleMs) {
      await attemptUnstuck(bot);
      best = Infinity;
      lastProgressAt = Date.now();
    }

    await bot.waitForTicks(5);
  }

  if (Date.now() - start >= timeoutMs) {
    throw new Error('navigation_timeout');
  }

  return block;
}

/**
 * Wait for bot to arrive at a position (navigation already started)
 * This is a common pattern extracted from multiple tools.
 *
 * @param bot - The bot instance
 * @param targetPos - Target position to reach
 * @param options - Wait options
 * @returns true if arrived within distance, false if timed out
 */
export async function waitForNavigation(
  bot: Bot,
  targetPos: Vec3 | { x: number; y: number; z: number },
  options: {
    timeoutMs?: number;
    arrivedDistance?: number;
    tickInterval?: number;
  } = {}
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 20000;
  const arrivedDistance = options.arrivedDistance ?? 2.5;
  const tickInterval = options.tickInterval ?? 5;

  const target = targetPos instanceof Vec3
    ? targetPos
    : new Vec3(targetPos.x, targetPos.y, targetPos.z);

  const navStart = Date.now();
  while (Date.now() - navStart < timeoutMs) {
    const distance = bot.entity.position.distanceTo(target);
    if (distance <= arrivedDistance) {
      return true;
    }
    await bot.waitForTicks(tickInterval);
  }

  return false;
}
