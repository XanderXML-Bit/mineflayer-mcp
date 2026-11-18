/**
 * Auto-Armor Service
 *
 * Modern replacement for mineflayer-armor-manager.
 * Automatically equips the best available armor from inventory.
 * Reports armor changes to the event system for agent awareness.
 */

import type { Bot } from 'mineflayer';
import type { Item } from 'prismarine-item';
import { logger } from '../utils/logger.js';
import { pushEvent } from './event.service.js';

const log = logger.child('auto-armor');

/** Armor slot types */
type ArmorSlot = 'head' | 'torso' | 'legs' | 'feet';

/** Armor tier rankings (higher = better) */
const ARMOR_TIERS: Record<string, number> = {
  netherite: 6,
  diamond: 5,
  iron: 4,
  chainmail: 3,
  golden: 2,
  gold: 2,
  leather: 1,
};

/** Armor slot patterns for matching item names */
const ARMOR_PATTERNS: Record<ArmorSlot, string[]> = {
  head: ['helmet', 'cap'],
  torso: ['chestplate', 'tunic'],
  legs: ['leggings', 'pants'],
  feet: ['boots'],
};

/** Auto-armor configuration */
export interface AutoArmorConfig {
  /** Whether auto-armor is enabled */
  enabled: boolean;
  /** Check interval in milliseconds */
  checkIntervalMs: number;
  /** Prefer enchanted armor over higher tier */
  preferEnchanted: boolean;
}

/** Default configuration */
export const DEFAULT_AUTO_ARMOR_CONFIG: AutoArmorConfig = {
  enabled: true,
  checkIntervalMs: 2000,
  preferEnchanted: true,
};

/** Auto-armor state attached to bot */
interface AutoArmorState {
  config: AutoArmorConfig;
  checkInterval?: ReturnType<typeof setInterval>;
  lastArmorState: string;
}

/** Bot with auto-armor state */
interface BotWithAutoArmorState extends Bot {
  __autoArmorState?: AutoArmorState;
}

/** Get or create auto-armor state for a bot */
function getArmorState(bot: Bot): AutoArmorState {
  const managed = bot as BotWithAutoArmorState;
  if (!managed.__autoArmorState) {
    managed.__autoArmorState = {
      config: { ...DEFAULT_AUTO_ARMOR_CONFIG },
      lastArmorState: '',
    };
  }
  return managed.__autoArmorState;
}

/**
 * Determine which armor slot an item belongs to
 */
function getArmorSlot(item: Item): ArmorSlot | null {
  const name = item.name.toLowerCase();
  for (const [slot, patterns] of Object.entries(ARMOR_PATTERNS)) {
    if (patterns.some((p) => name.includes(p))) {
      return slot as ArmorSlot;
    }
  }
  return null;
}

/**
 * Get armor tier from item name
 */
function getArmorTier(item: Item): number {
  const name = item.name.toLowerCase();
  for (const [tier, value] of Object.entries(ARMOR_TIERS)) {
    if (name.includes(tier)) {
      return value;
    }
  }
  return 0;
}

/** NBT structure for armor enchantments */
interface ArmorEnchantNBT {
  value?: {
    Enchantments?: {
      value?: {
        value?: Array<{
          lvl?: { value?: number };
          id?: { value?: string };
        }>;
      };
    };
  };
}

/**
 * Get enchantment value for armor comparison
 * Higher value = better enchantments
 */
function getEnchantmentValue(item: Item): number {
  if (!item.nbt) return 0;

  try {
    const nbt = item.nbt as ArmorEnchantNBT;
    const enchants = nbt.value?.Enchantments?.value?.value;
    if (!Array.isArray(enchants)) return 0;

    let value = 0;
    for (const enchant of enchants) {
      const lvl = enchant?.lvl?.value ?? 1;
      value += lvl;

      // Bonus for protection enchantments
      const id = enchant?.id?.value ?? '';
      if (id.includes('protection')) {
        value += lvl * 2;
      }
    }
    return value;
  } catch {
    return 0;
  }
}

/**
 * Compare two armor pieces and return the better one
 */
function compareBetter(
  a: Item | null,
  b: Item | null,
  preferEnchanted: boolean
): Item | null {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;

  const aTier = getArmorTier(a);
  const bTier = getArmorTier(b);
  const aEnch = getEnchantmentValue(a);
  const bEnch = getEnchantmentValue(b);

  if (preferEnchanted) {
    // If enchantment difference is significant, prefer enchanted
    if (aEnch > bEnch + 2) return a;
    if (bEnch > aEnch + 2) return b;
  }

  // Otherwise, prefer higher tier
  if (aTier !== bTier) {
    return aTier > bTier ? a : b;
  }

  // Same tier - prefer more enchantments
  return aEnch >= bEnch ? a : b;
}

/** Inventory with equipment slot method */
interface InventoryWithEquipmentSlot {
  equipmentSlot(slot: string): number;
}

/**
 * Get currently equipped armor item in slot
 */
function getEquippedArmor(bot: Bot, slot: ArmorSlot): Item | null {
  const inventory = bot.inventory;
  const inventoryWithSlot = inventory as unknown as InventoryWithEquipmentSlot;
  const slotIndex = inventoryWithSlot.equipmentSlot(slot);
  return inventory.slots[slotIndex] ?? null;
}

