/**
 * Mining helper utilities
 */

import type { Bot } from 'mineflayer';
import type { Block } from 'prismarine-block';
import { Vec3 } from 'vec3';
import { logger } from './logger.js';

const _log = logger.child('mining');

/** Bot with collectBlock plugin */
interface BotWithCollectBlock extends Bot {
  collectBlock?: {
    collect(block: Block): Promise<void>;
    cancelTask?(): void;
  };
}

/** Bot with stopDigging method */
type BotWithStopDigging = Bot & {
  stopDigging?(): void;
};

/**
 * Check if a block name is an ore
 */
export function isOreBlockName(name: string): boolean {
  const n = String(name || '').toLowerCase();
  return n.endsWith('_ore') || n.includes('ancient_debris');
}

/**
 * Check if a block name is a log
 */
export function isLogBlockName(name: string): boolean {
  const n = String(name || '').toLowerCase();
  return n.endsWith('_log') || n.endsWith('_stem') || n.endsWith('_hyphae');
}

/**
 * Convert Vec3 to string key for tracking
 */
export function posKey(v: Vec3): string {
  return `${v.x},${v.y},${v.z}`;
}

/**
 * Collect a block with timeout
 * Falls back to dig() if collectBlock plugin isn't loaded
 */
export async function collectBlockWithTimeout(
  bot: Bot,
  block: Block,
  timeoutMs: number = 30000
): Promise<void> {
  const botWithCollect = bot as BotWithCollectBlock;
  const collectBlock = botWithCollect.collectBlock;

  // Fall back to dig() if collectBlock plugin isn't loaded
  if (!collectBlock?.collect) {
    _log.debug('collectBlock plugin not available, falling back to dig()');
    await digBlockWithTimeout(bot, block, timeoutMs);
    return;
  }

  const rawTask: Promise<void> = collectBlock.collect(block);

  // Attach catch so rejections are handled even if we time out
  const guardedTask = rawTask.catch((e: Error) => {
    throw e;
  });

  try {
    await Promise.race([
      guardedTask,
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error('collect_timeout')), timeoutMs)
      ),
    ]);
  } catch (err) {
    try {
      collectBlock.cancelTask?.();
    } catch {
      // Ignore cancel errors
    }
    // Ensure any late rejections are consumed
    rawTask.catch(() => {});
    throw err;
  }
}

/**
 * Dig a block with timeout
 */
export async function digBlockWithTimeout(
  bot: Bot,
  block: Block,
  timeoutMs: number = 30000
): Promise<void> {
  let _finished = false;
  const botWithStop = bot as BotWithStopDigging;

  const digging = bot.dig(block).then(() => {
    _finished = true;
  });

  try {
    await Promise.race([
      digging,
      new Promise((_, rej) =>
        setTimeout(() => {
          try {
            botWithStop.stopDigging?.();
          } catch {
            // Ignore stop errors
          }
          rej(new Error('dig_timeout'));
        }, timeoutMs)
      ),
    ]);
  } finally {
    // Ensure we consume any late rejections
    digging.catch(() => {});
  }
}

/**
 * Get required tool category for a block name
 */
export function requiredToolCategoryForBlockName(
  name: string
): 'pickaxe' | 'axe' | 'shovel' | 'hoe' | null {
  const n = name.toLowerCase();

  const pickTargets = [
    'ore',
    'stone',
    'deepslate',
    'cobblestone',
    'obsidian',
    'netherrack',
    'end_stone',
    'andesite',
    'granite',
    'diorite',
  ];
  const axeTargets = ['log', 'planks', 'wood', 'stem', 'hyphae'];
  const shovelTargets = ['dirt', 'sand', 'gravel', 'snow', 'clay', 'soul_sand', 'soul_soil'];
  const hoeTargets = ['leaves', 'hay', 'wheat', 'carrots', 'potatoes', 'beetroots'];

  if (pickTargets.some((t) => n.includes(t))) return 'pickaxe';
  if (axeTargets.some((t) => n.includes(t))) return 'axe';
  if (shovelTargets.some((t) => n.includes(t))) return 'shovel';
  if (hoeTargets.some((t) => n.includes(t))) return 'hoe';

  return null;
}

/**
 * Check if inventory has a tool of the given category
 */
