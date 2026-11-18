/**
 * Prepare Farmland Tool
 * Till dirt/grass blocks with a hoe to create farmland
 */

import { z } from 'zod';
import { Vec3 } from 'vec3';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { createEquipmentService } from '../../services/equipment.service.js';
import { configureMovements, waitForNavigation } from '../../services/navigation.service.js';
import { isWaterLike, isPlantObstruction } from '../../utils/block-helpers.js';

import { goals } from 'mineflayer-pathfinder';

const InputSchema = BaseInputSchema.extend({
  radius: z.number().optional().default(3).describe('Radius to search for tillable dirt'),
  requireWater: z
    .boolean()
    .optional()
    .default(true)
    .describe('Only till blocks near water for hydration'),
});

type Input = z.infer<typeof InputSchema>;

interface TillAttempt {
  x: number;
  y: number;
  z: number;
  ok: boolean;
}

interface Output {
  ok: boolean;
  tilled: number;
  attempted: TillAttempt[];
  reason?: string;
  hydrationRadius?: number;
}

export class PrepareFarmlandTool extends BaseTool<Input, Output> {
  readonly name = 'prepareLandForFarming';
  readonly description = 'Till dirt/grass blocks with a hoe to create farmland';
  readonly category = 'building' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { radius, requireWater } = input;
    const equipment = createEquipmentService();

    const hoe = bot.inventory.items().find((i) => i.name?.includes('hoe'));
    if (!hoe) {
      throw new Error('No hoe in inventory');
    }

    const searchRadius = radius ?? 3;
    const hydrationRadius = 4; // Minecraft hydration: up to 4 blocks horizontally
    const origin = bot.entity.position.floored();

    equipment.pushSuspendAutoEat(bot);
    try {
      await bot.equip(hoe, 'hand');
    } finally {
      equipment.popSuspendAutoEat(bot);
    }

    let tilled = 0;
    const attempts: TillAttempt[] = [];
    let _sawCandidate = false;
    let sawCandidateWithinWater = false;

    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      for (let dz = -searchRadius; dz <= searchRadius; dz++) {
        const x = origin.x + dx;
        const z = origin.z + dz;

        // Search in small vertical band around feet
        for (let dy = -1; dy <= 2; dy++) {
          const pos = new Vec3(x, origin.y + dy, z);
          const b = bot.blockAt(pos);
          if (!b) continue;
          if (b.name !== 'dirt' && b.name !== 'grass_block') continue;

          const above = bot.blockAt(pos.offset(0, 1, 0));
          if (!above) continue;

          // Optional water proximity requirement (hydration)
          if (requireWater) {
            let waterFound = false;
            for (let rx = -hydrationRadius; rx <= hydrationRadius && !waterFound; rx++) {
              for (let rz = -hydrationRadius; rz <= hydrationRadius && !waterFound; rz++) {
                if (Math.max(Math.abs(rx), Math.abs(rz)) > hydrationRadius) continue;
                for (let ry = 0; ry <= 1 && !waterFound; ry++) {
                  const wp = pos.offset(rx, ry, rz);
                  const w = bot.blockAt(wp);
                  if (isWaterLike(w)) waterFound = true;
                }
              }
            }
            if (!waterFound) continue;
            sawCandidateWithinWater = true;
          }

          // Clear obstruction (grass/flower), then verify air above
          if (above.boundingBox !== 'empty' && isPlantObstruction(above.name)) {
            try {
              await bot.dig(above);
              await bot.waitForTicks(2);
            } catch {
              // Ignore dig failures
            }
          }

          const above2 = bot.blockAt(pos.offset(0, 1, 0));
          if (!above2 || above2.boundingBox !== 'empty') continue;

          _sawCandidate = true;

          // Move into range
          if (bot.entity.position.distanceTo(pos) > 4.2) {
            const movements = configureMovements(bot);
            bot.pathfinder.setMovements(movements);
            bot.pathfinder.setGoal(new goals.GoalNear(pos.x, pos.y, pos.z, 2));

            await waitForNavigation(bot, pos, { timeoutMs: 15000, arrivedDistance: 4.2 });
          }

          equipment.pushSuspendAutoEat(bot);
          try {
            await bot.activateBlock(b);
          } finally {
            equipment.popSuspendAutoEat(bot);
          }

          await bot.waitForTicks(3);

          const after = bot.blockAt(pos);
          const ok = !!after && after.name === 'farmland';
          attempts.push({ x: pos.x, y: pos.y, z: pos.z, ok });
          if (ok) tilled++;

          break; // Stop vertical scan for this (x,z)
        }
      }
    }

    if (requireWater && tilled === 0 && !sawCandidateWithinWater) {
      return {
        ok: false,
        tilled: 0,
        reason: 'no_water_nearby',
        hydrationRadius,
        attempted: attempts,
      };
    }

    return { ok: tilled > 0, tilled, attempted: attempts };
  }
}
