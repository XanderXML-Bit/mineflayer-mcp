/**
 * Plant Seeds Tool
 * Plant seeds on farmland within a radius
 */

import { z } from 'zod';
import { Vec3 } from 'vec3';
import type { Bot } from 'mineflayer';
import type { Block } from 'prismarine-block';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { withTask } from '../../services/task.service.js';
import { createEquipmentService } from '../../services/equipment.service.js';
import { configureMovements, waitForNavigation } from '../../services/navigation.service.js';

import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg;

const InputSchema = BaseInputSchema.extend({
  seedName: z.string().optional().default('wheat_seeds').describe('Name of the seeds to plant'),
  radius: z.number().optional().default(3).describe('Radius to search for farmland'),
});

type Input = z.infer<typeof InputSchema>;

interface FailedBlock {
  x: number;
  y: number;
  z: number;
  reason?: string;
}

interface Output {
  ok: boolean;
  planted: number;
  failed: FailedBlock[];
}

export class PlantSeedsTool extends BaseTool<Input, Output> {
  readonly name = 'plantSeedsWithinRadius';
  readonly description = 'Plant seeds on farmland within a radius';
  readonly category = 'farming' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { seedName, radius } = input;
    const equipment = createEquipmentService();

    return withTask(bot, async (_signal) => {
      const seed = bot.inventory.items().find((i) => i.name === seedName);
      if (!seed) {
        throw new Error('Seeds not in inventory');
      }

      equipment.pushSuspendAutoEat(bot);
      try {
        await bot.equip(seed, 'hand');
      } finally {
        equipment.popSuspendAutoEat(bot);
      }

      const origin = bot.entity.position.floored();
      let planted = 0;
      const failed: FailedBlock[] = [];
      const searchRadius = radius ?? 3;

      for (let dx = -searchRadius; dx <= searchRadius; dx++) {
        for (let dz = -searchRadius; dz <= searchRadius; dz++) {
          const x = origin.x + dx;
          const z = origin.z + dz;

          // Scan small vertical band for farmland
          let pos: Vec3 | null = null;
          let farmland: Block | null = null;

          for (let dy = -1; dy <= 2; dy++) {
            const p = new Vec3(x, origin.y + dy, z);
            const bl = bot.blockAt(p);
            const ab = bot.blockAt(p.offset(0, 1, 0));

            if (!bl || !ab) continue;
            if (bl.name === 'farmland' && ab.boundingBox === 'empty') {
              pos = p;
              farmland = bl;
              break;
            }
          }

          if (!pos) continue;

          try {
            // Navigate if too far
            if (bot.entity.position.distanceTo(pos) > 4.5) {
              const movements = configureMovements(bot);
              bot.pathfinder.setMovements(movements);
              bot.pathfinder.setGoal(new goals.GoalNear(pos.x, pos.y, pos.z, 2));

              await waitForNavigation(bot, pos, { timeoutMs: 15000, arrivedDistance: 4.5 });
            }

            // Plant by activating block
            if (!farmland) continue;
            equipment.pushSuspendAutoEat(bot);
            try {
              await bot.activateBlock(farmland);
            } finally {
              equipment.popSuspendAutoEat(bot);
            }

            planted++;
            await bot.waitForTicks(3);

            // Verify crop appeared
            const crop = bot.blockAt(pos.offset(0, 1, 0));
            if (
              !crop ||
              (crop.name !== 'wheat' &&
                crop.name !== 'carrots' &&
                crop.name !== 'potatoes' &&
                crop.name !== 'beetroots')
            ) {
              failed.push({ x: pos.x, y: pos.y, z: pos.z, reason: 'no_crop_detected' });
            }
          } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            failed.push({ x: pos.x, y: pos.y, z: pos.z, reason: errorMessage });
          }
        }
      }

      return { ok: planted > 0, planted, failed };
    });
  }
}
