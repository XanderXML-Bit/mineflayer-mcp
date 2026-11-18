/**
 * Combat Intelligence Service
 *
 * Assess threats, track combat statistics, and provide fight/flee recommendations.
 */

import type { Bot } from 'mineflayer';
import type { Entity } from 'prismarine-entity';
import { remember, recall, forget } from './memory.service.js';
import { logger } from '../utils/logger.js';

/** Entity with health properties */
type EntityWithHealth = Entity & {
  health?: number;
  maxHealth?: number;
  metadata?: Record<number, unknown>;
};

const log = logger.child('combat-intelligence');

export interface ThreatInfo {
  entity: string;
  name: string;
  type: string;
  distance: number;
  health: number;
  maxHealth: number;
  damage: number; // Expected damage to bot
  isBaby: boolean;
  isHostile: boolean;
  canWin: boolean;
}

export type ThreatLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface ThreatAssessment {
  overallThreat: ThreatLevel;
  threats: ThreatInfo[];
  nearestThreat: ThreatInfo | null;
  recommendation: 'fight' | 'flee' | 'ignore' | 'prepare';
  escapeRoutes: { x: number; y: number; z: number }[];
  summary: string;
}

export interface CombatReadiness {
  ready: boolean;
  armorRating: number;
  bestWeapon: string | null;
  weaponDamage: number;
  shieldEquipped: boolean;
  healthPercent: number;
  foodLevel: number;
  issues: string[];
  summary: string;
}

export interface CombatStats {
  totalFights: number;
  wins: number;
  losses: number;
  winRate: number;
  deathsBy: Record<string, number>;
  killsBy: Record<string, number>;
}

// Mob base damage values
const MOB_DAMAGE: Record<string, number> = {
  zombie: 3,
  skeleton: 2,
  spider: 2,
  creeper: 49, // Explosion damage
  enderman: 7,
  witch: 6,
  pillager: 4,
  vindicator: 13,
  ravager: 12,
  warden: 30,
  blaze: 6,
  ghast: 6,
  piglin_brute: 13,
  wither_skeleton: 10,
  hoglin: 6,
  zoglin: 8,
  drowned: 3,
  husk: 3,
  stray: 2,
  phantom: 2,
  guardian: 6,
  elder_guardian: 8,
  shulker: 4,
  evoker: 6,
  vex: 9,
};

// Weapon damage values
const WEAPON_DAMAGE: Record<string, number> = {
  wooden_sword: 4,
  stone_sword: 5,
  iron_sword: 6,
  golden_sword: 4,
  diamond_sword: 7,
  netherite_sword: 8,
  wooden_axe: 7,
  stone_axe: 9,
  iron_axe: 9,
  golden_axe: 7,
  diamond_axe: 9,
  netherite_axe: 10,
  trident: 9,
};

// Armor protection values
const ARMOR_PROTECTION: Record<string, number> = {
  leather_helmet: 1,
  leather_chestplate: 3,
  leather_leggings: 2,
  leather_boots: 1,
  chainmail_helmet: 2,
  chainmail_chestplate: 5,
  chainmail_leggings: 4,
  chainmail_boots: 1,
  iron_helmet: 2,
  iron_chestplate: 6,
  iron_leggings: 5,
  iron_boots: 2,
  golden_helmet: 2,
  golden_chestplate: 5,
  golden_leggings: 3,
  golden_boots: 1,
  diamond_helmet: 3,
  diamond_chestplate: 8,
  diamond_leggings: 6,
  diamond_boots: 3,
  netherite_helmet: 3,
  netherite_chestplate: 8,
  netherite_leggings: 6,
  netherite_boots: 3,
  turtle_helmet: 2,
};

// Hostile mob types
const HOSTILE_MOBS = new Set([
  'zombie',
  'skeleton',
  'spider',
  'creeper',
  'enderman',
  'witch',
  'pillager',
  'vindicator',
  'ravager',
  'warden',
  'blaze',
  'ghast',
  'piglin_brute',
  'wither_skeleton',
  'hoglin',
  'zoglin',
  'drowned',
  'husk',
  'stray',
  'phantom',
  'guardian',
  'elder_guardian',
  'shulker',
  'evoker',
  'vex',
  'magma_cube',
  'slime',
  'silverfish',
  'endermite',
  'cave_spider',
]);

