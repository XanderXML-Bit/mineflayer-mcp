/**
 * Form Up Tool
 * Have all bots gather at a location
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { withTask } from '../../services/task.service.js';
import { configureMovements } from '../../services/navigation.service.js';
import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg;

const InputSchema = BaseInputSchema.extend({
  x: z.number().optional().describe('X coordinate to gather at (default: current bot position)'),
  y: z.number().optional().describe('Y coordinate to gather at'),
  z: z.number().optional().describe('Z coordinate to gather at'),
  formationSpread: z.number().optional().default(2).describe('Distance between bots'),
});

type Input = z.infer<typeof InputSchema>;

interface BotResult {
  name: string;
  arrived: boolean;
  position: { x: number; y: number; z: number };
  error?: string;
}

interface Output {
  success: boolean;
  gatherPoint: { x: number; y: number; z: number };
  results: BotResult[];
  allArrived: boolean;
  error?: string;
}

export class FormUpTool extends BaseTool<Input, Output> {
  readonly name = 'formUp';
  readonly description = 'Have all bots gather at a location in formation';
  readonly category = 'utility' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    return withTask(bot, async (signal) => {
      let aborted = false;
      signal.onAbort(() => { aborted = true; });

      const allBots = this.context.getAllBots();

      if (allBots.size === 0) {
        return {
          success: false,
          gatherPoint: { x: 0, y: 0, z: 0 },
          results: [],
          allArrived: false,
          error: 'No active bots',
        };
      }

      // Determine gather point
      const gatherPoint = {
        x: input.x ?? Math.round(bot.entity.position.x),
        y: input.y ?? Math.round(bot.entity.position.y),
        z: input.z ?? Math.round(bot.entity.position.z),
      };

      const spread = input.formationSpread ?? 2;
      const results: BotResult[] = [];

      // Calculate formation positions
      const formationOffsets = [
        { x: 0, z: 0 },           // Center
        { x: -spread, z: 0 },   // Left
        { x: spread, z: 0 },    // Right
        { x: 0, z: -spread },   // Back
        { x: 0, z: spread },    // Front
        { x: -spread, z: -spread }, // Back-left
        { x: spread, z: -spread },  // Back-right
        { x: -spread, z: spread },  // Front-left
        { x: spread, z: spread },   // Front-right
      ];

      // Navigate each bot
      let i = 0;
      for (const [name, targetBot] of allBots) {
        if (aborted) break;

        const offset = formationOffsets[i % formationOffsets.length];
        const targetX = gatherPoint.x + offset.x;
        const targetZ = gatherPoint.z + offset.z;

        try {
          const movements = configureMovements(targetBot);
          targetBot.pathfinder.setMovements(movements);

          const { GoalNear } = goals;
          await targetBot.pathfinder.goto(new GoalNear(targetX, gatherPoint.y, targetZ, 1));

          results.push({
            name,
            arrived: true,
            position: {
              x: Math.round(targetBot.entity.position.x),
              y: Math.round(targetBot.entity.position.y),
              z: Math.round(targetBot.entity.position.z),
            },
          });
        } catch {
          results.push({
            name,
            arrived: false,
            position: {
              x: Math.round(targetBot.entity.position.x),
              y: Math.round(targetBot.entity.position.y),
              z: Math.round(targetBot.entity.position.z),
            },
            error: 'Navigation failed',
          });
        }

        i++;
      }

      const allArrived = results.every(r => r.arrived);

      return {
        success: results.some(r => r.arrived),
        gatherPoint,
        results,
        allArrived,
      };
    });
  }
}
