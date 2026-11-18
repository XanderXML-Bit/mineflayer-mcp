/**
 * Status Dashboard Tool
 *
 * Comprehensive "what's my situation" summary combining all intelligence.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { getWorldState, getDangerLevel } from '../../services/world-state.service.js';
import { getResourceStatus } from '../../services/resource-planner.service.js';
import { assessThreats, getCombatReadiness } from '../../services/combat-intelligence.service.js';
import { getActiveGoals } from '../../services/goal.service.js';
import { getLastDeath, itemsLikelyAvailable } from '../../services/death-recovery.service.js';

const InputSchema = BaseInputSchema.extend({
  detail: z
    .enum(['brief', 'normal', 'full'])
    .optional()
    .default('normal')
    .describe('Level of detail: brief (essential only), normal, or full (everything)'),
});

type Input = z.infer<typeof InputSchema>;

interface HealthStatus {
  current: number;
  max: number;
  percent: number;
  status: 'critical' | 'low' | 'moderate' | 'good' | 'full';
}

interface HungerStatus {
  current: number;
  max: number;
  mealsRemaining: number;
  status: 'starving' | 'hungry' | 'moderate' | 'satisfied' | 'full';
}

interface EnvironmentStatus {
  position: { x: number; y: number; z: number };
  biome: string;
  dimension: string;
  timeOfDay: string;
  lightLevel: number;
  weather: string;
  isUnderground: boolean;
}

interface ThreatStatus {
  level: string;
  count: number;
  nearest?: string;
  recommendation: string;
}

interface ResourceAlerts {
  tools: string[];
  food: string[];
  inventory: string[];
}

interface GoalProgress {
  id: string;
  description: string;
  progress: number;
  status: string;
}

interface PendingRecovery {
  hasPending: boolean;
  location?: { x: number; y: number; z: number };
  itemsAvailable?: boolean;
}

interface Dashboard {
  // Survival
  health: HealthStatus;
  hunger: HungerStatus;
  armor: { rating: number; status: string };

  // Environment
  environment: EnvironmentStatus;
  dangerLevel: number;

  // Combat
  threats: ThreatStatus;
  combatReady: boolean;

  // Resources (only in normal/full)
  alerts?: ResourceAlerts;
  inventorySpace?: string;

  // Goals (only in normal/full)
  activeGoals?: GoalProgress[];

  // Recovery (only if pending)
  pendingRecovery?: PendingRecovery;

  // Nearby entities (only in full)
  nearbyPlayers?: string[];
  nearbyMobs?: { name: string; count: number }[];

  // Summary
  warnings: string[];
  summary: string;
}

export class StatusDashboardTool extends BaseTool<Input, Dashboard> {
  readonly name = 'statusDashboard';
  readonly description =
    'Get comprehensive status overview: health, environment, threats, resources, and goals in one view.';
  readonly category = 'utility' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Dashboard> {
    const warnings: string[] = [];

    // Health status
    const healthPercent = Math.round((bot.health / 20) * 100);
    const health: HealthStatus = {
      current: Math.round(bot.health * 10) / 10,
      max: 20,
      percent: healthPercent,
      status:
        healthPercent <= 20
          ? 'critical'
          : healthPercent <= 40
            ? 'low'
            : healthPercent <= 60
              ? 'moderate'
              : healthPercent <= 90
                ? 'good'
                : 'full',
    };

    if (health.status === 'critical') {
      warnings.push('Health critically low!');
    } else if (health.status === 'low') {
      warnings.push('Health is low');
    }

    // Hunger status
    const resourceStatus = getResourceStatus(bot);
    const hunger: HungerStatus = {
      current: bot.food,
      max: 20,
      mealsRemaining: resourceStatus.food.mealsRemaining,
      status:
        bot.food <= 2
          ? 'starving'
          : bot.food <= 6
            ? 'hungry'
            : bot.food <= 12
              ? 'moderate'
              : bot.food <= 18
                ? 'satisfied'
                : 'full',
    };

    if (hunger.status === 'starving') {
      warnings.push('Starving!');
    } else if (hunger.status === 'hungry') {
      warnings.push('Getting hungry');
    }

    // Armor status
    const combatReadiness = getCombatReadiness(bot);
    const armor = {
      rating: combatReadiness.armorRating,
      status:
        combatReadiness.armorRating >= 15
          ? 'excellent'
          : combatReadiness.armorRating >= 10
            ? 'good'
            : combatReadiness.armorRating >= 5
              ? 'moderate'
              : combatReadiness.armorRating > 0
                ? 'weak'
                : 'none',
    };

    // Environment
    const worldState = getWorldState(bot);
    const dangerAssessment = getDangerLevel(bot);
    const dangerLevel = dangerAssessment.level;
    const pos = bot.entity.position;

    const environment: EnvironmentStatus = {
      position: {
        x: Math.floor(pos.x),
        y: Math.floor(pos.y),
        z: Math.floor(pos.z),
      },
      biome: worldState.biome,
      dimension: worldState.dimension,
      timeOfDay: worldState.time.phase,
      lightLevel: worldState.lightLevel,
      weather: worldState.weather,
      isUnderground: worldState.isUnderground,
    };

    if (worldState.time.phase === 'night' && !worldState.isUnderground) {
      warnings.push('Nighttime - hostile mobs spawn');
    }

    // Threat assessment
    const threatAssessment = assessThreats(bot, 16);
    const threats: ThreatStatus = {
      level: threatAssessment.overallThreat,
      count: threatAssessment.threats.length,
      nearest: threatAssessment.nearestThreat?.name,
      recommendation: threatAssessment.recommendation,
    };

    if (threatAssessment.overallThreat === 'critical') {
      warnings.push('CRITICAL THREAT NEARBY!');
    } else if (threatAssessment.overallThreat === 'high') {
      warnings.push('Multiple threats detected');
    }

    // Build base dashboard
    const dashboard: Dashboard = {
      health,
      hunger,
      armor,
      environment,
      dangerLevel,
      threats,
      combatReady: combatReadiness.ready,
      warnings,
      summary: '',
    };

    // Add detail based on level
    if (input.detail !== 'brief') {
      // Resource alerts
      const alerts: ResourceAlerts = {
        tools: resourceStatus.tools
          .filter((t) => t.critical)
          .map((t) => `${t.item} (${t.durabilityPercent}%)`),
        food:
          resourceStatus.food.mealsRemaining < 3
            ? [`Only ${resourceStatus.food.mealsRemaining} meals remaining`]
            : [],
        inventory:
          resourceStatus.inventoryPercent > 90
            ? [`Inventory ${resourceStatus.inventoryPercent}% full`]
            : [],
      };

      // Add tool warnings
      for (const tool of alerts.tools) {
        warnings.push(`Tool breaking: ${tool}`);
      }

      dashboard.alerts = alerts;
      dashboard.inventorySpace = `${resourceStatus.inventoryUsed}/${resourceStatus.inventoryTotal}`;

      // Active goals
      const goals = getActiveGoals().slice(0, 3);
      dashboard.activeGoals = goals.map((g) => ({
        id: g.id,
        description: g.description,
        progress: g.progress,
        status: g.status,
      }));

      // Pending recovery
      const lastDeath = getLastDeath();
      if (lastDeath) {
        const availability = itemsLikelyAvailable();
        dashboard.pendingRecovery = {
          hasPending: true,
          location: lastDeath.position,
          itemsAvailable: availability.available,
        };
        if (availability.available) {
          warnings.push('Items to recover from death!');
        }
      }
    }

    if (input.detail === 'full') {
      // Nearby players
      const players = Object.values(bot.players)
        .filter((p) => p.entity && p.username !== bot.username)
        .map((p) => p.username);
      dashboard.nearbyPlayers = players;

      // Nearby mobs (grouped by type)
      const mobCounts: Record<string, number> = {};
      for (const entity of Object.values(bot.entities)) {
        if (entity && entity.type === 'mob' && entity !== bot.entity) {
          const dist = entity.position?.distanceTo(pos) ?? Infinity;
          if (dist <= 32) {
            const name = entity.name ?? 'unknown';
            mobCounts[name] = (mobCounts[name] ?? 0) + 1;
          }
        }
      }
      dashboard.nearbyMobs = Object.entries(mobCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
    }

    // Build summary
    let summary = `Health: ${health.current}/${health.max}. `;
    summary += `${environment.biome}, ${environment.timeOfDay}. `;
    summary += `Threat: ${threats.level}. `;

    if (warnings.length > 0) {
      summary += `⚠️ ${warnings.length} warning(s).`;
    } else {
      summary += 'All clear.';
    }

    dashboard.summary = summary;

    return dashboard;
  }
}
