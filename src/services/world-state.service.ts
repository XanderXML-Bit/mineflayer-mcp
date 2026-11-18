/**
 * World State Service
 *
 * Tracks environment information: biome, weather, time, dimension, danger level.
 */

import type { Bot } from 'mineflayer';

/** Bot with game dimension property */
interface BotWithGame {
  game?: { dimension?: string };
}

/** Bot with weather state properties */
interface BotWithWeather {
  thunderState?: number;
  rainState?: number;
}

/** Bot with spawn point */
interface BotWithSpawnPoint {
  spawnPoint?: { x: number; y: number; z: number };
}

/** Block with biome property */
interface BlockWithBiome {
  biome?: { name?: string };
}

export interface TimeInfo {
  day: number;
  phase: 'day' | 'night' | 'dawn' | 'dusk';
  ticks: number;
  ticksUntilPhaseChange: number;
}

export interface WorldState {
  time: TimeInfo;
  weather: 'clear' | 'rain' | 'thunder';
  biome: string;
  dimension: 'overworld' | 'nether' | 'end';
  lightLevel: number;
  skyLightLevel: number;
  isUnderground: boolean;
  nearbyStructures: string[];
  spawnPoint: { x: number; y: number; z: number } | null;
}

export interface DangerAssessment {
  level: number; // 0-10
  description: 'safe' | 'low' | 'moderate' | 'dangerous' | 'critical';
  factors: string[];
}

// Time phase constants (in ticks)
const DAWN_START = 0;
const DAY_START = 1000;
const DUSK_START = 12000;
const NIGHT_START = 13000;
const TICKS_PER_DAY = 24000;

/**
 * Set of hostile mob name patterns for O(1) lookup
 */
const HOSTILE_MOB_NAMES = new Set([
  'zombie', 'skeleton', 'creeper', 'spider', 'witch', 'drowned',
  'husk', 'stray', 'phantom', 'pillager', 'vindicator', 'evoker',
  'blaze', 'ghast', 'warden', 'wither', 'enderman', 'cave_spider',
  'zombie_villager', 'vex', 'ravager', 'piglin_brute', 'hoglin',
  'zoglin', 'shulker', 'guardian', 'elder_guardian', 'silverfish',
  'endermite', 'slime', 'magma_cube',
]);

/**
 * Check if an entity name matches a hostile mob
 */
function isHostileMob(entityName: string): boolean {
  const nameLower = entityName.toLowerCase();
  // Check exact match first (O(1))
  if (HOSTILE_MOB_NAMES.has(nameLower)) return true;
  // Check for partial matches (zombie_villager contains zombie)
  for (const hostile of HOSTILE_MOB_NAMES) {
    if (nameLower.includes(hostile)) return true;
  }
  return false;
}

/**
 * Get nearby hostile mobs within a radius
 */
function getNearbyHostileMobs(bot: Bot, maxDistance: number): number {
  if (!bot.entity) return 0;

  let count = 0;
  for (const entity of Object.values(bot.entities)) {
    if (!entity || entity === bot.entity || !entity.position) continue;

    const dist = entity.position.distanceTo(bot.entity.position);
    if (dist > maxDistance) continue;

    if (isHostileMob(entity.name || '')) {
      count++;
    }
  }
  return count;
}

/**
 * Get the current time phase based on ticks
 */
function getTimePhase(ticks: number): 'day' | 'night' | 'dawn' | 'dusk' {
  const dayTicks = ticks % TICKS_PER_DAY;

  if (dayTicks >= DAWN_START && dayTicks < DAY_START) {
    return 'dawn';
  } else if (dayTicks >= DAY_START && dayTicks < DUSK_START) {
    return 'day';
  } else if (dayTicks >= DUSK_START && dayTicks < NIGHT_START) {
    return 'dusk';
  } else {
    return 'night';
  }
}

/**
 * Get ticks until the next phase change
 */
function getTicksUntilPhaseChange(ticks: number): number {
  const dayTicks = ticks % TICKS_PER_DAY;

  if (dayTicks < DAY_START) {
    return DAY_START - dayTicks;
  } else if (dayTicks < DUSK_START) {
    return DUSK_START - dayTicks;
  } else if (dayTicks < NIGHT_START) {
    return NIGHT_START - dayTicks;
  } else {
    return TICKS_PER_DAY - dayTicks + DAY_START;
  }
}

