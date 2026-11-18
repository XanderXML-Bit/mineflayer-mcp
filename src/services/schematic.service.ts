/**
 * Schematic Building Service
 *
 * Handles loading and building structures from schematic files.
 * Supports basic schematic formats and provides:
 * - Schematic parsing
 * - Material requirement calculation
 * - Block-by-block building
 * - Progress tracking
 * - Undo/retry failed placements
 *
 * Note: This is a simplified implementation. Full NBT schematic parsing
 * would require additional dependencies (like prismarine-nbt).
 */

import type { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import { logger } from '../utils/logger.js';
import { pushEvent } from './event.service.js';

const log = logger.child('schematic-service');

/** Block placement instruction */
export interface BlockPlacement {
  position: { x: number; y: number; z: number };
  blockName: string;
  blockState?: Record<string, string>;
  placed: boolean;
  failed: boolean;
  attempts: number;
}

/** Schematic data structure */
export interface SchematicData {
  name: string;
  width: number;
  height: number;
  length: number;
  blocks: BlockPlacement[];
  palette: Map<number, string>;
  origin: { x: number; y: number; z: number };
  createdAt: number;
}

/** Material requirements */
export interface MaterialRequirements {
  blocks: Map<string, number>;
  total: number;
  missing: Map<string, number>;
  canBuild: boolean;
}

/** Build progress */
export interface BuildProgress {
  total: number;
  placed: number;
  failed: number;
  remaining: number;
  percentComplete: number;
  currentBlock: BlockPlacement | null;
  estimatedTimeMs: number;
}

/** Schematic service configuration */
export interface SchematicConfig {
  /** Whether schematic building is enabled */
  enabled: boolean;
  /** Delay between block placements (ms) */
  placementDelayMs: number;
  /** Maximum placement attempts per block */
  maxAttempts: number;
  /** Radius to search for placement position */
  placementRange: number;
  /** Whether to check for required materials */
  checkMaterials: boolean;
  /** Build from bottom up */
  bottomUp: boolean;
}

/** Default configuration */
export const DEFAULT_SCHEMATIC_CONFIG: SchematicConfig = {
  enabled: true,
  placementDelayMs: 250,
  maxAttempts: 3,
  placementRange: 4,
  checkMaterials: true,
  bottomUp: true,
};

/** Schematic state */
interface SchematicState {
  config: SchematicConfig;
  loadedSchematic: SchematicData | null;
  isBuilding: boolean;
  isPaused: boolean;
  buildStartTime: number;
  placementsPerSecond: number;
}

/** Bot with schematic state */
interface BotWithSchematicState extends Bot {
  __schematicState?: SchematicState;
}

/** Get or create schematic state */
function getSchematicState(bot: Bot): SchematicState {
  const managed = bot as BotWithSchematicState;
  if (!managed.__schematicState) {
    managed.__schematicState = {
      config: { ...DEFAULT_SCHEMATIC_CONFIG },
      loadedSchematic: null,
      isBuilding: false,
      isPaused: false,
      buildStartTime: 0,
      placementsPerSecond: 0,
    };
  }
  return managed.__schematicState;
}

/**
 * Create a simple schematic from a 3D array of block names
 */
export function createSchematicFromArray(
  name: string,
  blocks: string[][][], // [y][z][x]
  origin: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }
): SchematicData {
  const height = blocks.length;
  const length = height > 0 ? blocks[0].length : 0;
  const width = length > 0 ? blocks[0][0].length : 0;

  const placements: BlockPlacement[] = [];
  const palette = new Map<number, string>();
  let paletteIndex = 0;

  for (let y = 0; y < height; y++) {
    for (let z = 0; z < length; z++) {
      for (let x = 0; x < width; x++) {
        const blockName = blocks[y][z][x];
        if (blockName && blockName !== 'air' && blockName !== 'minecraft:air') {
          // Add to palette if new
          if (![...palette.values()].includes(blockName)) {
            palette.set(paletteIndex++, blockName);
          }

          placements.push({
            position: { x, y, z },
            blockName,
            placed: false,
            failed: false,
            attempts: 0,
          });
        }
      }
    }
  }

  return {
    name,
    width,
    height,
    length,
    blocks: placements,
    palette,
    origin,
    createdAt: Date.now(),
  };
}

