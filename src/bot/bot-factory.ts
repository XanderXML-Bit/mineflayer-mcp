/**
 * Bot factory for creating and configuring Mineflayer bots
 */

import mineflayer, { Bot } from 'mineflayer';
import pathfinderPkg from 'mineflayer-pathfinder';

import type { ManagedBot, CreateBotOptions } from '../types/index.js';
import type { AppConfig } from '../config/index.js';
import { initializeStatusState, getLastDamageSource } from '../services/status.service.js';
import { attachEventListeners } from '../services/event.service.js';
import { recordDeath } from '../services/death-recovery.service.js';
import {
  initializeInterruptionManager,
  cleanupInterruptionListeners,
} from '../services/interruption-manager.js';
import { initializeAutoArmor, cleanupAutoArmor } from '../services/auto-armor.service.js';
import { initializeSmartEat, cleanupSmartEat } from '../services/smart-eat.service.js';
import { initializeTotemService, cleanupTotemService } from '../services/totem.service.js';
import { initializeShieldService, cleanupShieldService } from '../services/shield.service.js';
import { initializeMLGWater, cleanupMLGWater } from '../services/mlg-water.service.js';
import { initializeBedSpawnService } from '../services/bed-spawn.service.js';
import { initializeTridentService } from '../services/trident.service.js';
import { initializeElytraService, cleanupElytraService } from '../services/elytra.service.js';
import { initializeSchematicService } from '../services/schematic.service.js';
import { logger } from '../utils/logger.js';

const log = logger.child('bot-factory');

// Handle CJS interop for plugins
const pathfinder = (pathfinderPkg as { pathfinder: (bot: Bot) => void }).pathfinder;

/**
 * Load plugins into a bot
 */
function loadPlugins(bot: Bot): void {
  try {
    bot.loadPlugin(pathfinder);
    log.debug('Loaded pathfinder plugin');
  } catch (err) {
    log.warn('Failed to load pathfinder plugin', { error: err });
  }
}

/**
 * Set up event handlers for a bot
 */
function setupEventHandlers(bot: Bot, config: AppConfig): void {
  const managed = bot as ManagedBot;

  // Initialize status tracking
  initializeStatusState(bot);

  // Attach event listeners for AI notifications
  attachEventListeners(bot, config);

  // Initialize interruption manager for task interruption conditions
  initializeInterruptionManager(bot);

  // Initialize auto-armor for automatic armor management
  initializeAutoArmor(bot, { enabled: true });

  // Initialize smart eating (with flee-before-eat logic)
  initializeSmartEat(bot, {
    enabled: config.bot.autoEat.enabled,
    minHunger: config.bot.autoEat.minHunger,
  });

  // Initialize totem of undying auto-equip
  initializeTotemService(bot, {
    enabled: config.bot.totem.enabled,
    healthThreshold: config.bot.totem.healthThreshold,
    alwaysEquip: config.bot.totem.alwaysEquip,
  });

  // Initialize MLG water bucket (fall damage prevention)
  initializeMLGWater(bot, {
    enabled: config.bot.mlgWater.enabled,
    minFallDistance: config.bot.mlgWater.minFallDistance,
    autoPickup: config.bot.mlgWater.autoPickup,
  });

  // Initialize bed spawn management
  initializeBedSpawnService(bot);

  // Initialize trident features (riptide, channeling)
  initializeTridentService(bot);

  // Initialize elytra flight
  initializeElytraService(bot, {
    enabled: config.bot.elytra.enabled,
    minAltitude: config.bot.elytra.minAltitude,
    autoBoost: config.bot.elytra.autoBoost,
    minDurabilityPercent: config.bot.elytra.minDurabilityPercent,
  });

  // Initialize schematic building
  initializeSchematicService(bot);

  // Load minecraft-data on login
  bot.on('login', async () => {
    try {
      const mcData = await import('minecraft-data');
      managed.__mcdata = mcData.default(bot.version) as unknown as typeof managed.__mcdata;
      log.info(`Bot logged in as ${bot.username} (version ${bot.version})`);
    } catch (err) {
      log.error('Failed to initialize minecraft-data', { error: err });
    }
  });

  // Self-defense setup
  if (config.bot.selfDefense.enabled) {
    setupSelfDefense(bot, config);
  }

  // Auto-shield setup
  if (config.bot.autoShield.enabled) {
    setupAutoShield(bot, config);
  }

  // Auto-behaviors setup
  if (config.autoBehaviors.autoCollect.enabled) {
    setupAutoCollect(bot, config);
  }
  if (config.autoBehaviors.autoSurface.enabled) {
    setupAutoSurface(bot, config);
  }
  if (config.autoBehaviors.autoRetreat.enabled) {
    setupAutoRetreat(bot, config);
  }
  if (config.autoBehaviors.stuckRecovery.enabled) {
    setupStuckRecovery(bot, config);
  }
  if (config.autoBehaviors.autoTorch.enabled) {
    setupAutoTorch(bot, config);
  }
  if (config.autoBehaviors.autoPosition.enabled) {
    setupAutoPosition(bot, config);
  }

  // Death recovery tracking (always enabled for item recovery)
  setupDeathRecovery(bot, config);

  // Error handling
  bot.on('error', (err) => {
    log.error('Bot error', { error: err, username: bot.username });
  });

  bot.on('kicked', (reason) => {
    log.warn('Bot kicked', { reason, username: bot.username });
  });

  bot.on('end', () => {
    log.info('Bot disconnected', { username: bot.username });
  });
}

