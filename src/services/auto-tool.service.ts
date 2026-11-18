/**
 * Auto-Tool Service
 *
 * Modern replacement for mineflayer-tool.
 * Automatically selects the best tool for mining/combat tasks.
 * Handles tool durability and efficiency tiers.
 */

import type { Bot } from 'mineflayer';
import type { Item } from 'prismarine-item';
import type { Block } from 'prismarine-block';
import { logger } from '../utils/logger.js';
import { pushEvent } from './event.service.js';

const log = logger.child('auto-tool');

/** Block with material property */
interface BlockWithMaterial extends Block {
  material?: string;
}

/** NBT enchantment structure */
interface EnchantmentNBT {
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

/** Tool tier rankings (higher = better) */
const TOOL_TIERS: Record<string, number> = {
  netherite: 6,
  diamond: 5,
  iron: 4,
  stone: 3,
  golden: 2,
  gold: 2,
  wooden: 1,
  wood: 1,
};

/** Tool types and their uses */
const TOOL_TYPES = {
  pickaxe: ['stone', 'ore', 'metal', 'iron', 'gold', 'diamond', 'emerald', 'coal', 'copper', 'redstone', 'lapis', 'netherite', 'obsidian', 'cobblestone', 'deepslate', 'blackstone', 'basalt', 'terracotta', 'concrete', 'brick', 'prismarine', 'end_stone', 'purpur', 'quartz', 'sandstone', 'andesite', 'diorite', 'granite', 'nether'],
  axe: ['log', 'wood', 'plank', 'fence', 'door', 'sign', 'chest', 'crafting', 'barrel', 'bookshelf', 'pumpkin', 'melon', 'bamboo', 'mushroom_block', 'stem'],
  shovel: ['dirt', 'sand', 'gravel', 'clay', 'soul', 'snow', 'grass_block', 'podzol', 'mycelium', 'farmland', 'path', 'mud', 'concrete_powder'],
  hoe: ['hay', 'target', 'dried_kelp', 'sponge', 'leaves', 'sculk', 'moss', 'shroomlight', 'nether_wart_block', 'warped_wart_block'],
  sword: [], // For combat, not mining
  shears: ['wool', 'cobweb', 'leaves', 'vine', 'glow_lichen'],
};

/** Weapons for combat */
const WEAPON_TYPES = ['sword', 'axe'];

/** Auto-tool configuration */
export interface AutoToolConfig {
  /** Whether auto-tool is enabled */
  enabled: boolean;
  /** Minimum durability before switching tools */
  minDurability: number;
  /** Prefer enchanted tools over higher tier */
  preferEnchanted: boolean;
  /** Auto-equip for combat */
  autoEquipWeapon: boolean;
}

/** Default configuration */
export const DEFAULT_AUTO_TOOL_CONFIG: AutoToolConfig = {
  enabled: true,
  minDurability: 10,
  preferEnchanted: true,
  autoEquipWeapon: true,
};

/** Stored config per bot */
const botConfigs = new WeakMap<Bot, AutoToolConfig>();

/**
 * Get config for a bot
 */
function getConfig(bot: Bot): AutoToolConfig {
  if (!botConfigs.has(bot)) {
    botConfigs.set(bot, { ...DEFAULT_AUTO_TOOL_CONFIG });
  }
  const config = botConfigs.get(bot);
  return config as AutoToolConfig;
}

/**
 * Get tool tier from item name
 */
function getToolTier(item: Item): number {
  const name = item.name.toLowerCase();
  for (const [tier, value] of Object.entries(TOOL_TIERS)) {
    if (name.includes(tier)) {
      return value;
    }
  }
  return 0;
}

/**
 * Get tool type from item
 */
function getToolType(item: Item): string | null {
  const name = item.name.toLowerCase();
  for (const type of Object.keys(TOOL_TYPES)) {
    if (name.includes(type)) {
      return type;
    }
  }
  return null;
}

/**
 * Check if tool is a weapon
 */
function isWeapon(item: Item): boolean {
  const name = item.name.toLowerCase();
  return WEAPON_TYPES.some((w) => name.includes(w));
}

/**
 * Get remaining durability of a tool
 */
function getRemainingDurability(item: Item): number {
  if (!item.durabilityUsed) return Infinity;
  const maxDurability = item.maxDurability ?? 0;
  return maxDurability - item.durabilityUsed;
}

/**
 * Get enchantment value for tool comparison
 */
function getEnchantmentValue(item: Item): number {
  if (!item.nbt) return 0;

  try {
    const nbt = item.nbt as EnchantmentNBT;
    const enchants = nbt.value?.Enchantments?.value?.value;
    if (!Array.isArray(enchants)) return 0;

    let value = 0;
    for (const enchant of enchants) {
      const lvl = enchant?.lvl?.value ?? 1;
      const id = enchant?.id?.value ?? '';

      value += lvl;

      // Bonus for efficiency
      if (id.includes('efficiency')) {
        value += lvl * 3;
      }
      // Bonus for unbreaking
      if (id.includes('unbreaking')) {
        value += lvl * 2;
      }
      // Bonus for fortune/silk touch
      if (id.includes('fortune') || id.includes('silk_touch')) {
        value += lvl * 2;
      }
      // Bonus for sharpness/smite/bane
      if (id.includes('sharpness') || id.includes('smite') || id.includes('bane')) {
        value += lvl * 2;
      }
    }
    return value;
  } catch {
    return 0;
  }
}

/**
 * Compare two tools and return the better one for a task
 */
function compareBetter(
  a: Item | null,
  b: Item | null,
  config: AutoToolConfig
): Item | null {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;

  // Check durability first
  const aDur = getRemainingDurability(a);
  const bDur = getRemainingDurability(b);

  if (aDur < config.minDurability && bDur >= config.minDurability) return b;
  if (bDur < config.minDurability && aDur >= config.minDurability) return a;

  const aTier = getToolTier(a);
  const bTier = getToolTier(b);
  const aEnch = getEnchantmentValue(a);
  const bEnch = getEnchantmentValue(b);

  if (config.preferEnchanted) {
    // If enchantment difference is significant, prefer enchanted
    if (aEnch > bEnch + 3) return a;
    if (bEnch > aEnch + 3) return b;
  }

  // Otherwise, prefer higher tier
  if (aTier !== bTier) {
    return aTier > bTier ? a : b;
  }

  // Same tier - prefer more enchantments
  return aEnch >= bEnch ? a : b;
}

/**
 * Determine the best tool type for a block
 */
function getBestToolTypeForBlock(block: Block): string | null {
  const blockName = block.name.toLowerCase();

  for (const [toolType, blockPatterns] of Object.entries(TOOL_TYPES)) {
    if (blockPatterns.some((pattern) => blockName.includes(pattern))) {
      return toolType;
    }
  }

  // Check block material/hardness if available
  const blockWithMaterial = block as BlockWithMaterial;
  if (blockWithMaterial.material) {
    const material = blockWithMaterial.material;
    if (material.includes('rock') || material.includes('stone')) return 'pickaxe';
    if (material.includes('wood')) return 'axe';
    if (material.includes('dirt') || material.includes('sand')) return 'shovel';
    if (material.includes('plant') || material.includes('leaves')) return 'hoe';
  }

  return null;
}

/**
 * Find the best tool in inventory for a given tool type
 */
function findBestToolOfType(
  bot: Bot,
  toolType: string,
  config: AutoToolConfig
): Item | null {
  const items = bot.inventory.items();
  let best: Item | null = null;

  for (const item of items) {
    const itemType = getToolType(item);
    if (itemType !== toolType) continue;

    // Skip if durability too low
    if (getRemainingDurability(item) < config.minDurability) continue;

    best = compareBetter(best, item, config);
  }

  return best;
}

/**
 * Find the best weapon in inventory
 */
function findBestWeapon(bot: Bot, config: AutoToolConfig): Item | null {
  const items = bot.inventory.items();
  let best: Item | null = null;

  for (const item of items) {
    if (!isWeapon(item)) continue;
    if (getRemainingDurability(item) < config.minDurability) continue;

    best = compareBetter(best, item, config);
  }

  return best;
}

/**
 * Select and equip the best tool for mining a block
 */
export async function equipBestToolForBlock(bot: Bot, block: Block): Promise<Item | null> {
  const config = getConfig(bot);
  if (!config.enabled) return null;

  const toolType = getBestToolTypeForBlock(block);
  if (!toolType) return null;

  const bestTool = findBestToolOfType(bot, toolType, config);
  if (!bestTool) return null;

  // Check if already equipped
  const heldItem = bot.heldItem;
  if (heldItem && heldItem.name === bestTool.name) {
    return heldItem;
  }

  try {
    await bot.equip(bestTool, 'hand');
    pushEvent(bot, 'tool_switched', {
      tool: bestTool.name,
      forBlock: block.name,
      durability: getRemainingDurability(bestTool),
    });
    log.debug('Equipped tool for block', { tool: bestTool.name, block: block.name });
    return bestTool;
  } catch (err) {
    log.debug('Failed to equip tool', { tool: bestTool.name, error: err });
    return null;
  }
}

/**
 * Select and equip the best weapon for combat
 */
export async function equipBestWeapon(bot: Bot): Promise<Item | null> {
  const config = getConfig(bot);
  if (!config.enabled || !config.autoEquipWeapon) return null;

  const bestWeapon = findBestWeapon(bot, config);
  if (!bestWeapon) return null;

  // Check if already equipped
  const heldItem = bot.heldItem;
  if (heldItem && heldItem.name === bestWeapon.name) {
    return heldItem;
  }

  try {
    await bot.equip(bestWeapon, 'hand');
    pushEvent(bot, 'tool_switched', {
      tool: bestWeapon.name,
      forCombat: true,
      durability: getRemainingDurability(bestWeapon),
    });
    log.debug('Equipped weapon for combat', { weapon: bestWeapon.name });
    return bestWeapon;
  } catch (err) {
    log.debug('Failed to equip weapon', { weapon: bestWeapon.name, error: err });
    return null;
  }
}

/**
 * Configure auto-tool
 */
export function configureAutoTool(bot: Bot, config: Partial<AutoToolConfig>): void {
  const current = getConfig(bot);
  botConfigs.set(bot, { ...current, ...config });
  log.debug('Auto-tool configured', { username: bot.username, config: botConfigs.get(bot) });
}

/**
 * Get current auto-tool status
 */
export function getAutoToolStatus(bot: Bot): {
  enabled: boolean;
  config: AutoToolConfig;
  tools: { name: string; type: string | null; tier: number; durability: number }[];
} {
  const config = getConfig(bot);

  const tools = bot.inventory.items()
    .filter((item) => getToolType(item) !== null || isWeapon(item))
    .map((item) => ({
      name: item.name,
      type: getToolType(item),
      tier: getToolTier(item),
      durability: getRemainingDurability(item),
    }))
    .sort((a, b) => b.tier - a.tier);

  return {
    enabled: config.enabled,
    config,
    tools,
  };
}

/**
 * Enable or disable auto-tool
 */
export function setAutoToolEnabled(bot: Bot, enabled: boolean): void {
  const config = getConfig(bot);
  config.enabled = enabled;
  log.info('Auto-tool toggled', { username: bot.username, enabled });
}
