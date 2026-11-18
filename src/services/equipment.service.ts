/**
 * Equipment service for weapon and tool selection
 */

import type { Bot } from 'mineflayer';
import type { Item } from 'prismarine-item';
import type { ManagedBot } from '../types/index.js';
import { logger } from '../utils/logger.js';

/** Equipment destination slots */
type EquipmentDestination = 'hand' | 'head' | 'torso' | 'legs' | 'feet' | 'off-hand';

/** Bot with autoEat plugin */
interface BotWithAutoEat {
  autoEat?: {
    enable(): void;
    disable(): void;
  };
}

const _log = logger.child('equipment');

/** Weapon preference order (best to worst) */
const WEAPON_PRIORITY = [
  'netherite_sword',
  'diamond_sword',
  'iron_sword',
  'stone_sword',
  'golden_sword',
  'wooden_sword',
  'netherite_axe',
  'diamond_axe',
  'iron_axe',
  'stone_axe',
  'golden_axe',
  'wooden_axe',
];

/** Tool categories by material tier */
const TOOL_TIERS = ['netherite', 'diamond', 'iron', 'stone', 'golden', 'wooden'];

/** Tool type to block type mapping */
const TOOL_FOR_BLOCK: Record<string, string> = {
  // Pickaxe blocks
  stone: 'pickaxe',
  cobblestone: 'pickaxe',
  deepslate: 'pickaxe',
  coal_ore: 'pickaxe',
  iron_ore: 'pickaxe',
  gold_ore: 'pickaxe',
  diamond_ore: 'pickaxe',
  emerald_ore: 'pickaxe',
  lapis_ore: 'pickaxe',
  redstone_ore: 'pickaxe',
  copper_ore: 'pickaxe',
  nether_quartz_ore: 'pickaxe',
  ancient_debris: 'pickaxe',
  obsidian: 'pickaxe',
  netherrack: 'pickaxe',
  basalt: 'pickaxe',
  blackstone: 'pickaxe',

  // Axe blocks
  oak_log: 'axe',
  spruce_log: 'axe',
  birch_log: 'axe',
  jungle_log: 'axe',
  acacia_log: 'axe',
  dark_oak_log: 'axe',
  cherry_log: 'axe',
  mangrove_log: 'axe',
  oak_planks: 'axe',
  spruce_planks: 'axe',
  birch_planks: 'axe',
  jungle_planks: 'axe',
  acacia_planks: 'axe',
  dark_oak_planks: 'axe',
  cherry_planks: 'axe',
  mangrove_planks: 'axe',
  bamboo_planks: 'axe',

  // Shovel blocks
  dirt: 'shovel',
  grass_block: 'shovel',
  sand: 'shovel',
  gravel: 'shovel',
  clay: 'shovel',
  soul_sand: 'shovel',
  soul_soil: 'shovel',
  snow: 'shovel',
  snow_block: 'shovel',

  // Hoe blocks
  wheat: 'hoe',
  carrots: 'hoe',
  potatoes: 'hoe',
  beetroots: 'hoe',
  hay_block: 'hoe',
  dried_kelp_block: 'hoe',
  target: 'hoe',
  shroomlight: 'hoe',
  nether_wart_block: 'hoe',
  warped_wart_block: 'hoe',
  leaves: 'hoe',

  // Shears
  cobweb: 'shears',
  vine: 'shears',
};

/**
 * Equipment service class
 */
export class EquipmentService {
  private rangedMinDistance: number;
  private suspendAutoEat: number = 0;

  constructor(options: { rangedMinDistance?: number } = {}) {
    this.rangedMinDistance = options.rangedMinDistance ?? 8;
  }

  /**
   * Check if the bot has arrows
   */
  hasArrows(bot: Bot): boolean {
    return bot.inventory.items().some((item) => item.name.includes('arrow'));
  }

  /**
   * Get the best weapon from inventory
   */
  getBestWeapon(bot: Bot): Item | null {
    const items = bot.inventory.items();

    for (const weaponName of WEAPON_PRIORITY) {
      const weapon = items.find((item) => item.name === weaponName);
      if (weapon) return weapon;
    }

    return null;
  }

  /**
   * Get bow from inventory
   */
  getBow(bot: Bot): Item | null {
    return bot.inventory.items().find((item) => item.name === 'bow') ?? null;
  }

  /**
   * Get crossbow from inventory
   */
  getCrossbow(bot: Bot): Item | null {
    return bot.inventory.items().find((item) => item.name === 'crossbow') ?? null;
  }

  /**
   * Equip the best weapon for the given distance
   */
  async equipBestWeapon(bot: Bot, targetDistance?: number): Promise<boolean> {
    const useRanged = targetDistance && targetDistance > this.rangedMinDistance;

    if (useRanged) {
      // Try bow first
      const bow = this.getBow(bot);
      if (bow && this.hasArrows(bot)) {
        await this.safeEquip(bot, bow, 'hand');
        return true;
      }

      // Try crossbow
      const crossbow = this.getCrossbow(bot);
      if (crossbow && this.hasArrows(bot)) {
        await this.safeEquip(bot, crossbow, 'hand');
        return true;
      }
    }

    // Fall back to melee
    const weapon = this.getBestWeapon(bot);
    if (weapon) {
      await this.safeEquip(bot, weapon, 'hand');
      return true;
    }

    return false;
  }