/**
 * Create a schematic from a simple template string
 * Format: Each line is a layer (y), separated by blank lines
 * Each character in a line represents a block
 */
export function createSchematicFromTemplate(
  name: string,
  template: string,
  blockMap: Record<string, string>,
  origin: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }
): SchematicData {
  const layers = template.trim().split(/\n\s*\n/);
  const blocks: string[][][] = [];

  for (const layer of layers) {
    const rows = layer.trim().split('\n');
    const layerBlocks: string[][] = [];

    for (const row of rows) {
      const rowBlocks: string[] = [];
      for (const char of row) {
        const blockName = blockMap[char] || 'air';
        rowBlocks.push(blockName);
      }
      layerBlocks.push(rowBlocks);
    }
    blocks.push(layerBlocks);
  }

  return createSchematicFromArray(name, blocks, origin);
}

/**
 * Load a schematic
 */
export function loadSchematic(bot: Bot, schematic: SchematicData): void {
  const state = getSchematicState(bot);
  state.loadedSchematic = schematic;

  log.info('Schematic loaded', {
    name: schematic.name,
    size: `${schematic.width}x${schematic.height}x${schematic.length}`,
    blocks: schematic.blocks.length,
  });
}

/**
 * Calculate material requirements
 */
export function calculateMaterials(bot: Bot): MaterialRequirements | null {
  const state = getSchematicState(bot);
  if (!state.loadedSchematic) return null;

  const required = new Map<string, number>();
  const missing = new Map<string, number>();

  // Count required blocks
  for (const block of state.loadedSchematic.blocks) {
    if (!block.placed) {
      const count = required.get(block.blockName) || 0;
      required.set(block.blockName, count + 1);
    }
  }

  // Check inventory
  const inventory = new Map<string, number>();
  for (const item of bot.inventory.items()) {
    const count = inventory.get(item.name) || 0;
    inventory.set(item.name, count + item.count);
  }

  // Calculate missing
  let canBuild = true;
  for (const [blockName, needed] of required) {
    const have = inventory.get(blockName) || 0;
    if (have < needed) {
      missing.set(blockName, needed - have);
      canBuild = false;
    }
  }

  const total = [...required.values()].reduce((a, b) => a + b, 0);

  return { blocks: required, total, missing, canBuild };
}

/**
 * Get build progress
 */
export function getBuildProgress(bot: Bot): BuildProgress | null {
  const state = getSchematicState(bot);
  if (!state.loadedSchematic) return null;

  const placed = state.loadedSchematic.blocks.filter((b) => b.placed).length;
  const failed = state.loadedSchematic.blocks.filter((b) => b.failed).length;
  const total = state.loadedSchematic.blocks.length;
  const remaining = total - placed;
  const percentComplete = total > 0 ? (placed / total) * 100 : 0;

  // Find current block
  const currentBlock = state.loadedSchematic.blocks.find(
    (b) => !b.placed && !b.failed
  ) || null;

  // Estimate time remaining
  const elapsed = state.isBuilding ? Date.now() - state.buildStartTime : 0;
  const avgTimePerBlock = placed > 0 ? elapsed / placed : state.config.placementDelayMs;
  const estimatedTimeMs = remaining * avgTimePerBlock;

  return {
    total,
    placed,
    failed,
    remaining,
    percentComplete: Math.round(percentComplete * 10) / 10,
    currentBlock,
    estimatedTimeMs,
  };
}

/**
 * Sort blocks for building order
 */