/**
 * Find best armor piece for a slot in inventory
 */
function findBestArmorInInventory(
  bot: Bot,
  slot: ArmorSlot,
  preferEnchanted: boolean
): Item | null {
  const items = bot.inventory.items();
  let best: Item | null = null;

  for (const item of items) {
    const itemSlot = getArmorSlot(item);
    if (itemSlot !== slot) continue;

    best = compareBetter(best, item, preferEnchanted);
  }

  return best;
}

/**
 * Get a string hash of current armor state for change detection
 */
function getArmorHash(bot: Bot): string {
  const slots: ArmorSlot[] = ['head', 'torso', 'legs', 'feet'];
  return slots
    .map((slot) => {
      const item = getEquippedArmor(bot, slot);
      return item ? `${item.name}:${item.count}` : 'empty';
    })
    .join('|');
}

/**
 * Equip best available armor
 */
async function equipBestArmor(bot: Bot): Promise<boolean> {
  const state = getArmorState(bot);
  const slots: ArmorSlot[] = ['head', 'torso', 'legs', 'feet'];
  let changed = false;

  for (const slot of slots) {
    const equipped = getEquippedArmor(bot, slot);
    const best = findBestArmorInInventory(bot, slot, state.config.preferEnchanted);

    if (!best) continue;

    // Compare with current
    const shouldSwap = compareBetter(equipped, best, state.config.preferEnchanted) === best;

    if (shouldSwap && best !== equipped) {
      try {
        await bot.equip(best, slot);
        changed = true;
        log.debug('Equipped armor', { slot, item: best.name });
      } catch (err) {
        log.debug('Failed to equip armor', { slot, item: best.name, error: err });
      }
    }
  }

  // Check for armor state change and push event
  const newHash = getArmorHash(bot);
  if (changed && newHash !== state.lastArmorState) {
    const armorInfo = slots.map((slot) => {
      const item = getEquippedArmor(bot, slot);
      return { slot, item: item?.name ?? null };
    }).filter((a) => a.item);

    pushEvent(bot, 'armor_equipped', { armor: armorInfo });
    state.lastArmorState = newHash;
  }

  return changed;
}

/**
 * Initialize auto-armor for a bot
 */
export function initializeAutoArmor(
  bot: Bot,
  config?: Partial<AutoArmorConfig>
): void {
  const state = getArmorState(bot);

  if (config) {
    state.config = { ...state.config, ...config };
  }

  // Clean up existing interval
  if (state.checkInterval) {
    clearInterval(state.checkInterval);
    state.checkInterval = undefined;
  }

  if (!state.config.enabled) {
    log.debug('Auto-armor disabled', { username: bot.username });
    return;
  }

  // Set up periodic armor check
  state.checkInterval = setInterval(async () => {
    if (!bot.entity) return;

    try {
      await equipBestArmor(bot);
    } catch (err) {
      log.debug('Auto-armor check error', { error: err });
    }
  }, state.config.checkIntervalMs);

  // Also check on inventory update
  bot.on('playerCollect', async () => {
    try {
      await equipBestArmor(bot);
    } catch {}
  });

  // Initial equip on spawn
  bot.once('spawn', async () => {
    state.lastArmorState = getArmorHash(bot);
    try {
      await equipBestArmor(bot);
    } catch {}
  });

  log.info('Auto-armor initialized', { username: bot.username, config: state.config });
}

/**
 * Enable or disable auto-armor
 */
export function setAutoArmorEnabled(bot: Bot, enabled: boolean): void {
  const state = getArmorState(bot);
  state.config.enabled = enabled;
  initializeAutoArmor(bot, state.config);
  log.info('Auto-armor toggled', { username: bot.username, enabled });
}

/**
 * Configure auto-armor
 */
export function configureAutoArmor(bot: Bot, config: Partial<AutoArmorConfig>): void {
  const state = getArmorState(bot);
  state.config = { ...state.config, ...config };

  if (state.config.enabled) {
    initializeAutoArmor(bot, state.config);
  }

  log.debug('Auto-armor configured', { username: bot.username, config: state.config });
}

/**
 * Get current auto-armor status
 */
export function getAutoArmorStatus(bot: Bot): {
  enabled: boolean;
  config: AutoArmorConfig;
  currentArmor: { slot: ArmorSlot; item: string | null; tier: number }[];
} {
  const state = getArmorState(bot);
  const slots: ArmorSlot[] = ['head', 'torso', 'legs', 'feet'];

  const currentArmor = slots.map((slot) => {
    const item = getEquippedArmor(bot, slot);
    return {
      slot,
      item: item?.name ?? null,
      tier: item ? getArmorTier(item) : 0,
    };
  });

  return {
    enabled: state.config.enabled,
    config: state.config,
    currentArmor,
  };
}

/**
 * Force equip best armor now
 */
export async function equipBestArmorNow(bot: Bot): Promise<boolean> {
  return equipBestArmor(bot);
}

/**
 * Clean up auto-armor listeners
 */
export function cleanupAutoArmor(bot: Bot): void {
  const managed = bot as BotWithAutoArmorState;
  const state = managed.__autoArmorState;

  if (!state) return;

  if (state.checkInterval) {
    clearInterval(state.checkInterval);
    state.checkInterval = undefined;
  }

  log.debug('Auto-armor cleaned up', { username: bot.username });
}