/**
 * Set up self-defense behavior
 * Uses native bot.attack() instead of pvp plugin
 */
function setupSelfDefense(bot: Bot, config: AppConfig): void {
  const managed = bot as ManagedBot;
  const hostileMobs = config.bot.selfDefense.hostileMobs;

  bot.on('entityHurt', (entity) => {
    if (entity !== bot.entity) return;
    if (managed.__defenseActive) return;

    // Find attacker
    const attacker = Object.values(bot.entities).find((e) => {
      if (!e || e === bot.entity) return false;
      const dist = e.position?.distanceTo(bot.entity.position) ?? Infinity;
      if (dist > 8) return false;

      const name = (e.name || '').toLowerCase();
      return hostileMobs.some((h) => name.includes(h)) || e.type === 'player';
    });

    if (attacker) {
      managed.__defenseActive = true;
      log.debug('Self-defense triggered', { attacker: attacker.name });

      // Simple attack loop using native bot.attack()
      const attackInterval = setInterval(async () => {
        try {
          // Check if target still exists and in range
          const target = bot.entities[attacker.id];
          if (!target || !target.position) {
            clearInterval(attackInterval);
            managed.__defenseActive = false;
            return;
          }

          const distance = target.position.distanceTo(bot.entity.position);
          if (distance > 6) {
            clearInterval(attackInterval);
            managed.__defenseActive = false;
            return;
          }

          // Look at and attack target
          await bot.lookAt(target.position.offset(0, target.height * 0.8, 0));
          await bot.attack(target);
        } catch {
          // Target may have died
          clearInterval(attackInterval);
          managed.__defenseActive = false;
        }
      }, 500); // Attack every 500ms (respects attack cooldown)

      // Stop after duration
      setTimeout(() => {
        clearInterval(attackInterval);
        managed.__defenseActive = false;
      }, config.bot.selfDefense.durationMs);
    }
  });
}

/**
 * Set up auto-shield behavior using the new shield service
 */
function setupAutoShield(bot: Bot, _config: AppConfig): void {
  // Use the new sophisticated shield service
  initializeShieldService(bot, {
    enabled: true,
    autoBlockRange: 6,
    counterAttackWindowMs: 400,
  });
  log.debug('Auto-shield enabled with shield service');
}

/**
 * Set up auto-collect behavior - collect items after mining
 */
function setupAutoCollect(bot: Bot, config: AppConfig): void {
  const managed = bot as ManagedBot;
  const collectConfig = config.autoBehaviors.autoCollect;

  bot.on('diggingCompleted', async (_block) => {
    // Don't collect if in combat or already collecting
    if (managed.__defenseActive) return;
    if (managed.__collecting) return;

    managed.__collecting = true;

    try {
      // Wait for drops to spawn
      await new Promise((r) => setTimeout(r, collectConfig.delayMs));

      // Find nearby items
      const items = Object.values(bot.entities).filter((e) => {
        if (!e || e.type !== 'object' || !e.position) return false;
        const dist = e.position.distanceTo(bot.entity.position);
        return dist <= collectConfig.radius && e.objectType === 'Item';
      });

      // Collect each item
      for (const item of items) {
        if (!item.position) continue;
        try {
          const { goals } = await import('mineflayer-pathfinder');
          const goal = new goals.GoalNear(
            item.position.x,
            item.position.y,
            item.position.z,
            0.5
          );
          await bot.pathfinder?.goto(goal);
        } catch {
          // Item may have been picked up already
        }
      }
    } catch (err) {
      log.debug('Auto-collect error', { error: err });
    } finally {
      managed.__collecting = false;
    }
  });

  log.debug('Auto-collect enabled', { radius: collectConfig.radius });
}

