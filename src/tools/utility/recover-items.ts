/**
 * Recover Items Tool
 *
 * Navigate to the last death location and attempt to collect dropped items.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import pathfinderPkg from 'mineflayer-pathfinder';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { withTask } from '../../services/task.service.js';
import {
  getLastDeath,
  markRecovered,
  incrementRecoveryAttempts,
  itemsLikelyAvailable,
  getDeathHistory,
  getDeathStats,
} from '../../services/death-recovery.service.js';

// Import pathfinder goals at module level for reliable access
const { goals } = pathfinderPkg;

/** Entity with object type */
interface ItemEntity {
  position?: { x: number; y: number; z: number; distanceTo(other: { x: number; y: number; z: number }): number };
  type?: string;
  objectType?: string;
}

const InputSchema = BaseInputSchema.extend({
  action: z
    .enum(['recover', 'status', 'history', 'mark_recovered'])
    .optional()
    .default('recover')
    .describe('Action: recover items, check status, view history, or mark as recovered'),
  maxAttempts: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .default(3)
    .describe('Maximum recovery attempts before giving up'),
});

type Input = z.infer<typeof InputSchema>;

interface RecoveryResult {
  success: boolean;
  message: string;
  deathLocation?: { x: number; y: number; z: number };
  itemsCollected?: number;
  timeRemaining?: number;
}

interface StatusResult {
  hasPendingRecovery: boolean;
  lastDeath?: {
    position: { x: number; y: number; z: number };
    cause: string;
    timeAgo: string;
    attempts: number;
  };
  itemsLikelyAvailable: boolean;
  timeRemaining?: string;
}

interface HistoryResult {
  deaths: {
    position: { x: number; y: number; z: number };
    cause: string;
    recovered: boolean;
    timeAgo: string;
  }[];
  stats: {
    totalDeaths: number;
    recoveredCount: number;
  };
}

type Output = RecoveryResult | StatusResult | HistoryResult | { success: boolean; message: string };

export class RecoverItemsTool extends BaseTool<Input, Output> {
  readonly name = 'recoverItems';
  readonly description =
    'Recover items from last death location. Actions: recover (navigate and collect), status (check if recovery needed), history (view death history), mark_recovered (manually mark as done).';
  readonly category = 'utility' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    switch (input.action) {
      case 'status':
        return this.getStatus();

      case 'history':
        return this.getHistory();

      case 'mark_recovered':
        return this.markAsRecovered();

      case 'recover':
      default:
        return this.attemptRecovery(bot, input.maxAttempts);
    }
  }

  private getStatus(): StatusResult {
    const lastDeath = getLastDeath();
    const availability = itemsLikelyAvailable();

    if (!lastDeath) {
      return {
        hasPendingRecovery: false,
        itemsLikelyAvailable: false,
      };
    }

    const timeAgo = this.formatTimeAgo(lastDeath.timestamp);
    const timeRemaining = availability.timeRemaining > 0
      ? this.formatDuration(availability.timeRemaining)
      : undefined;

    return {
      hasPendingRecovery: true,
      lastDeath: {
        position: lastDeath.position,
        cause: lastDeath.cause,
        timeAgo,
        attempts: lastDeath.recoveryAttempts,
      },
      itemsLikelyAvailable: availability.available,
      timeRemaining,
    };
  }

  private getHistory(): HistoryResult {
    const history = getDeathHistory();
    const stats = getDeathStats();

    return {
      deaths: history.slice(0, 10).map((d) => ({
        position: d.position,
        cause: d.cause,
        recovered: d.recovered,
        timeAgo: this.formatTimeAgo(d.timestamp),
      })),
      stats: {
        totalDeaths: stats.totalDeaths,
        recoveredCount: stats.recoveredCount,
      },
    };
  }

  private markAsRecovered(): { success: boolean; message: string } {
    const success = markRecovered();
    return {
      success,
      message: success
        ? 'Death marked as recovered'
        : 'No pending death to mark as recovered',
    };
  }

  private async attemptRecovery(bot: Bot, maxAttempts: number): Promise<RecoveryResult> {
    const lastDeath = getLastDeath();

    if (!lastDeath) {
      return {
        success: false,
        message: 'No pending death to recover from',
      };
    }

    const availability = itemsLikelyAvailable();
    if (!availability.available) {
      return {
        success: false,
        message: 'Items have likely despawned (5 minute timer expired)',
        deathLocation: lastDeath.position,
        timeRemaining: 0,
      };
    }

    if (lastDeath.recoveryAttempts >= maxAttempts) {
      return {
        success: false,
        message: `Maximum recovery attempts (${maxAttempts}) reached. Use mark_recovered to clear.`,
        deathLocation: lastDeath.position,
      };
    }

    // Increment attempts
    const attempts = incrementRecoveryAttempts();

    // Use task mutex for navigation
    return withTask(bot, async () => {
      try {
        // Check pathfinder is available
        if (!bot.pathfinder) {
          return {
            success: false,
            message: `Recovery failed: pathfinder not available. Attempt ${attempts}/${maxAttempts}.`,
            deathLocation: lastDeath.position,
            timeRemaining: availability.timeRemaining,
          };
        }

        // Navigate to death location
        const goal = new goals.GoalNear(
          lastDeath.position.x,
          lastDeath.position.y,
          lastDeath.position.z,
          2
        );

        await bot.pathfinder.goto(goal);

        // Collect nearby items
        const itemsBefore = bot.inventory.items().length;

        // Wait a moment for items to be picked up
        await new Promise((r) => setTimeout(r, 2000));

        // Try to collect any nearby items
        const nearbyItems = Object.values(bot.entities).filter((e) => {
          if (!e || !e.position || e.type !== 'object') return false;
          if ((e as ItemEntity).objectType !== 'Item') return false;
          const dist = e.position.distanceTo(bot.entity.position);
          return dist <= 4;
        });

        for (const item of nearbyItems) {
          if (!item.position) continue;
          try {
            const itemGoal = new goals.GoalNear(
              item.position.x,
              item.position.y,
              item.position.z,
              0.5
            );
            await bot.pathfinder.goto(itemGoal);
            await new Promise((r) => setTimeout(r, 500));
          } catch {
            // Item may have been picked up
          }
        }

        const itemsAfter = bot.inventory.items().length;
        const itemsCollected = itemsAfter - itemsBefore;

        // Mark as recovered
        markRecovered();

        return {
          success: true,
          message: `Recovery complete! Collected ${itemsCollected} item stacks.`,
          deathLocation: lastDeath.position,
          itemsCollected,
          timeRemaining: availability.timeRemaining,
        };
      } catch (error) {
        return {
          success: false,
          message: `Recovery failed: ${error instanceof Error ? error.message : String(error)}. Attempt ${attempts}/${maxAttempts}.`,
          deathLocation: lastDeath.position,
          timeRemaining: availability.timeRemaining,
        };
      }
    });
  }

  private formatTimeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }
}