/**
 * Detect dimension from game info
 */
function getDimension(bot: Bot): 'overworld' | 'nether' | 'end' {
  const botWithGame = bot as unknown as BotWithGame;
  const game = botWithGame.game;
  if (!game) return 'overworld';

  const dimension = game.dimension;
  if (dimension?.includes('nether')) return 'nether';
  if (dimension?.includes('end')) return 'end';
  return 'overworld';
}

/**
 * Check if bot is underground (no sky access)
 */
function checkUnderground(bot: Bot): boolean {
  if (!bot.entity) return false;

  const pos = bot.entity.position;
  // Check blocks above for sky access
  for (let y = Math.ceil(pos.y) + 1; y < 320; y++) {
    const block = bot.blockAt(pos.offset(0, y - pos.y, 0));
    if (!block) break;
    if (block.name !== 'air' && !block.name.includes('leaves')) {
      return true; // Found solid block above
    }
  }
  return false;
}

/**
 * Block-to-structure mapping for O(1) lookup
 */
const STRUCTURE_INDICATORS = new Map<string, string>([
  // Village indicators
  ['bell', 'village'],
  ['lectern', 'village'],
  ['composter', 'village'],
  ['fletching_table', 'village'],
  ['cartography_table', 'village'],
  ['brewing_stand', 'village'],
  ['smoker', 'village'],
  ['blast_furnace', 'village'],
  // Dungeon indicators
  ['spawner', 'dungeon'],
  ['mossy_cobblestone', 'dungeon'],
  // Mineshaft indicators
  ['rail', 'mineshaft'],
  // Stronghold indicators
  ['end_portal_frame', 'stronghold'],
  ['stone_bricks', 'stronghold'],
  ['cracked_stone_bricks', 'stronghold'],
  ['mossy_stone_bricks', 'stronghold'],
  // Nether fortress
  ['nether_bricks', 'nether_fortress'],
  ['nether_brick_stairs', 'nether_fortress'],
  ['nether_brick_fence', 'nether_fortress'],
  // Ocean monument
  ['prismarine', 'ocean_monument'],
  ['prismarine_bricks', 'ocean_monument'],
  ['dark_prismarine', 'ocean_monument'],
  ['sea_lantern', 'ocean_monument'],
  // End city
  ['purpur_block', 'end_city'],
  ['purpur_pillar', 'end_city'],
  ['end_rod', 'end_city'],
]);

/**
 * Detect nearby structures by looking for specific blocks
 * Uses Map for O(1) block-to-structure lookup
 */
function detectNearbyStructures(bot: Bot, radius: number = 32): string[] {
  const structures: Set<string> = new Set();

  if (!bot.entity) return [];

  const pos = bot.entity.position;

  // Sample blocks in radius (not exhaustive, just indicative)
  // Using step size to reduce iterations from O(n^3) to O((n/8)^3)
  for (let dx = -radius; dx <= radius; dx += 8) {
    for (let dz = -radius; dz <= radius; dz += 8) {
      for (let dy = -16; dy <= 16; dy += 4) {
        const block = bot.blockAt(pos.offset(dx, dy, dz));
        if (!block) continue;

        // O(1) lookup in Map instead of multiple string comparisons
        const structure = STRUCTURE_INDICATORS.get(block.name);
        if (structure) {
          structures.add(structure);
        }
      }
    }
  }

  return Array.from(structures);
}

/**
 * Get the world state for a bot
 */