  /**
   * Equip the best tool for a block type
   */
  async equipBestToolForBlock(bot: Bot, blockName: string): Promise<boolean> {
    // Determine tool type needed
    let toolType: string | null = null;

    for (const [pattern, tool] of Object.entries(TOOL_FOR_BLOCK)) {
      if (blockName.includes(pattern)) {
        toolType = tool;
        break;
      }
    }

    if (!toolType) {
      // Default logic based on block name patterns
      if (blockName.includes('ore') || blockName.includes('stone') || blockName.includes('deepslate')) {
        toolType = 'pickaxe';
      } else if (blockName.includes('log') || blockName.includes('plank') || blockName.includes('wood')) {
        toolType = 'axe';
      } else if (blockName.includes('dirt') || blockName.includes('sand') || blockName.includes('gravel')) {
        toolType = 'shovel';
      } else if (blockName.includes('crop') || blockName.includes('leaves')) {
        toolType = 'hoe';
      }
    }

    if (!toolType) return false;

    // Find best tool of that type
    const items = bot.inventory.items();

    for (const tier of TOOL_TIERS) {
      const toolName = `${tier}_${toolType}`;
      const tool = items.find((item) => item.name === toolName);
      if (tool) {
        await this.safeEquip(bot, tool, 'hand');
        return true;
      }
    }

    // Check for shears separately
    if (toolType === 'shears') {
      const shears = items.find((item) => item.name === 'shears');
      if (shears) {
        await this.safeEquip(bot, shears, 'hand');
        return true;
      }
    }

    return false;
  }

  /**
   * Safely equip an item with auto-eat suspension
   */
  private async safeEquip(bot: Bot, item: Item, destination: EquipmentDestination): Promise<void> {
    this.pushSuspendAutoEat(bot);
    try {
      await bot.equip(item, destination);
    } finally {
      this.popSuspendAutoEat(bot);
    }
  }

  /**
   * Suspend auto-eat during equipment changes
   */
  pushSuspendAutoEat(bot: Bot): void {
    const managed = bot as ManagedBot;
    if (!managed.__autoEatSuspended) managed.__autoEatSuspended = 0;
    managed.__autoEatSuspended++;

    const botWithAutoEat = bot as unknown as BotWithAutoEat;
    if (managed.__autoEatSuspended === 1 && botWithAutoEat.autoEat) {
      try {
        botWithAutoEat.autoEat.disable();
      } catch {
        // Ignore if autoEat is unavailable
      }
    }
  }

  /**
   * Resume auto-eat after equipment changes
   */
  popSuspendAutoEat(bot: Bot): void {
    const managed = bot as ManagedBot;
    if (!managed.__autoEatSuspended) managed.__autoEatSuspended = 0;
    managed.__autoEatSuspended = Math.max(0, managed.__autoEatSuspended - 1);

    const botWithAutoEat = bot as unknown as BotWithAutoEat;
    if (managed.__autoEatSuspended === 0 && botWithAutoEat.autoEat) {
      try {
        botWithAutoEat.autoEat.enable();
      } catch {
        // Ignore if autoEat is unavailable
      }
    }
  }

  /**
   * Get item durability information
   */
  getItemDurability(item: Item): { max: number; used: number; remaining: number; percentage: number } | null {
    if (!item.durabilityUsed && item.durabilityUsed !== 0) {
      return null;
    }

    const maxDurability = item.maxDurability || 0;
    const used = item.durabilityUsed || 0;
    const remaining = maxDurability - used;

    return {
      max: maxDurability,
      used,
      remaining,
      percentage: maxDurability > 0 ? (remaining / maxDurability) * 100 : 100,
    };
  }

  /**
   * Check if an item is low on durability
   */
  isLowDurability(item: Item, threshold: number = 10): boolean {
    const durability = this.getItemDurability(item);
    if (!durability) return false;
    return durability.percentage < threshold;
  }

  /**
   * Get shield from inventory
   */
  getShield(bot: Bot): Item | null {
    return bot.inventory.items().find((item) => item.name === 'shield') ?? null;
  }

  /**
   * Equip shield to off-hand
   */
  async equipShield(bot: Bot): Promise<boolean> {
    const shield = this.getShield(bot);
    if (shield) {
      await this.safeEquip(bot, shield, 'off-hand');
      return true;
    }
    return false;
  }

  /**
   * Raise shield for a duration
   */
  async raiseShield(bot: Bot, durationMs: number = 800): Promise<void> {
    const offHand = bot.inventory.slots[bot.getEquipmentDestSlot('off-hand')];
    if (!offHand?.name.includes('shield')) return;

    try {
      bot.activateItem(true); // off-hand
      await new Promise((resolve) => setTimeout(resolve, durationMs));
      bot.deactivateItem();
    } catch {}
  }
}

/**
 * Create an equipment service
 */
export function createEquipmentService(options?: { rangedMinDistance?: number }): EquipmentService {
  return new EquipmentService(options);
}