function sortBlocksForBuilding(blocks: BlockPlacement[], bottomUp: boolean): BlockPlacement[] {
  return [...blocks].sort((a, b) => {
    // Sort by Y first (bottom-up or top-down)
    if (a.position.y !== b.position.y) {
      return bottomUp
        ? a.position.y - b.position.y
        : b.position.y - a.position.y;
    }
    // Then by Z
    if (a.position.z !== b.position.z) {
      return a.position.z - b.position.z;
    }
    // Then by X
    return a.position.x - b.position.x;
  });
}

/**
 * Place a single block
 */
async function placeBlock(
  bot: Bot,
  placement: BlockPlacement,
  worldOffset: Vec3
): Promise<boolean> {
  const worldPos = new Vec3(
    placement.position.x + worldOffset.x,
    placement.position.y + worldOffset.y,
    placement.position.z + worldOffset.z
  );

  try {
    // Find the block in inventory
    const item = bot.inventory.items().find((i) => i.name === placement.blockName);
    if (!item) {
      log.debug('Block not in inventory', { block: placement.blockName });
      return false;
    }

    // Equip the block
    await bot.equip(item, 'hand');

    // Find a face to place against
    const adjacentOffsets = [
      new Vec3(0, -1, 0), // Below
      new Vec3(0, 1, 0),  // Above
      new Vec3(1, 0, 0),  // East
      new Vec3(-1, 0, 0), // West
      new Vec3(0, 0, 1),  // South
      new Vec3(0, 0, -1), // North
    ];

    for (const offset of adjacentOffsets) {
      const adjacentPos = worldPos.plus(offset);
      const adjacentBlock = bot.blockAt(adjacentPos);

      if (adjacentBlock && adjacentBlock.boundingBox !== 'empty') {
        // Can place against this block
        const faceVector = offset.scaled(-1);

        await bot.lookAt(worldPos);
        await bot.placeBlock(adjacentBlock, faceVector);

        return true;
      }
    }

    log.debug('No adjacent block to place against', { position: worldPos });
    return false;
  } catch (error) {
    log.debug('Failed to place block', { position: worldPos, error });
    return false;
  }
}

/**
 * Build the loaded schematic
 */
export async function buildSchematic(
  bot: Bot,
  offset: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }
): Promise<{ success: boolean; placed: number; failed: number; reason?: string }> {
  const state = getSchematicState(bot);

  if (!state.loadedSchematic) {
    return { success: false, placed: 0, failed: 0, reason: 'no_schematic_loaded' };
  }

  if (state.isBuilding) {
    return { success: false, placed: 0, failed: 0, reason: 'already_building' };
  }

  // Check materials if enabled
  if (state.config.checkMaterials) {
    const materials = calculateMaterials(bot);
    if (materials && !materials.canBuild) {
      return { success: false, placed: 0, failed: 0, reason: 'missing_materials' };
    }
  }

  state.isBuilding = true;
  state.isPaused = false;
  state.buildStartTime = Date.now();

  const worldOffset = new Vec3(
    offset.x + state.loadedSchematic.origin.x,
    offset.y + state.loadedSchematic.origin.y,
    offset.z + state.loadedSchematic.origin.z
  );

  // Sort blocks for building order
  const sortedBlocks = sortBlocksForBuilding(
    state.loadedSchematic.blocks,
    state.config.bottomUp
  );

  let placedCount = 0;
  let failedCount = 0;

  pushEvent(bot, 'block_broken', {
    action: 'schematic_build_started',
    name: state.loadedSchematic.name,
    totalBlocks: sortedBlocks.length,
  });

  for (const block of sortedBlocks) {
    // Check for pause
    while (state.isPaused && state.isBuilding) {
      await new Promise((r) => setTimeout(r, 100));
    }

    // Check if stopped
    if (!state.isBuilding) break;

    // Skip already placed or failed blocks
    if (block.placed || block.failed) continue;

    // Try to place the block
    block.attempts++;
    const success = await placeBlock(bot, block, worldOffset);

    if (success) {
      block.placed = true;
      placedCount++;
    } else if (block.attempts >= state.config.maxAttempts) {
      block.failed = true;
      failedCount++;
    }

    // Delay between placements
    await new Promise((r) => setTimeout(r, state.config.placementDelayMs));
  }

  state.isBuilding = false;

  const allPlaced = state.loadedSchematic.blocks.every((b) => b.placed);

  pushEvent(bot, 'block_broken', {
    action: 'schematic_build_completed',
    name: state.loadedSchematic.name,
    placed: placedCount,
    failed: failedCount,
    success: allPlaced,
  });

  log.info('Schematic build completed', {
    name: state.loadedSchematic.name,
    placed: placedCount,
    failed: failedCount,
    success: allPlaced,
  });

  return {
    success: allPlaced,
    placed: placedCount,
    failed: failedCount,
    reason: allPlaced ? undefined : 'some_blocks_failed',
  };
}

