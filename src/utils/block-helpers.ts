/**
 * Block-related helper utilities
 */

import type { Bot } from 'mineflayer';
import type { Block } from 'prismarine-block';
import { Vec3 } from 'vec3';

/** Block with metadata property */
type BlockWithMetadata = Block & {
  metadata?: number;
};

/** Minecraft data interface */
interface MinecraftDataBlocksInterface {
  blocksByName: Record<string, { name: string; id: number } | undefined>;
}

/**
 * Check if a block is water
 */
export function isWaterLike(block: Block | null | undefined): boolean {
  if (!block) return false;
  const n = String(block.name || '').toLowerCase();
  return n === 'water';
}

/**
 * Check if a block name is a plant obstruction (grass, flowers, etc.)
 */
export function isPlantObstruction(name: string): boolean {
  const n = name.toLowerCase();

  if (n === 'grass' || n === 'tall_grass' || n === 'fern' || n === 'large_fern' || n === 'dead_bush') {
    return true;
  }

  const flowers = [
    'flower',
    'dandelion',
    'poppy',
    'orchid',
    'allium',
    'azure_bluet',
    'oxeye_daisy',
    'cornflower',
    'lily_of_the_valley',
    'wither_rose',
    'tulip',
    'sunflower',
    'lilac',
    'rose_bush',
    'peony',
  ];

  return flowers.some((f) => n.includes(f));
}

/**
 * Check if position has clear line to sky
 */
export function isClearToSkyAt(bot: Bot, pos: Vec3): boolean {
  try {
    for (let dy = 1; dy <= 20; dy++) {
      const b = bot.blockAt(new Vec3(pos.x, pos.y + dy, pos.z));
      if (b && b.boundingBox !== 'empty') return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve block name aliases to actual block names
 */
export function resolveBlockAliases(name: string, mcData: MinecraftDataBlocksInterface): string[] {
  const n = name.toLowerCase();
  const all = Object.keys(mcData.blocksByName);

  if (n === 'log') return all.filter((b) => b.endsWith('_log'));
  if (n === 'bed') return all.filter((b) => b.includes('bed'));
  if (n === 'planks') return all.filter((b) => b.endsWith('_planks'));
  if (n === 'ore') return all.filter((b) => b.endsWith('_ore'));
  if (n === 'leaves') return all.filter((b) => b.endsWith('_leaves'));

  return all.filter((b) => b.includes(n));
}

/**
 * Check if a block is farmland
 */
export function isFarmland(block: Block | null | undefined): boolean {
  if (!block) return false;
  return block.name === 'farmland';
}

/**
 * Check if a block is a mature crop
 */
export function isMatureCrop(block: Block | null | undefined): boolean {
  if (!block) return false;

  const cropNames = ['wheat', 'carrots', 'potatoes', 'beetroots'];
  if (!cropNames.some((c) => block.name.includes(c))) return false;

  // Check age property (mature = age 7 for wheat/carrots/potatoes, age 3 for beetroots)
  const blockWithMeta = block as BlockWithMetadata;
  const props = block.getProperties?.() as { age?: number } | undefined;
  const age = props?.age ?? blockWithMeta.metadata;
  if (block.name === 'beetroots') {
    return (age ?? 0) >= 3;
  }
  return (age ?? 0) >= 7;
}

/**
 * Get the block below a position
 */
export function getBlockBelow(bot: Bot, pos: Vec3): Block | null {
  return bot.blockAt(pos.offset(0, -1, 0));
}

/**
 * Check if a position is safe to stand on
 */
export function isSafePosition(bot: Bot, pos: Vec3): boolean {
  const blockAt = bot.blockAt(pos);
  const blockBelow = getBlockBelow(bot, pos);
  const blockAbove = bot.blockAt(pos.offset(0, 1, 0));

  // Must have solid ground below
  if (!blockBelow || blockBelow.boundingBox === 'empty') return false;

  // Must have air at feet and head
  if (blockAt && blockAt.boundingBox !== 'empty') return false;
  if (blockAbove && blockAbove.boundingBox !== 'empty') return false;

  // Avoid liquids
  if (isWaterLike(blockAt) || isWaterLike(blockBelow)) return false;

  return true;
}
