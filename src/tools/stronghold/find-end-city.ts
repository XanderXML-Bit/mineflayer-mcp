/**
 * Find End City Tool
 * Search for end cities in the End dimension
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { withTask } from '../../services/task.service.js';
import { configureMovements } from '../../services/navigation.service.js';
import mcData from 'minecraft-data';

import { goals } from 'mineflayer-pathfinder';

/** Bot game with dimension */
interface GameWithDimension {
  dimension?: string;
}

const InputSchema = BaseInputSchema.extend({
  searchRadius: z.number().optional().default(200).describe('Radius to search for end city blocks'),
  navigateTo: z.boolean().optional().default(false).describe('Navigate to found end city'),
});

type Input = z.infer<typeof InputSchema>;

interface EndCityInfo {
  position: { x: number; y: number; z: number };
  distance: number;
  hasShip: boolean;
  blocksFound: string[];
}

interface Output {
  success: boolean;
  inEndDimension: boolean;
  cities: EndCityInfo[];
  nearest?: EndCityInfo;
  navigated?: boolean;
  error?: string;
}

// End city specific blocks
const END_CITY_BLOCKS = [
  'purpur_block',
  'purpur_pillar',
  'purpur_stairs',
  'purpur_slab',
  'end_rod',
  'end_stone_bricks',
  'shulker_box',
];

// End ship specific blocks
const END_SHIP_BLOCKS = [
  'dragon_head',
  'brewing_stand', // Found on ships
];

export class FindEndCityTool extends BaseTool<Input, Output> {
  readonly name = 'findEndCity';
  readonly description = 'Search for end cities in the End dimension';
  readonly category = 'navigation' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    return withTask(bot, async (signal) => {
      let aborted = false;
      signal.onAbort(() => { aborted = true; });

      const { searchRadius, navigateTo } = input;
      const data = mcData(bot.version);

      // Check if in the End
      const dimension = (bot.game as GameWithDimension).dimension || 'overworld';
      if (!dimension.includes('end')) {
        return {
          success: false,
          inEndDimension: false,
          cities: [],
          error: 'Not in the End dimension. Use a portal to travel to the End first.',
        };
      }

      const botPos = bot.entity.position;
      const cities: EndCityInfo[] = [];
      const checkedAreas = new Set<string>();

      // Search for end city blocks
      for (const blockName of END_CITY_BLOCKS) {
        if (aborted) break;

        const blockData = data.blocksByName[blockName];
        if (!blockData) continue;

        const blocks = bot.findBlocks({
          matching: blockData.id,
          maxDistance: searchRadius ?? 200,
          count: 50,
        });

        for (const pos of blocks) {
          if (aborted) break;

          // Group blocks into potential city locations (within 50 blocks)
          const areaKey = `${Math.floor(pos.x / 50)},${Math.floor(pos.z / 50)}`;
          if (checkedAreas.has(areaKey)) continue;
          checkedAreas.add(areaKey);

          // Count nearby end city blocks
          const nearbyBlocks: string[] = [];
          let hasShip = false;

          for (const cityBlock of END_CITY_BLOCKS) {
            const cityBlockData = data.blocksByName[cityBlock];
            if (!cityBlockData) continue;

            const nearby = bot.findBlocks({
              matching: cityBlockData.id,
              maxDistance: 30,
              count: 10,
              point: pos,
            });

            if (nearby.length > 0) {
              nearbyBlocks.push(cityBlock);
            }
          }

          // Check for end ship indicators
          for (const shipBlock of END_SHIP_BLOCKS) {
            const shipBlockData = data.blocksByName[shipBlock];
            if (!shipBlockData) continue;

            const nearby = bot.findBlocks({
              matching: shipBlockData.id,
              maxDistance: 50,
              count: 1,
              point: pos,
            });

            if (nearby.length > 0) {
              hasShip = true;
              break;
            }
          }

          // Consider it a city if we found multiple different end city blocks
          if (nearbyBlocks.length >= 3) {
            const distance = pos.distanceTo(botPos);

            // Avoid duplicates (within 100 blocks)
            const isDuplicate = cities.some(c =>
              Math.abs(c.position.x - pos.x) < 100 &&
              Math.abs(c.position.z - pos.z) < 100
            );

            if (!isDuplicate) {
              cities.push({
                position: {
                  x: Math.round(pos.x),
                  y: Math.round(pos.y),
                  z: Math.round(pos.z),
                },
                distance: Math.round(distance),
                hasShip,
                blocksFound: [...new Set(nearbyBlocks)],
              });
            }
          }
        }
      }

      // Sort by distance
      cities.sort((a, b) => a.distance - b.distance);

      // Navigate to nearest if requested
      let navigated = false;
      if (navigateTo && cities.length > 0 && !aborted) {
        const nearest = cities[0];
        const movements = configureMovements(bot);
        bot.pathfinder.setMovements(movements);

        const { GoalNear } = goals;
        try {
          await bot.pathfinder.goto(new GoalNear(
            nearest.position.x,
            nearest.position.y,
            nearest.position.z,
            5
          ));
          navigated = true;
        } catch {
          // Navigation failed but city was still found
        }
      }

      return {
        success: cities.length > 0,
        inEndDimension: true,
        cities,
        nearest: cities[0],
        navigated: navigateTo ? navigated : undefined,
        error: cities.length === 0 ? `No end cities found within ${searchRadius} blocks` : undefined,
      };
    });
  }
}
