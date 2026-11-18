/**
 * Harvest Crops Tool
 * Harvest mature crops and optionally replant
 */

import { z } from 'zod';
import { Vec3 } from 'vec3';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { withTask } from '../../services/task.service.js';
import { createEquipmentService } from '../../services/equipment.service.js';
import { configureMovements, waitForNavigation } from '../../services/navigation.service.js';

import pathfinderPkg from 'mineflayer-pathfinder';
import type { Block } from 'prismarine-block';
const { goals } = pathfinderPkg;

const InputSchema = BaseInputSchema.extend({
  count: z.number().optional().default(8).describe('Number of crops to harvest'),
  stallMs: z.number().optional().default(20000).describe('Stall timeout in milliseconds'),
});

type Input = z.infer<typeof InputSchema>;

interface FailedBlock {
  x: number;
  y: number;
  z: number;
  error?: string;
}

interface Output {
  ok: boolean;
  requested: number;
  harvested: number;
  remaining: number;
  failed: FailedBlock[];
  stalled: boolean;
  timedOut: boolean;
}

export class HarvestCropsTool extends BaseTool<Input, Output> {
  readonly name = 'harvestMatureCrops';
  readonly description = 'Harvest mature crops and optionally replant';
  readonly category = 'farming' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { count, stallMs } = input;
    const equipment = createEquipmentService();

    return withTask(bot, async (_signal) => {
      const crops = ['wheat', 'carrots', 'potatoes', 'beetroots'];
      const want = Math.max(1, count ?? 8);
      const radius = 16;
      const origin = bot.entity.position.floored();
      const blocks: Block[] = [];

      // Scan for mature crops
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          for (let dy = -2; dy <= 2; dy++) {
            const p = new Vec3(origin.x + dx, origin.y + dy, origin.z + dz);
            const b = bot.blockAt(p);
            if (!b) continue;
            if (!crops.includes(b.name)) continue;
            // Get block age property - mature crops have age >= 7
            const stateProps = b.getProperties?.() as Record<string, unknown> | undefined;
            const age = typeof stateProps?.age === 'number' ? stateProps.age : 0;
            if (age >= 7) blocks.push(b);
          }
        }
      }

      if (!blocks.length) {
        throw new Error('No mature crops found');
      }

      let harvested = 0;
      const failed: FailedBlock[] = [];
      const stallTimeout = stallMs ?? 20000;
      let lastProgressAt = Date.now();

      for (const b of blocks) {
        if (Date.now() - lastProgressAt > stallTimeout) break;

        const pos = b.position;
        try {
          const movements = configureMovements(bot);
          bot.pathfinder.setMovements(movements);
          bot.pathfinder.setGoal(new goals.GoalNear(pos.x, pos.y, pos.z, 1));

          await waitForNavigation(bot, pos, { timeoutMs: 20000, arrivedDistance: 2.5 });

          // Dig crop
          equipment.pushSuspendAutoEat(bot);
          try {
            await bot.dig(b);
          } finally {
            equipment.popSuspendAutoEat(bot);
          }

          await bot.waitForTicks(2);
          harvested++;
          lastProgressAt = Date.now();

          // Try to replant
          try {
            const seedMap: Record<string, string> = {
              wheat: 'wheat_seeds',
              carrots: 'carrot',
              potatoes: 'potato',
              beetroots: 'beetroot_seeds',
            };
            const cropName = b.name;
            const seedName = seedMap[cropName];

            if (seedName) {
              const farmland = bot.blockAt(new Vec3(pos.x, pos.y - 1, pos.z));
              const seedItem = bot.inventory.items().find((i) => i.name === seedName);

              if (farmland && farmland.name === 'farmland' && seedItem) {
                equipment.pushSuspendAutoEat(bot);
                try {
                  await bot.equip(seedItem, 'hand');
                } finally {
                  equipment.popSuspendAutoEat(bot);
                }

                equipment.pushSuspendAutoEat(bot);
                try {
                  await bot.activateBlock(farmland);
                } finally {
                  equipment.popSuspendAutoEat(bot);
                }

                await bot.waitForTicks(3);

                const replanted = bot.blockAt(new Vec3(pos.x, pos.y, pos.z));
                if (
                  !replanted ||
                  (replanted.name !== 'wheat' &&
                    replanted.name !== 'carrots' &&
                    replanted.name !== 'potatoes' &&
                    replanted.name !== 'beetroots')
                ) {
                  failed.push({ x: pos.x, y: pos.y, z: pos.z, error: 'replant_failed' });
                }
              }
            }
          } catch {
            // Ignore replant errors
          }

          if (harvested >= want) break;
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          failed.push({ x: pos.x, y: pos.y, z: pos.z, error: errMsg });
        }

        if (Date.now() - lastProgressAt > stallTimeout) break;
      }

      const stalled = Date.now() - lastProgressAt > stallTimeout && harvested < want;

      return {
        ok: harvested > 0,
        requested: want,
        harvested,
        remaining: Math.max(0, want - harvested),
        failed,
        stalled,
        timedOut: stalled,
      };
    });
  }
}
