/**
 * Cooking and food-related helper utilities
 */

import type { Bot } from 'mineflayer';
import type { Item } from 'prismarine-item';
import { logger } from './logger.js';

const _log = logger.child('cooking');

/** Food items that can be eaten */
const FOOD_ITEMS = [
  'apple',
  'baked_potato',
  'beef',
  'bread',
  'carrot',
  'chicken',
  'cod',
  'cooked_beef',
  'cooked_chicken',
  'cooked_cod',
  'cooked_mutton',
  'cooked_porkchop',
  'cooked_rabbit',
  'cooked_salmon',
  'cookie',
  'dried_kelp',
  'enchanted_golden_apple',
  'golden_apple',
  'golden_carrot',
  'honey_bottle',
  'melon_slice',
  'mushroom_stew',
  'mutton',
  'porkchop',
  'potato',
  'pumpkin_pie',
  'rabbit',
  'rabbit_stew',
  'raw_beef',
  'raw_chicken',
  'raw_cod',
  'raw_mutton',
  'raw_porkchop',
  'raw_rabbit',
  'raw_salmon',
  'rotten_flesh',
  'salmon',
  'spider_eye',
  'steak',
  'suspicious_stew',
  'sweet_berries',
  'tropical_fish',
  'kelp',
];

/** Items that can be smelted into metal */
const ORE_ITEMS = [
  'raw_iron',
  'raw_gold',
  'raw_copper',
  'iron_ore',
  'gold_ore',
  'copper_ore',
  'deepslate_iron_ore',
  'deepslate_gold_ore',
  'deepslate_copper_ore',
  'ancient_debris',
];

/** Fuel items with their burn times in ticks */
const FUEL_BURN_TIMES: Record<string, number> = {
  lava_bucket: 20000,
  coal_block: 16000,
  dried_kelp_block: 4000,
  blaze_rod: 2400,
  coal: 1600,
  charcoal: 1600,
  oak_log: 300,
  spruce_log: 300,
  birch_log: 300,
  jungle_log: 300,
  acacia_log: 300,
  dark_oak_log: 300,
  cherry_log: 300,
  mangrove_log: 300,
  oak_planks: 300,
  spruce_planks: 300,
  birch_planks: 300,
  jungle_planks: 300,
  acacia_planks: 300,
  dark_oak_planks: 300,
  cherry_planks: 300,
  mangrove_planks: 300,
  bamboo_planks: 300,
  stick: 100,
  bamboo: 50,
};

/**
 * Check if an item name is likely food
 */
export function isLikelyFood(itemName: string): boolean {
  const n = itemName.toLowerCase();

  // Direct match
  if (FOOD_ITEMS.some((f) => n === f || n.includes(f))) {
    return true;
  }

  // Pattern matching
  if (n.startsWith('raw_') || n.includes('raw')) return true;
  if (n.includes('cooked')) return true;
  if (n.includes('beef') || n.includes('porkchop') || n.includes('mutton')) return true;
  if (n.includes('chicken') || n.includes('cod') || n.includes('salmon')) return true;
  if (n.includes('rabbit') || n.includes('potato') || n.includes('kelp')) return true;
  if (n.includes('sweet_berries')) return true;

  return false;
}

/**
 * Check if an item name is likely an ore that can be smelted
 */
export function isLikelyOre(itemName: string): boolean {
  const n = itemName.toLowerCase();

  // Direct match
  if (ORE_ITEMS.some((o) => n === o)) return true;

  // Pattern matching
  if (n.endsWith('_ore')) return true;
  // Only raw metals, not raw food (raw_iron/gold/copper, not raw_beef/chicken)
  if (n === 'raw_iron' || n === 'raw_gold' || n === 'raw_copper') return true;
  if (n.includes('ancient_debris')) return true;

  return false;
}

/**
 * Choose the best cooking device for an item
 */
export function chooseDeviceForItem(
  itemName: string,
  prefer?: string
): 'furnace' | 'smoker' | 'blast_furnace' | 'campfire' {
  const p = (prefer || '').toLowerCase();

  // Honor explicit preference
  if (p === 'furnace' || p === 'smoker' || p === 'blast_furnace' || p === 'campfire') {
    return p;
  }

  // Auto-select based on item type
  // Check ore first since raw_ prefix matches both food (raw_beef) and ore (raw_iron)
  if (isLikelyOre(itemName)) return 'blast_furnace';
  if (isLikelyFood(itemName)) return 'smoker';

  return 'furnace';
}

/**
 * Check if the bot has food in inventory
 */
export function hasFood(bot: Bot): boolean {
  return bot.inventory.items().some((i) => isLikelyFood(i.name));
}

/**
 * Get the best food item from inventory
 */
export function getBestFood(bot: Bot): Item | null {
  const items = bot.inventory.items();

  // Priority order for food (better foods first)
  const priority = [
    'golden_carrot',
    'cooked_beef',
    'steak',
    'cooked_porkchop',
    'cooked_mutton',
    'cooked_chicken',
    'cooked_rabbit',
    'cooked_salmon',
    'cooked_cod',
    'bread',
    'baked_potato',
    'golden_apple',
    'apple',
    'carrot',
    'sweet_berries',
    'melon_slice',
    'raw_beef',
    'raw_porkchop',
    'raw_mutton',
    'raw_chicken',
    'raw_rabbit',
    'raw_salmon',
    'raw_cod',
    'potato',
    'dried_kelp',
    'rotten_flesh',
  ];

  for (const foodName of priority) {
    const item = items.find((i) => i.name === foodName);
    if (item) return item;
  }

  // Fall back to any food
  return items.find((i) => isLikelyFood(i.name)) ?? null;
}

/**
 * Get fuel item from inventory
 */
export function getFuel(bot: Bot): Item | null {
  const items = bot.inventory.items();

  // Priority by efficiency
  const fuelNames = Object.keys(FUEL_BURN_TIMES).sort(
    (a, b) => FUEL_BURN_TIMES[b] - FUEL_BURN_TIMES[a]
  );

  for (const fuelName of fuelNames) {
    const item = items.find((i) => i.name === fuelName);
    if (item) return item;
  }

  return null;
}

/**
 * Calculate fuel needed for smelting count items
 */
export function calculateFuelNeeded(count: number, fuelItem: Item | null): number {
  const fuelName = fuelItem?.name;
  const burnTime = (fuelName ? FUEL_BURN_TIMES[fuelName] : undefined) ?? 300;
  const smeltTime = 200; // ticks per item
  const itemsPerFuel = Math.floor(burnTime / smeltTime);
  return Math.ceil(count / itemsPerFuel);
}
