/**
 * Totem of Undying Service
 *
 * Automatically equips a Totem of Undying in the offhand when:
 * - Health drops below a configurable threshold
 * - A totem is available in inventory
 * - Offhand is empty or contains a less critical item
 *
 * This provides automatic death prevention for the bot.
 */

import type { Bot } from 'mineflayer';
import type { Item } from 'prismarine-item';
import { logger } from '../utils/logger.js';
import { pushEvent } from './event.service.js';

const log = logger.child('totem-service');

/** Totem service configuration */
export interface TotemConfig {
  /** Whether totem auto-equip is enabled */
  enabled: boolean;
  /** Health threshold to trigger totem equip (0-20) */
  healthThreshold: number;
  /** Always keep totem equipped regardless of health */
  alwaysEquip: boolean;
  /** Check interval in milliseconds */
  checkIntervalMs: number;
  /** Items that can be replaced in offhand for totem */
  replaceableOffhandItems: string[];
}

/** Default configuration */
export const DEFAULT_TOTEM_CONFIG: TotemConfig = {
  enabled: true,
  healthThreshold: 10, // Equip when health drops below 10 (half health)
  alwaysEquip: false, // Only equip when health is low by default
  checkIntervalMs: 500, // Check every 500ms for responsive protection
  replaceableOffhandItems: [
    'shield', // Shield can be replaced if health is critical
    'torch',
    'map',
    'compass',
    'clock',
    'spyglass',
  ],
};

/** Totem service state */
interface TotemState {
  config: TotemConfig;
  checkInterval?: ReturnType<typeof setInterval>;
  isEquipping: boolean;
  lastEquipTime: number;
  totemUsedCount: number;
  /** Stored listener reference for cleanup */
  entityStatusListener?: (entity: unknown, status: number) => void;
  /** Pending timeout for re-equip after totem use */
  reequipTimeout?: ReturnType<typeof setTimeout>;
}

/** Extended bot type with totem state */
interface BotWithTotemState extends Bot {
  __totemState?: TotemState;
}

/** Get or create totem state for a bot */
function getTotemState(bot: Bot): TotemState {
  const managed = bot as BotWithTotemState;
  if (!managed.__totemState) {
    managed.__totemState = {
      config: { ...DEFAULT_TOTEM_CONFIG },
      isEquipping: false,
      lastEquipTime: 0,
      totemUsedCount: 0,
    };
  }
  return managed.__totemState;
}

/**
 * Find a Totem of Undying in inventory
 */
function findTotemInInventory(bot: Bot): Item | null {
  const items = bot.inventory.items();
  return items.find((item) => item.name === 'totem_of_undying') || null;
}

/**
 * Check if offhand currently has a totem
 */
function hasTotemInOffhand(bot: Bot): boolean {
  const offhand = bot.inventory.slots[45]; // Offhand slot
  return offhand?.name === 'totem_of_undying';
}

/**
 * Get current offhand item
 */
function getOffhandItem(bot: Bot): Item | null {
  return bot.inventory.slots[45] || null;
}

/**
 * Check if offhand item can be replaced
 */
function canReplaceOffhand(bot: Bot, config: TotemConfig): boolean {
  const offhand = getOffhandItem(bot);
  if (!offhand) return true; // Empty offhand

  // Check if item is in replaceable list
  return config.replaceableOffhandItems.includes(offhand.name);
}

/**
 * Equip totem to offhand
 */
async function equipTotem(bot: Bot, totem: Item): Promise<boolean> {
  const state = getTotemState(bot);
  if (state.isEquipping) return false;

  state.isEquipping = true;

  try {
    // Equip to offhand
    await bot.equip(totem, 'off-hand');
    state.lastEquipTime = Date.now();

    pushEvent(bot, 'tool_switched', {
      action: 'totem_equipped',
      slot: 'off-hand',
      item: 'totem_of_undying',
      health: bot.health,
      reason: bot.health < state.config.healthThreshold ? 'low_health' : 'always_equip',
    });

    log.info('Totem equipped', { health: bot.health });
    return true;
  } catch (error) {
    log.debug('Failed to equip totem', { error });
    return false;
  } finally {
    state.isEquipping = false;
  }
}

/**
 * Main check - called periodically
 */
async function checkAndEquipTotem(bot: Bot): Promise<void> {
  const state = getTotemState(bot);
  if (!state.config.enabled) return;
  if (state.isEquipping) return;
  if (!bot.entity?.position) return;

  // Already have totem in offhand
  if (hasTotemInOffhand(bot)) return;

  // Check if we should equip
  const shouldEquip =
    state.config.alwaysEquip || bot.health < state.config.healthThreshold;

  if (!shouldEquip) return;

  // Find totem in inventory
  const totem = findTotemInInventory(bot);
  if (!totem) {
    log.debug('No totem available in inventory');
    return;
  }

  // Check if we can replace current offhand item
  if (!canReplaceOffhand(bot, state.config)) {
    log.debug('Cannot replace current offhand item for totem');
    return;
  }

  // Equip the totem
  await equipTotem(bot, totem);
}