/**
 * Check if bot is in water
 */
function isInWater(bot: Bot): boolean {
  if (!bot.entity) return false;
  const block = bot.blockAt(bot.entity.position);
  return block?.name?.includes('water') ?? false;
}

/**
 * Register an interval on a managed bot for cleanup on destroy
 */
function registerInterval(bot: Bot, interval: ReturnType<typeof setInterval>): void {
  const managed = bot as ManagedBot;
  if (!managed.__intervals) {
    managed.__intervals = [];
  }
  managed.__intervals.push(interval);
}

/**
 * Set up auto-surface behavior - swim up when drowning
 */
function setupAutoSurface(bot: Bot, config: AppConfig): void {
  const managed = bot as ManagedBot;
  const surfaceConfig = config.autoBehaviors.autoSurface;

  // Check oxygen level periodically
  const checkInterval = setInterval(() => {
    if (!bot.entity) return;

    const oxygen = bot.oxygenLevel ?? 20;
    const inWater = isInWater(bot);
    if (oxygen <= surfaceConfig.oxygenThreshold && inWater) {
      if (managed.__surfacing) return;
      managed.__surfacing = true;

      log.debug('Auto-surface triggered', { oxygen });

      // Swim up
      const swimUp = async () => {
        try {
          bot.setControlState('jump', true);

          // Keep jumping until out of water or oxygen restored
          while (isInWater(bot) && (bot.oxygenLevel ?? 20) < 10) {
            await new Promise((r) => setTimeout(r, 100));
          }

          bot.setControlState('jump', false);
        } catch {
          // Ignore errors during surface attempt
        } finally {
          managed.__surfacing = false;
        }
      };

      swimUp();
    }
  }, 500);

  // Register for cleanup and also clear on bot end
  registerInterval(bot, checkInterval);
  bot.once('end', () => clearInterval(checkInterval));

  log.debug('Auto-surface enabled', { oxygenThreshold: surfaceConfig.oxygenThreshold });
}

/**
 * Set up auto-retreat behavior - retreat on low health
 */
function setupAutoRetreat(bot: Bot, config: AppConfig): void {
  const managed = bot as ManagedBot;
  const retreatConfig = config.autoBehaviors.autoRetreat;

  bot.on('health', () => {
    if (bot.health >= retreatConfig.healthThreshold) return;
    if (managed.__retreating) return;
    if (!managed.__defenseActive) return; // Only retreat if in combat

    managed.__retreating = true;
    log.debug('Auto-retreat triggered', { health: bot.health });

    const retreat = async () => {
      try {
        // Stop attacking by clearing defense flag (attack loops check this)
        managed.__defenseActive = false;

        // Find direction away from nearest threat
        const threats = Object.values(bot.entities).filter((e) => {
          if (!e || e === bot.entity || !e.position) return false;
          const dist = e.position.distanceTo(bot.entity.position);
          return dist < 10 && (e.type === 'hostile' || e.type === 'mob');
        });

        if (threats.length > 0 && threats[0].position) {
          // Move away from nearest threat
          const threat = threats[0];
          const dx = bot.entity.position.x - threat.position.x;
          const dz = bot.entity.position.z - threat.position.z;
          const len = Math.sqrt(dx * dx + dz * dz) || 1;

          const targetX = bot.entity.position.x + (dx / len) * retreatConfig.retreatDistance;
          const targetZ = bot.entity.position.z + (dz / len) * retreatConfig.retreatDistance;

          try {
            const { goals } = await import('mineflayer-pathfinder');
            const goal = new goals.GoalNear(targetX, bot.entity.position.y, targetZ, 2);
            await bot.pathfinder?.goto(goal);
          } catch {
            // Pathfinding may fail, ignore
          }
        }
      } catch (err) {
        log.debug('Auto-retreat error', { error: err });
      } finally {
        managed.__defenseActive = false;
        managed.__retreating = false;
      }
    };

    retreat();
  });

  log.debug('Auto-retreat enabled', { healthThreshold: retreatConfig.healthThreshold });
}