// Memory key for combat stats
const COMBAT_STATS_KEY = 'combat:stats';

/**
 * Check if an entity is hostile
 */
function isHostile(entity: Entity): boolean {
  return HOSTILE_MOBS.has(entity.name ?? '');
}

/**
 * Get expected damage from a mob
 */
function getMobDamage(mobName: string): number {
  return MOB_DAMAGE[mobName] ?? 2; // Default 2 damage
}

/**
 * Get weapon damage value
 */
function _getWeaponDamage(weaponName: string): number {
  return WEAPON_DAMAGE[weaponName] ?? 1; // Fist does 1 damage
}

/**
 * Get armor rating from bot's equipment
 */
export function getArmorRating(bot: Bot): number {
  let total = 0;

  const slots = [
    bot.inventory.slots[5], // Helmet
    bot.inventory.slots[6], // Chestplate
    bot.inventory.slots[7], // Leggings
    bot.inventory.slots[8], // Boots
  ];

  for (const item of slots) {
    if (item) {
      total += ARMOR_PROTECTION[item.name] ?? 0;
    }
  }

  return total;
}

/**
 * Get the best weapon in inventory
 */
export function getBestWeapon(bot: Bot): { name: string; damage: number } | null {
  let bestWeapon: { name: string; damage: number } | null = null;
  let bestDamage = 0;

  for (const item of bot.inventory.items()) {
    const damage = WEAPON_DAMAGE[item.name];
    if (damage && damage > bestDamage) {
      bestDamage = damage;
      bestWeapon = { name: item.name, damage };
    }
  }

  return bestWeapon;
}

/**
 * Assess threats in the area
 */
export function assessThreats(bot: Bot, radius: number = 16): ThreatAssessment {
  const pos = bot.entity.position;
  const threats: ThreatInfo[] = [];
  const armorRating = getArmorRating(bot);
  const weapon = getBestWeapon(bot);
  const weaponDamage = weapon?.damage ?? 1;

  // Find all hostile entities in radius
  for (const entity of Object.values(bot.entities)) {
    if (!entity || !entity.position || entity === bot.entity) continue;

    const distance = entity.position.distanceTo(pos);
    if (distance > radius) continue;

    if (!isHostile(entity)) continue;

    const mobDamage = getMobDamage(entity.name ?? 'unknown');
    const entityWithHealth = entity as EntityWithHealth;
    const mobHealth = entityWithHealth.health ?? 20;
    const maxHealth = entityWithHealth.maxHealth ?? 20;

    // Estimate if we can win (simplified)
    const turnsToKillMob = Math.ceil(mobHealth / weaponDamage);
    const turnsToKillUs = Math.ceil(bot.health / Math.max(1, mobDamage - armorRating * 0.04 * mobDamage));
    const canWin = turnsToKillMob < turnsToKillUs;

    threats.push({
      entity: entity.id?.toString() ?? 'unknown',
      name: entity.name ?? 'unknown',
      type: entity.type ?? 'mob',
      distance: Math.round(distance * 10) / 10,
      health: mobHealth,
      maxHealth,
      damage: mobDamage,
      isBaby: Boolean(entityWithHealth.metadata?.[16]),
      isHostile: true,
      canWin,
    });
  }

  // Sort by distance
  threats.sort((a, b) => a.distance - b.distance);

  // Determine overall threat level
  let overallThreat: ThreatLevel = 'none';
  let recommendation: 'fight' | 'flee' | 'ignore' | 'prepare' = 'ignore';

  if (threats.length === 0) {
    overallThreat = 'none';
    recommendation = 'ignore';
  } else if (threats.some((t) => t.name === 'warden' || t.name === 'creeper' && t.distance < 5)) {
    overallThreat = 'critical';
    recommendation = 'flee';
  } else if (threats.length >= 3 || threats.some((t) => !t.canWin && t.distance < 10)) {
    overallThreat = 'high';
    recommendation = bot.health > 10 && weapon ? 'fight' : 'flee';
  } else if (threats.some((t) => t.distance < 8)) {
    overallThreat = 'medium';
    recommendation = threats[0].canWin ? 'fight' : 'prepare';
  } else {
    overallThreat = 'low';
    recommendation = 'prepare';
  }

  // Calculate escape routes (opposite directions from threats)
  const escapeRoutes: { x: number; y: number; z: number }[] = [];
  if (threats.length > 0) {
    // Average threat direction
    let avgX = 0, avgZ = 0;
    for (const t of threats.slice(0, 3)) {
      const entity = bot.entities[parseInt(t.entity)];
      if (entity?.position) {
        avgX += entity.position.x - pos.x;
        avgZ += entity.position.z - pos.z;
      }
    }

    // Opposite direction
    const len = Math.sqrt(avgX * avgX + avgZ * avgZ) || 1;
    const escapeDir = { x: -avgX / len, z: -avgZ / len };

    escapeRoutes.push({
      x: Math.floor(pos.x + escapeDir.x * 20),
      y: Math.floor(pos.y),
      z: Math.floor(pos.z + escapeDir.z * 20),
    });
  }

  // Build summary
  let summary: string;
  if (threats.length === 0) {
    summary = 'No threats detected. Area is safe.';
  } else {
    const threatNames = [...new Set(threats.map((t) => t.name))].join(', ');
    summary = `${threats.length} threat(s) detected: ${threatNames}. `;
    summary += `Threat level: ${overallThreat}. Recommendation: ${recommendation}.`;
  }

  return {
    overallThreat,
    threats,
    nearestThreat: threats[0] ?? null,
    recommendation,
    escapeRoutes,
    summary,
  };
}

