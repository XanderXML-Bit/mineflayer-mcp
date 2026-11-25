/**
 * Explore Area Tool
 *
 * Systematically explore in a direction, marking chunks as explored.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { withTask } from '../../services/task.service.js';
import {
  markExplored,
  getUnexploredDirection,
  addPointOfInterest,
} from '../../services/exploration.service.js';

const InputSchema = BaseInputSchema.extend({
  direction: z
    .enum(['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest', 'auto'])
    .optional()
    .default('auto')
    .describe('Direction to explore. "auto" picks an unexplored direction.'),
  distance: z
    .number()
    .int()
    .min(16)
    .max(256)
    .optional()
    .default(64)
    .describe('How far to travel in blocks'),
  markPOIs: z
    .boolean()
    .optional()
    .default(true)
    .describe('Automatically mark interesting structures as POIs'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  success: boolean;
  direction: string;
  chunksExplored: number;
  poisFound: string[];
  distance: number;
  message: string;
}

export class ExploreAreaTool extends BaseTool<Input, Output> {
  readonly name = 'exploreArea';
  readonly description =
    'Explore in a direction, marking chunks as explored and optionally discovering points of interest.';
  readonly category = 'navigation' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    // Determine direction
    let direction: string = input.direction;
    let targetX: number;
    let targetZ: number;

    const pos = bot.entity.position;

    if (input.direction === 'auto') {
      const suggestion = getUnexploredDirection(bot);
      direction = suggestion.direction;
      targetX = suggestion.target.x;
      targetZ = suggestion.target.z;
    } else {
      // Calculate target based on direction
      const dirVectors: Record<string, { dx: number; dz: number }> = {
        north: { dx: 0, dz: -1 },
        south: { dx: 0, dz: 1 },
        east: { dx: 1, dz: 0 },
        west: { dx: -1, dz: 0 },
        northeast: { dx: 1, dz: -1 },
        northwest: { dx: -1, dz: -1 },
        southeast: { dx: 1, dz: 1 },
        southwest: { dx: -1, dz: 1 },
      };

      const vec = dirVectors[direction];
      targetX = pos.x + vec.dx * input.distance;
      targetZ = pos.z + vec.dz * input.distance;
    }

    return withTask(bot, async () => {
      const chunksExplored: Set<string> = new Set();
      const poisFound: string[] = [];

      try {
        const { default: pathfinderPkg } = await import('mineflayer-pathfinder');
        const { goals } = pathfinderPkg;

        // Mark starting chunk
        markExplored(bot);
        chunksExplored.add(`${Math.floor(pos.x / 16)},${Math.floor(pos.z / 16)}`);

        // Navigate to target, marking chunks along the way
        const goal = new goals.GoalNear(targetX, pos.y, targetZ, 4);

        // Set up interval to mark chunks during travel
        const markInterval = setInterval(() => {
          const currentPos = bot.entity.position;
          const chunkKey = `${Math.floor(currentPos.x / 16)},${Math.floor(currentPos.z / 16)}`;
          if (!chunksExplored.has(chunkKey)) {
            markExplored(bot);
            chunksExplored.add(chunkKey);

            // Check for POIs if enabled
            if (input.markPOIs) {
              const pois = this.detectNearbyPOIs(bot);
              for (const poi of pois) {
                if (!poisFound.includes(poi)) {
                  poisFound.push(poi);
                }
              }
            }
          }
        }, 1000);

        try {
          await bot.pathfinder?.goto(goal);
        } finally {
          clearInterval(markInterval);
        }

        // Mark final chunk
        markExplored(bot);
        const finalChunk = `${Math.floor(bot.entity.position.x / 16)},${Math.floor(bot.entity.position.z / 16)}`;
        chunksExplored.add(finalChunk);

        // Final POI check
        if (input.markPOIs) {
          const pois = this.detectNearbyPOIs(bot);
          for (const poi of pois) {
            if (!poisFound.includes(poi)) {
              poisFound.push(poi);
            }
          }
        }

        const distanceTraveled = Math.sqrt(
          Math.pow(bot.entity.position.x - pos.x, 2) +
            Math.pow(bot.entity.position.z - pos.z, 2)
        );

        return {
          success: true,
          direction,
          chunksExplored: chunksExplored.size,
          poisFound,
          distance: Math.round(distanceTraveled),
          message: `Explored ${chunksExplored.size} chunks heading ${direction}. Traveled ${Math.round(distanceTraveled)} blocks.${poisFound.length > 0 ? ` Found: ${poisFound.join(', ')}` : ''}`,
        };
      } catch (error) {
        return {
          success: false,
          direction,
          chunksExplored: chunksExplored.size,
          poisFound,
          distance: 0,
          message: `Exploration interrupted: ${error}. Explored ${chunksExplored.size} chunks.`,
        };
      }
    });
  }

  private detectNearbyPOIs(bot: Bot): string[] {
    const found: string[] = [];
    const pos = bot.entity.position;
    const dimension = this.getDimension(bot);

    // Check for villages (look for bell, villagers)
    const villagers = Object.values(bot.entities).filter(
      (e) => e.name === 'villager' && e.position.distanceTo(pos) < 32
    );
    if (villagers.length >= 2) {
      addPointOfInterest('village', pos, dimension, `${villagers.length} villagers`);
      found.push('village');
    }

    // Check for specific blocks that indicate structures
    const structureBlocks: Record<string, string> = {
      spawner: 'dungeon',
      end_portal_frame: 'stronghold',
      nether_portal: 'nether_portal',
    };

    for (const [blockName, poiType] of Object.entries(structureBlocks)) {
      try {
        const block = bot.findBlock({
          matching: (b) => b.name === blockName,
          maxDistance: 16,
        });
        if (block) {
          addPointOfInterest(poiType, block.position, dimension);
          found.push(poiType);
        }
      } catch {
        // Block not found, continue
      }
    }

    return found;
  }

  private getDimension(bot: Bot): string {
    const dim = String(bot.game?.dimension ?? 'overworld');
    if (dim.includes('nether')) return 'nether';
    if (dim.includes('end')) return 'end';
    return 'overworld';
  }
}
