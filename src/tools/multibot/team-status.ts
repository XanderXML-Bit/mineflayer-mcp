/**
 * Team Status Tool
 * Get status of all active bots
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';

/** Bot game with dimension */
interface GameWithDimension {
  dimension?: string;
}

const InputSchema = BaseInputSchema.extend({});

type Input = z.infer<typeof InputSchema>;

interface BotStatusInfo {
  name: string;
  health: number;
  food: number;
  position: { x: number; y: number; z: number };
  dimension: string;
  isAlive: boolean;
  inventory: {
    usedSlots: number;
    totalSlots: number;
    items: number;
  };
}

interface Output {
  success: boolean;
  activeBots: number;
  bots: BotStatusInfo[];
  leader?: string;
  error?: string;
}

export class TeamStatusTool extends BaseTool<Input, Output> {
  readonly name = 'getTeamStatus';
  readonly description = 'Get status of all active bots in the team';
  readonly category = 'utility' as const;
  readonly inputSchema = InputSchema;

  protected async execute(_input: Input, _bot: Bot): Promise<Output> {
    const allBots = this.context.getAllBots();

    if (allBots.size === 0) {
      return {
        success: false,
        activeBots: 0,
        bots: [],
        error: 'No active bots',
      };
    }

    const bots: BotStatusInfo[] = [];

    for (const [name, bot] of allBots) {
      const pos = bot.entity.position;
      const inventory = bot.inventory.items();

      bots.push({
        name,
        health: Math.round(bot.health * 10) / 10,
        food: bot.food,
        position: {
          x: Math.round(pos.x),
          y: Math.round(pos.y),
          z: Math.round(pos.z),
        },
        dimension: (bot.game as GameWithDimension).dimension || 'overworld',
        isAlive: bot.health > 0,
        inventory: {
          usedSlots: inventory.length,
          totalSlots: 36,
          items: inventory.reduce((sum: number, i) => sum + i.count, 0),
        },
      });
    }

    // First bot is typically the leader
    const leader = bots[0]?.name;

    return {
      success: true,
      activeBots: bots.length,
      bots,
      leader,
    };
  }
}