/**
 * Get combat readiness status
 */
export function getCombatReadiness(bot: Bot): CombatReadiness {
  const issues: string[] = [];
  const armorRating = getArmorRating(bot);
  const weapon = getBestWeapon(bot);
  const healthPercent = Math.round((bot.health / 20) * 100);
  const foodLevel = bot.food;

  // Check for shield
  const offhand = bot.inventory.slots[45];
  const shieldEquipped = offhand?.name === 'shield';

  // Identify issues
  if (healthPercent < 50) {
    issues.push(`Low health (${healthPercent}%)`);
  }
  if (foodLevel < 6) {
    issues.push(`Low food (${foodLevel}/20)`);
  }
  if (armorRating < 5) {
    issues.push('Weak or no armor');
  }
  if (!weapon) {
    issues.push('No weapon equipped');
  }

  const ready = issues.length === 0;

  let summary: string;
  if (ready) {
    summary = `Combat ready. Armor: ${armorRating}, Weapon: ${weapon?.name ?? 'none'} (${weapon?.damage ?? 0} dmg)`;
  } else {
    summary = `Not combat ready: ${issues.join(', ')}`;
  }

  return {
    ready,
    armorRating,
    bestWeapon: weapon?.name ?? null,
    weaponDamage: weapon?.damage ?? 0,
    shieldEquipped,
    healthPercent,
    foodLevel,
    issues,
    summary,
  };
}

/**
 * Record a combat result
 */
export function recordCombatResult(won: boolean, enemyType: string, weapon?: string): void {
  const stats = getCombatStats();

  stats.totalFights++;
  if (won) {
    stats.wins++;
    stats.killsBy[weapon ?? 'unknown'] = (stats.killsBy[weapon ?? 'unknown'] ?? 0) + 1;
  } else {
    stats.losses++;
    stats.deathsBy[enemyType] = (stats.deathsBy[enemyType] ?? 0) + 1;
  }
  stats.winRate = stats.totalFights > 0 ? Math.round((stats.wins / stats.totalFights) * 100) : 0;

  remember(COMBAT_STATS_KEY, stats, 'task');
  log.debug('Recorded combat result', { won, enemyType, weapon });
}

/**
 * Get combat statistics
 */
export function getCombatStats(): CombatStats {
  const saved = recall<CombatStats>(COMBAT_STATS_KEY, 'task');

  return saved ?? {
    totalFights: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    deathsBy: {},
    killsBy: {},
  };
}

/**
 * Clear combat statistics (for testing)
 */
export function clearCombatStats(): void {
  forget(COMBAT_STATS_KEY, 'task');
}