export function getWorldState(bot: Bot): WorldState {
  const time = bot.time?.timeOfDay ?? 0;
  const day = bot.time?.day ?? 0;

  // Weather detection
  const botWithWeather = bot as unknown as BotWithWeather;
  let weather: 'clear' | 'rain' | 'thunder' = 'clear';
  if ((botWithWeather.thunderState ?? 0) > 0) {
    weather = 'thunder';
  } else if ((botWithWeather.rainState ?? 0) > 0 || bot.isRaining) {
    weather = 'rain';
  }

  // Biome detection
  let biome = 'unknown';
  if (bot.entity) {
    const block = bot.blockAt(bot.entity.position);
    if (block) {
      biome = (block as BlockWithBiome).biome?.name ?? 'unknown';
    }
  }

  // Light level at bot position
  let lightLevel = 15;
  let skyLightLevel = 15;
  if (bot.entity) {
    const block = bot.blockAt(bot.entity.position);
    if (block) {
      lightLevel = block.light ?? 15;
      skyLightLevel = block.skyLight ?? 15;
    }
  }

  // Spawn point
  const botWithSpawn = bot as unknown as BotWithSpawnPoint;
  let spawnPoint = null;
  if (botWithSpawn.spawnPoint) {
    const sp = botWithSpawn.spawnPoint;
    spawnPoint = { x: sp.x, y: sp.y, z: sp.z };
  }

  return {
    time: {
      day,
      phase: getTimePhase(time),
      ticks: time,
      ticksUntilPhaseChange: getTicksUntilPhaseChange(time),
    },
    weather,
    biome,
    dimension: getDimension(bot),
    lightLevel,
    skyLightLevel,
    isUnderground: checkUnderground(bot),
    nearbyStructures: detectNearbyStructures(bot, 32),
    spawnPoint,
  };
}

/**
 * Check if it's currently night time
 */
export function isNightTime(bot: Bot): boolean {
  const time = bot.time?.timeOfDay ?? 0;
  const phase = getTimePhase(time);
  return phase === 'night' || phase === 'dusk';
}

/**
 * Check if it's safe to sleep (night time, no monsters nearby)
 */
export function isSafeToSleep(bot: Bot): { safe: boolean; reason?: string } {
  if (!isNightTime(bot)) {
    return { safe: false, reason: 'Not night time' };
  }

  // Check for nearby hostile mobs using shared helper
  const hostileCount = getNearbyHostileMobs(bot, 10);

  if (hostileCount > 0) {
    return { safe: false, reason: `${hostileCount} hostile mobs nearby` };
  }

  return { safe: true };
}

/**
 * Assess the current danger level
 */
export function getDangerLevel(bot: Bot): DangerAssessment {
  const factors: string[] = [];
  let dangerScore = 0;

  if (!bot.entity) {
    return { level: 0, description: 'safe', factors: ['Bot not spawned'] };
  }

  // Check time of day
  if (isNightTime(bot)) {
    dangerScore += 2;
    factors.push('Night time');
  }

  // Check light level
  const worldState = getWorldState(bot);
  if (worldState.lightLevel < 7) {
    dangerScore += 2;
    factors.push('Low light level');
  }

  // Check for hostile mobs using shared helper
  const hostileCount = getNearbyHostileMobs(bot, 16);

  if (hostileCount > 0) {
    dangerScore += Math.min(hostileCount * 2, 6);
    factors.push(`${hostileCount} hostile mobs nearby`);
  }

  // Check health
  if (bot.health < 6) {
    dangerScore += 3;
    factors.push('Low health');
  } else if (bot.health < 10) {
    dangerScore += 1;
    factors.push('Moderate health');
  }

  // Check dimension
  if (worldState.dimension === 'nether') {
    dangerScore += 2;
    factors.push('In the Nether');
  } else if (worldState.dimension === 'end') {
    dangerScore += 2;
    factors.push('In the End');
  }

  // Check weather
  if (worldState.weather === 'thunder') {
    dangerScore += 1;
    factors.push('Thunderstorm');
  }

  // Underground without torches
  if (worldState.isUnderground && worldState.lightLevel < 7) {
    dangerScore += 1;
    factors.push('Dark underground');
  }

  // Clamp to 0-10
  const level = Math.min(Math.max(dangerScore, 0), 10);

  // Determine description
  let description: DangerAssessment['description'];
  if (level <= 1) {
    description = 'safe';
  } else if (level <= 3) {
    description = 'low';
  } else if (level <= 5) {
    description = 'moderate';
  } else if (level <= 7) {
    description = 'dangerous';
  } else {
    description = 'critical';
  }

  return { level, description, factors };
}