/** Bot with entityStatus event - not in standard typings but exists at runtime */
interface BotEntityStatusEvents {
  on(event: 'entityStatus', listener: (entity: unknown, status: number) => void): this;
  removeListener(event: 'entityStatus', listener: (entity: unknown, status: number) => void): this;
}

/**
 * Track totem usage (when bot survives death)
 */
function setupTotemUsageTracking(bot: Bot): void {
  const state = getTotemState(bot);
  const eventBot = bot as unknown as BotEntityStatusEvents;

  // Remove existing listener if any
  if (state.entityStatusListener) {
    eventBot.removeListener('entityStatus', state.entityStatusListener);
  }

  // Create and store the listener
  state.entityStatusListener = (entity: unknown, status: number) => {
    if (entity === bot.entity && status === 35) {
      state.totemUsedCount++;

      pushEvent(bot, 'tool_switched', {
        action: 'totem_used',
        totalUsed: state.totemUsedCount,
        health: bot.health,
      });

      log.info('Totem of Undying activated!', { totalUsed: state.totemUsedCount });

      // Clear any pending re-equip timeout
      if (state.reequipTimeout) {
        clearTimeout(state.reequipTimeout);
      }

      // Immediately try to equip another totem (tracked timeout)
      state.reequipTimeout = setTimeout(() => {
        checkAndEquipTotem(bot).catch(() => {});
      }, 100);
    }
  };

  // Listen for totem use (entityStatus with status 35 = totem activation)
  eventBot.on('entityStatus', state.entityStatusListener);
}

/**
 * Initialize totem service for a bot
 */
export function initializeTotemService(bot: Bot, config?: Partial<TotemConfig>): void {
  const state = getTotemState(bot);

  if (config) {
    state.config = { ...state.config, ...config };
  }

  // Clean up existing interval
  if (state.checkInterval) {
    clearInterval(state.checkInterval);
    state.checkInterval = undefined;
  }

  if (!state.config.enabled) {
    log.debug('Totem service disabled', { username: bot.username });
    return;
  }

  // Set up totem usage tracking
  setupTotemUsageTracking(bot);

  // Set up periodic check
  state.checkInterval = setInterval(() => {
    checkAndEquipTotem(bot).catch((e) => {
      log.debug('Totem check error', { error: e });
    });
  }, state.config.checkIntervalMs);

  // Initial check
  checkAndEquipTotem(bot).catch(() => {});

  log.info('Totem service initialized', { username: bot.username, config: state.config });
}

/**
 * Enable or disable totem service
 */
export function setTotemServiceEnabled(bot: Bot, enabled: boolean): void {
  const state = getTotemState(bot);
  state.config.enabled = enabled;
  initializeTotemService(bot, state.config);
  log.info('Totem service toggled', { username: bot.username, enabled });
}

/**
 * Configure totem service
 */
export function configureTotemService(bot: Bot, config: Partial<TotemConfig>): void {
  const state = getTotemState(bot);
  state.config = { ...state.config, ...config };

  if (state.config.enabled) {
    initializeTotemService(bot, state.config);
  }

  log.debug('Totem service configured', { username: bot.username, config: state.config });
}

/**
 * Get totem service status
 */
export function getTotemStatus(bot: Bot): {
  enabled: boolean;
  config: TotemConfig;
  hasTotemEquipped: boolean;
  totemsInInventory: number;
  totemUsedCount: number;
  health: number;
  shouldEquipNow: boolean;
} {
  const state = getTotemState(bot);
  const totemsInInventory = bot.inventory
    .items()
    .filter((item) => item.name === 'totem_of_undying')
    .reduce((sum, item) => sum + item.count, 0);

  const shouldEquipNow =
    state.config.enabled &&
    !hasTotemInOffhand(bot) &&
    (state.config.alwaysEquip || bot.health < state.config.healthThreshold) &&
    totemsInInventory > 0;

  return {
    enabled: state.config.enabled,
    config: state.config,
    hasTotemEquipped: hasTotemInOffhand(bot),
    totemsInInventory,
    totemUsedCount: state.totemUsedCount,
    health: bot.health,
    shouldEquipNow,
  };
}

/**
 * Force equip totem now (manual trigger)
 */
export async function equipTotemNow(bot: Bot): Promise<boolean> {
  if (hasTotemInOffhand(bot)) return true;

  const totem = findTotemInInventory(bot);
  if (!totem) return false;

  return equipTotem(bot, totem);
}

/**
 * Clean up totem service
 */
export function cleanupTotemService(bot: Bot): void {
  const managed = bot as BotWithTotemState;
  const state = managed.__totemState;

  if (!state) return;

  // Clear check interval
  if (state.checkInterval) {
    clearInterval(state.checkInterval);
    state.checkInterval = undefined;
  }

  // Remove event listener
  if (state.entityStatusListener) {
    const eventBot = bot as unknown as BotEntityStatusEvents;
    eventBot.removeListener('entityStatus', state.entityStatusListener);
    state.entityStatusListener = undefined;
  }

  // Clear pending re-equip timeout
  if (state.reequipTimeout) {
    clearTimeout(state.reequipTimeout);
    state.reequipTimeout = undefined;
  }

  log.debug('Totem service cleaned up', { username: bot.username });
}