/**
 * Set up stuck recovery behavior - detect and recover from stuck states
 */
function setupStuckRecovery(bot: Bot, config: AppConfig): void {
  const stuckConfig = config.autoBehaviors.stuckRecovery;

  let lastPosition = { x: 0, y: 0, z: 0 };
  let stuckTime = 0;
  let jumpAttempts = 0;

  const checkInterval = setInterval(() => {
    if (!bot.entity) return;

    const pos = bot.entity.position;
    const pf = bot.pathfinder;

    // Only check if actively navigating
    if (!pf?.isMoving?.()) {
      lastPosition = { x: pos.x, y: pos.y, z: pos.z };
      stuckTime = 0;
      jumpAttempts = 0;
      return;
    }

    // Check if position changed
    const moved =
      Math.abs(pos.x - lastPosition.x) > 0.1 ||
      Math.abs(pos.y - lastPosition.y) > 0.1 ||
      Math.abs(pos.z - lastPosition.z) > 0.1;

    if (moved) {
      lastPosition = { x: pos.x, y: pos.y, z: pos.z };
      stuckTime = 0;
      jumpAttempts = 0;
    } else {
      stuckTime += 500;

      if (stuckTime >= stuckConfig.timeoutMs) {
        log.debug('Stuck detected, attempting recovery', { jumpAttempts });

        if (jumpAttempts < stuckConfig.jumpAttempts) {
          // Try jumping
          bot.setControlState('jump', true);
          setTimeout(() => bot.setControlState('jump', false), 300);
          jumpAttempts++;
        } else {
          // Stop and let pathfinder recalculate
          try {
            pf.stop?.();
          } catch {
            // Pathfinder may not be available
          }
          jumpAttempts = 0;
        }

        stuckTime = 0;
      }
    }
  }, 500);

  // Register for cleanup and also clear on bot end
  registerInterval(bot, checkInterval);
  bot.once('end', () => clearInterval(checkInterval));

  log.debug('Stuck recovery enabled', { timeoutMs: stuckConfig.timeoutMs });
}

/**
 * Set up auto-torch behavior - place torches in darkness
 */
function setupAutoTorch(bot: Bot, config: AppConfig): void {
  const torchConfig = config.autoBehaviors.autoTorch;

  const checkInterval = setInterval(async () => {
    if (!bot.entity) return;

    try {
      // Get block at bot's feet
      const blockBelow = bot.blockAt(bot.entity.position.offset(0, -1, 0));
      if (!blockBelow) return;

      // Get light level at bot position
      const lightLevel = bot.blockAt(bot.entity.position)?.light ?? 15;

      if (lightLevel < torchConfig.lightThreshold) {
        // Check if we have torches
        const torchItem = bot.inventory.items().find((i) => i.name.includes('torch'));
        if (!torchItem) return;

        // Find a valid place for torch
        const placeBlock = bot.blockAt(bot.entity.position.offset(0, -1, 0));
        if (!placeBlock || placeBlock.name === 'air') return;

        // Equip and place torch
        try {
          const { Vec3 } = await import('vec3');
          await bot.equip(torchItem, 'hand');
          await bot.placeBlock(placeBlock, new Vec3(0, 1, 0));
          log.debug('Auto-torch placed', { lightLevel, position: bot.entity.position });
        } catch {
          // May fail if can't place there
        }
      }
    } catch (err) {
      log.debug('Auto-torch error', { error: err });
    }
  }, torchConfig.checkIntervalMs);

  // Register for cleanup and also clear on bot end
  registerInterval(bot, checkInterval);
  bot.once('end', () => clearInterval(checkInterval));

  log.debug('Auto-torch enabled', { lightThreshold: torchConfig.lightThreshold });
}

/**
 * Set up auto-position behavior - move before placing blocks
 */
