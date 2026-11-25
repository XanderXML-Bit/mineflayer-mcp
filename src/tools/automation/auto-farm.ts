/**
 * Auto-Farm Tool
 * Automatically harvest and replant crops in an area
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { withTask } from '../../services/task.service.js';
import { configureMovements } from '../../services/navigation.service.js';
import mcData from 'minecraft-data';
import { Vec3 } from 'vec3';
import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg;

/** Block properties that include age for crops */
interface CropBlockProperties {
  age?: number;
}

/** Block with metadata property */
interface BlockWithMetadata {
  metadata?: number;
}

const InputSchema = BaseInputSchema.extend({
  radius: z.number().optional().default(32).describe('Radius to search for crops'),
  replant: z.boolean().optional().default(true).describe('Replant crops after harvesting'),
  cropType: z.enum(['all', 'wheat', 'carrots', 'potatoes', 'beetroots', 'nether_wart']).optional().default('all')
    .describe('Type of crop to harvest'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  success: boolean;
  harvested: number;
  replanted: number;
  itemsCollected: { item: string; count: number }[];
  error?: string;
}

// Crop block names and their seed names
const CROPS: Record<string, { blockName: string; seedName: string; maxAge: number }> = {
  wheat: { blockName: 'wheat', seedName: 'wheat_seeds', maxAge: 7 },
  carrots: { blockName: 'carrots', seedName: 'carrot', maxAge: 7 },
  potatoes: { blockName: 'potatoes', seedName: 'potato', maxAge: 7 },
  beetroots: { blockName: 'beetroots', seedName: 'beetroot_seeds', maxAge: 3 },
  nether_wart: { blockName: 'nether_wart', seedName: 'nether_wart', maxAge: 3 },
};

export class AutoFarmTool extends BaseTool<Input, Output> {
  readonly name = 'autoFarm';
  readonly description = 'Automatically harvest and replant crops in an area';
  readonly category = 'automation' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    return withTask(bot, async (signal) => {
      let aborted = false;
      signal.onAbort(() => { aborted = true; });

      const { radius, replant, cropType } = input;
      const data = mcData(bot.version);

      let harvested = 0;
      let replantedCount = 0;
      const startInventory = new Map<string, number>();
      for (const item of bot.inventory.items()) {
        startInventory.set(item.name, (startInventory.get(item.name) || 0) + item.count);
      }

      // Get crops to harvest
      const cropsToCheck: [string, { blockName: string; seedName: string; maxAge: number }][] =
        cropType === 'all'
          ? Object.entries(CROPS) as [string, { blockName: string; seedName: string; maxAge: number }][]
          : [[cropType, CROPS[cropType]] as [string, { blockName: string; seedName: string; maxAge: number }]];

      // Configure pathfinder
      const movements = configureMovements(bot);
      movements.canDig = false;
      movements.allowParkour = false;
      bot.pathfinder.setMovements(movements);

      for (const [_name, cropInfo] of cropsToCheck) {
        if (aborted) break;
        if (!cropInfo) continue;

        const blockData = data.blocksByName[cropInfo.blockName];
        if (!blockData) continue;

        // Find all crops, then filter for mature ones
        const searchRadius = radius ?? 32;
        const allCrops = bot.findBlocks({
          matching: blockData.id,
          maxDistance: searchRadius,
          count: 200,
        });

        // Filter for mature crops
        const crops = allCrops.filter(pos => {
          const block = bot.blockAt(pos);
          if (!block) return false;
          const props = block.getProperties() as CropBlockProperties;
          const blockMeta = block as unknown as BlockWithMetadata;
          const age = props?.age ?? blockMeta.metadata ?? 0;
          return age >= cropInfo.maxAge;
        });

        for (const cropPos of crops) {
          if (aborted) break;

          const block = bot.blockAt(cropPos);
          if (!block) continue;

          // Check maturity again
          const blockMeta = block as unknown as BlockWithMetadata;
          const props = block.getProperties() as CropBlockProperties;
          const age = blockMeta.metadata ?? props?.age ?? 0;
          if (age < cropInfo.maxAge) continue;

          // Navigate to crop
          const { GoalNear } = goals;
          try {
            await bot.pathfinder.goto(new GoalNear(cropPos.x, cropPos.y, cropPos.z, 2));
          } catch {
            continue; // Skip if can't reach
          }

          // Harvest the crop
          const currentBlock = bot.blockAt(cropPos);
          if (currentBlock && currentBlock.type === blockData.id) {
            try {
              await bot.dig(currentBlock);
              harvested++;

              // Wait for drops
              await new Promise(resolve => setTimeout(resolve, 300));

              // Pick up nearby items
              const nearbyItems = Object.values(bot.entities).filter(e =>
                e.objectType === 'Item' &&
                e.position.distanceTo(bot.entity.position) < 4
              );

              for (const item of nearbyItems) {
                if (aborted) break;
                try {
                  await bot.pathfinder.goto(new GoalNear(item.position.x, item.position.y, item.position.z, 0.5));
                  await new Promise(resolve => setTimeout(resolve, 100));
                } catch {
                  // Continue
                }
              }

              // Replant if enabled
              if (replant) {
                const seed = bot.inventory.items().find(i => i.name === cropInfo.seedName);
                if (seed) {
                  const farmland = bot.blockAt(cropPos.offset(0, -1, 0));
                  if (farmland && (farmland.name === 'farmland' || farmland.name === 'soul_sand')) {
                    try {
                      await bot.equip(seed, 'hand');
                      await bot.placeBlock(farmland, new Vec3(0, 1, 0));
                      replantedCount++;
                      await new Promise(resolve => setTimeout(resolve, 100));
                    } catch {
                      // Replanting failed
                    }
                  }
                }
              }
            } catch {
              // Continue to next crop
            }
          }
        }
      }

      // Calculate collected items
      const itemsCollected: { item: string; count: number }[] = [];
      for (const item of bot.inventory.items()) {
        const prevCount = startInventory.get(item.name) || 0;
        if (item.count > prevCount) {
          const existing = itemsCollected.find(i => i.item === item.name);
          if (existing) {
            existing.count += item.count - prevCount;
          } else {
            itemsCollected.push({ item: item.name, count: item.count - prevCount });
          }
        }
      }

      return {
        success: harvested > 0,
        harvested,
        replanted: replantedCount,
        itemsCollected,
        error: harvested === 0 ? 'No mature crops found in range' : undefined,
      };
    });
  }
}