export function inventoryHasToolCategory(
  bot: Bot,
  category: 'pickaxe' | 'axe' | 'shovel' | 'hoe'
): boolean {
  const tools: Record<'pickaxe' | 'axe' | 'shovel' | 'hoe', string[]> = {
    pickaxe: [
      'netherite_pickaxe',
      'diamond_pickaxe',
      'iron_pickaxe',
      'stone_pickaxe',
      'golden_pickaxe',
      'wooden_pickaxe',
    ],
    axe: [
      'netherite_axe',
      'diamond_axe',
      'iron_axe',
      'stone_axe',
      'golden_axe',
      'wooden_axe',
    ],
    shovel: [
      'netherite_shovel',
      'diamond_shovel',
      'iron_shovel',
      'stone_shovel',
      'golden_shovel',
      'wooden_shovel',
    ],
    hoe: [
      'netherite_hoe',
      'diamond_hoe',
      'iron_hoe',
      'stone_hoe',
      'golden_hoe',
      'wooden_hoe',
    ],
  };

  const list = tools[category];
  return bot.inventory.items().some((i) => list.includes(i.name));
}

/**
 * Get adjacent blocks (for cluster mining)
 */
export function getAdjacentPositions(pos: Vec3): Vec3[] {
  return [
    pos.offset(1, 0, 0),
    pos.offset(-1, 0, 0),
    pos.offset(0, 1, 0),
    pos.offset(0, -1, 0),
    pos.offset(0, 0, 1),
    pos.offset(0, 0, -1),
  ];
}

/**
 * Pick up dropped items near a position
 * @param bot - The bot instance
 * @param position - Position to search near (defaults to bot position)
 * @param radius - Search radius (default 4 blocks)
 * @param timeoutMs - Max time to spend collecting (default 3000ms)
 * @returns Number of items picked up
 */
export async function pickupNearbyDrops(
  bot: Bot,
  position?: Vec3,
  radius: number = 4,
  timeoutMs: number = 3000
): Promise<number> {
  const searchPos = position ?? bot.entity.position;
  const startTime = Date.now();
  let pickedUp = 0;

  // Find nearby item entities
  const nearbyItems = Object.values(bot.entities).filter((e) => {
    if (!e || e.name !== 'item' || !e.position) return false;
    const dist = e.position.distanceTo(searchPos);
    return dist <= radius;
  });

  if (nearbyItems.length === 0) {
    return 0;
  }

  _log.debug(`Found ${nearbyItems.length} dropped items nearby, collecting...`);

  // Sort by distance (closest first)
  nearbyItems.sort((a, b) => {
    const distA = a.position!.distanceTo(bot.entity.position);
    const distB = b.position!.distanceTo(bot.entity.position);
    return distA - distB;
  });

  for (const item of nearbyItems) {
    if (Date.now() - startTime > timeoutMs) {
      _log.debug('Pickup timeout reached');
      break;
    }

    // Check if item still exists
    const stillExists = bot.entities[item.id];
    if (!stillExists || !stillExists.position) continue;

    const dist = stillExists.position.distanceTo(bot.entity.position);

    // If close enough, just wait a moment for auto-pickup
    if (dist <= 2) {
      await bot.waitForTicks(2);
      pickedUp++;
      continue;
    }

    // Move toward the item
    try {
      const targetPos = stillExists.position;

      // Simple approach: look at item and move forward briefly
      await bot.lookAt(targetPos);
      bot.setControlState('forward', true);

      const moveStart = Date.now();
      while (Date.now() - moveStart < 1500) {
        const currentItem = bot.entities[item.id];
        if (!currentItem) {
          // Item was picked up
          pickedUp++;
          break;
        }

        const currentDist = currentItem.position?.distanceTo(bot.entity.position) ?? 999;
        if (currentDist <= 1.5) {
          await bot.waitForTicks(3);
          pickedUp++;
          break;
        }

        await bot.waitForTicks(1);
      }

      bot.setControlState('forward', false);
    } catch {
      // Ignore movement errors
      bot.setControlState('forward', false);
    }
  }

  bot.setControlState('forward', false);
  _log.debug(`Picked up ${pickedUp} items`);
  return pickedUp;
}