function setupAutoPosition(bot: Bot, _config: AppConfig): void {
  // Defer wrapping until bot is spawned (placeBlock not available until then)
  bot.once('spawn', () => {
    if (!bot.placeBlock) {
      log.warn('placeBlock not available, skipping auto-position setup');
      return;
    }

    // Wrap placeBlock to check position first
    const originalPlaceBlock = bot.placeBlock.bind(bot);

    // Override placeBlock with position-aware version
    bot.placeBlock = async (
      referenceBlock: Parameters<typeof originalPlaceBlock>[0],
      faceVector: Parameters<typeof originalPlaceBlock>[1]
    ): Promise<void> => {
      if (!bot.entity) {
        return originalPlaceBlock(referenceBlock, faceVector);
      }

      // Calculate where the block would be placed
      const targetPos = referenceBlock.position.plus(faceVector);

      // Check if bot is standing where block would go
      const botPos = bot.entity.position.floored();
      const botPosAbove = botPos.offset(0, 1, 0);

      if (
        (targetPos.x === botPos.x && targetPos.y === botPos.y && targetPos.z === botPos.z) ||
        (targetPos.x === botPosAbove.x && targetPos.y === botPosAbove.y && targetPos.z === botPosAbove.z)
      ) {
        log.debug('Auto-position triggered - bot in the way');

        // Move to an adjacent position
        const directions = [
          { x: 1, z: 0 },
          { x: -1, z: 0 },
          { x: 0, z: 1 },
          { x: 0, z: -1 },
        ];

        for (const dir of directions) {
          const newPos = bot.entity.position.offset(dir.x, 0, dir.z);
          const blockAtNewPos = bot.blockAt(newPos);
          const blockAboveNewPos = bot.blockAt(newPos.offset(0, 1, 0));

          // Check if we can stand there
          if (
            blockAtNewPos &&
            blockAtNewPos.name !== 'air' &&
            blockAboveNewPos &&
            blockAboveNewPos.name === 'air'
          ) {
            try {
              const { goals } = await import('mineflayer-pathfinder');
              const goal = new goals.GoalNear(newPos.x, newPos.y, newPos.z, 0.5);
              await bot.pathfinder?.goto(goal);
              break;
            } catch {
              continue;
            }
          }
        }
      }

      return originalPlaceBlock(referenceBlock, faceVector);
    };

    log.debug('Auto-position enabled');
  }); // end spawn handler
}

/**
 * Set up death recovery auto-behavior - records death for later recovery
 */
function setupDeathRecovery(bot: Bot, _config: AppConfig): void {
  bot.on('death', () => {
    const cause = getLastDamageSource(bot);
    recordDeath(bot, cause);
    log.info('Death recorded for recovery', { cause });
  });

  log.debug('Death recovery tracking enabled');
}

/**
 * Create a new bot instance
 */
export async function createBot(
  options: CreateBotOptions,
  config: AppConfig
): Promise<Bot> {
  const host = options.host || config.bot.defaults.host;
  const port = options.port || config.bot.defaults.port;

  log.info('Creating bot', { username: options.username, host, port });

  const bot = mineflayer.createBot({
    host,
    port,
    username: options.username,
    version: options.version,
  });

  // Load plugins
  loadPlugins(bot);

  // Set up event handlers
  setupEventHandlers(bot, config);

  // Wait for spawn
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Bot spawn timeout'));
    }, 30000);

    bot.once('spawn', () => {
      clearTimeout(timeout);
      resolve();
    });

    bot.once('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    bot.once('kicked', (reason) => {
      clearTimeout(timeout);
      reject(new Error(`Kicked: ${reason}`));
    });
  });

  log.info('Bot spawned successfully', { username: bot.username });

  return bot;
}

/**
 * Destroy a bot instance
 */
export function destroyBot(bot: Bot): void {
  const managed = bot as ManagedBot;

  // Clear all registered intervals to prevent memory leaks
  if (managed.__intervals) {
    for (const interval of managed.__intervals) {
      try {
        clearInterval(interval);
      } catch {}
    }
    managed.__intervals = [];
    log.debug('Cleared registered intervals', { username: bot.username });
  }

  // Clean up interruption manager listeners
  try {
    cleanupInterruptionListeners(bot);
  } catch {}

  // Clean up auto-armor
  try {
    cleanupAutoArmor(bot);
  } catch {}

  // Clean up smart-eat
  try {
    cleanupSmartEat(bot);
  } catch {}

  // Clean up totem service
  try {
    cleanupTotemService(bot);
  } catch {}

  // Clean up shield service
  try {
    cleanupShieldService(bot);
  } catch {}

  // Clean up MLG water service
  try {
    cleanupMLGWater(bot);
  } catch {}

  // Clean up elytra service
  try {
    cleanupElytraService(bot);
  } catch {}

  try {
    bot.quit();
  } catch {}

  try {
    bot.end();
  } catch {}

  log.info('Bot destroyed', { username: bot.username });
}