/**
 * Pause building
 */
export function pauseBuild(bot: Bot): void {
  const state = getSchematicState(bot);
  state.isPaused = true;
  log.debug('Build paused');
}

/**
 * Resume building
 */
export function resumeBuild(bot: Bot): void {
  const state = getSchematicState(bot);
  state.isPaused = false;
  log.debug('Build resumed');
}

/**
 * Stop building
 */
export function stopBuild(bot: Bot): void {
  const state = getSchematicState(bot);
  state.isBuilding = false;
  state.isPaused = false;
  log.debug('Build stopped');
}

/**
 * Reset failed blocks for retry
 */
export function resetFailedBlocks(bot: Bot): number {
  const state = getSchematicState(bot);
  if (!state.loadedSchematic) return 0;

  let resetCount = 0;
  for (const block of state.loadedSchematic.blocks) {
    if (block.failed) {
      block.failed = false;
      block.attempts = 0;
      resetCount++;
    }
  }

  log.debug('Failed blocks reset', { count: resetCount });
  return resetCount;
}

/**
 * Get schematic service status
 */
export function getSchematicStatus(bot: Bot): {
  enabled: boolean;
  config: SchematicConfig;
  hasSchematic: boolean;
  schematicName: string | null;
  schematicSize: { width: number; height: number; length: number } | null;
  isBuilding: boolean;
  isPaused: boolean;
  progress: BuildProgress | null;
  materials: MaterialRequirements | null;
} {
  const state = getSchematicState(bot);

  return {
    enabled: state.config.enabled,
    config: state.config,
    hasSchematic: state.loadedSchematic !== null,
    schematicName: state.loadedSchematic?.name || null,
    schematicSize: state.loadedSchematic
      ? {
          width: state.loadedSchematic.width,
          height: state.loadedSchematic.height,
          length: state.loadedSchematic.length,
        }
      : null,
    isBuilding: state.isBuilding,
    isPaused: state.isPaused,
    progress: getBuildProgress(bot),
    materials: calculateMaterials(bot),
  };
}

/**
 * Configure schematic service
 */
export function configureSchematicService(bot: Bot, config: Partial<SchematicConfig>): void {
  const state = getSchematicState(bot);
  state.config = { ...state.config, ...config };
  log.debug('Schematic service configured', { config: state.config });
}

/**
 * Initialize schematic service
 */
export function initializeSchematicService(bot: Bot, config?: Partial<SchematicConfig>): void {
  const state = getSchematicState(bot);

  if (config) {
    state.config = { ...state.config, ...config };
  }

  log.info('Schematic service initialized', { username: bot.username });
}

/**
 * Unload current schematic
 */
export function unloadSchematic(bot: Bot): void {
  const state = getSchematicState(bot);
  state.loadedSchematic = null;
  state.isBuilding = false;
  state.isPaused = false;
  log.debug('Schematic unloaded');
}
