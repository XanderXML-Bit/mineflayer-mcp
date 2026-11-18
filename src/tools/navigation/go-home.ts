/**
 * Go Home Tool
 *
 * Navigate to a saved home location.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { recall } from '../../services/memory.service.js';
import { withTask } from '../../services/task.service.js';

const InputSchema = BaseInputSchema.extend({
  name: z
    .string()
    .min(1)
    .optional()
    .default('home')
    .describe('Name of home location to go to'),
});

type Input = z.infer<typeof InputSchema>;

interface HomeLocation {
  name: string;
  position: { x: number; y: number; z: number };
  dimension: string;
  setAt: number;
}

interface Output {
  success: boolean;
  destination?: HomeLocation;
  distance?: number;
  message: string;
}

export class GoHomeTool extends BaseTool<Input, Output> {
  readonly name = 'goHome';
  readonly description =
    'Navigate to a saved home location. Uses pathfinding to travel safely.';
  readonly category = 'navigation' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    // Get saved homes
    const homes = recall<Record<string, HomeLocation>>('home:locations', 'spatial') ?? {};
    const home = homes[input.name];

    if (!home) {
      const available = Object.keys(homes);
      if (available.length === 0) {
        return {
          success: false,
          message: `No home locations saved. Use setHome first.`,
        };
      }
      return {
        success: false,
        message: `Home "${input.name}" not found. Available: ${available.join(', ')}`,
      };
    }

    // Check dimension match
    const currentDim = this.getDimension(bot);
    if (home.dimension !== currentDim) {
      return {
        success: false,
        destination: home,
        message: `Cannot navigate to "${input.name}" - it's in ${home.dimension} but you're in ${currentDim}`,
      };
    }

    // Calculate distance
    const pos = bot.entity.position;
    const distance = Math.sqrt(
      Math.pow(home.position.x - pos.x, 2) +
        Math.pow(home.position.y - pos.y, 2) +
        Math.pow(home.position.z - pos.z, 2)
    );

    // Navigate using pathfinder
    return withTask(bot, async () => {
      try {
        const { goals } = await import('mineflayer-pathfinder');
        const goal = new goals.GoalNear(
          home.position.x,
          home.position.y,
          home.position.z,
          2
        );

        await bot.pathfinder?.goto(goal);

        return {
          success: true,
          destination: home,
          distance: Math.round(distance),
          message: `Arrived at "${input.name}" (${Math.round(distance)} blocks traveled)`,
        };
      } catch (error) {
        return {
          success: false,
          destination: home,
          distance: Math.round(distance),
          message: `Failed to reach "${input.name}": ${error}`,
        };
      }
    });
  }

  private getDimension(bot: Bot): string {
    const dim = String(bot.game?.dimension ?? 'overworld');
    if (dim.includes('nether')) return 'nether';
    if (dim.includes('end')) return 'end';
    return 'overworld';
  }
}
