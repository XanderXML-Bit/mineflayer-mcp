/**
 * Gather Seeds Tool
 * Break grass to gather wheat seeds
 */

import { z } from 'zod';
import { Vec3 } from 'vec3';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { createEquipmentService } from '../../services/equipment.service.js';
import { configureMovements, waitForNavigation } from '../../services/navigation.service.js';

import type { Block } from 'prismarine-block';
import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg;

const InputSchema = BaseInputSchema.extend({
  count: z.number().optional().default(8).describe('Number of seeds to gather'),
  radius: z.number().optional().default(8).describe('Search radius for grass'),
  maxMs: z.number().optional().default(120000).describe('Maximum time in milliseconds'),
});

type Input = z.infer<typeof InputSchema>;

interface ErrorBlock {
  x: number;
  y: number;
  z: number;
  error: string;
}

interface Output {
  ok: boolean;
  requested: number;
  seeds: number;
  remaining: number;
  broken: number;
  timedOut: boolean;
  stalled: boolean;
  errors: ErrorBlock[];
}

export class GatherSeedsTool extends BaseTool<Input, Output> {
  readonly name = 'gatherSeeds';
  readonly description = 'Break grass to gather wheat seeds';
  readonly category = 'farming' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { count, radius, maxMs } = input;
    const equipment = createEquipmentService();

    const targetSeeds = Math.max(1, count ?? 8);
    const searchRadius = Math.max(2, Math.min(32, radius ?? 8));
    const maxDuration = maxMs ?? 120000;
    const start = Date.now();
    let lastProgressAt = start;
    const stallMs = 20000;

    const countSeeds = () =>
      bot.inventory
        .items()
        .filter((i) => i.name === 'wheat_seeds')
        .reduce((a, b) => a + b.count, 0);

    const seedsStart = countSeeds();

    // Scan for grass blocks
    const origin = bot.entity.position.floored();
    const targets: Block[] = [];

    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      for (let dz = -searchRadius; dz <= searchRadius; dz++) {
        for (let dy = -1; dy <= 2; dy++) {
          const p = new Vec3(origin.x + dx, origin.y + dy, origin.z + dz);
          const b = bot.blockAt(p);
          if (!b) continue;
          if (
            b.name === 'grass' ||
            b.name === 'tall_grass' ||
            b.name === 'fern' ||
            b.name === 'large_fern'
          ) {
            targets.push(b);
          }
        }
      }
    }

    if (!targets.length) {
      throw new Error('No grass nearby');
    }

    let broken = 0;
    const errors: ErrorBlock[] = [];

    for (const b of targets) {
      try {
        const pos = b.position;
        const movements = configureMovements(bot);
        bot.pathfinder.setMovements(movements);
        bot.pathfinder.setGoal(new goals.GoalNear(pos.x, pos.y, pos.z, 1));

        await waitForNavigation(bot, pos, { timeoutMs: 15000, arrivedDistance: 2.5 });

        equipment.pushSuspendAutoEat(bot);
        try {
          await bot.dig(b);
        } finally {
          equipment.popSuspendAutoEat(bot);
        }

        broken++;
        await bot.waitForTicks(2);

        const seedsNow = countSeeds();
        if (seedsNow > seedsStart) {
          lastProgressAt = Date.now();
        }

        if (seedsNow - seedsStart >= targetSeeds) break;
      } catch (e) {
        const pos = b.position;
        const errMsg = e instanceof Error ? e.message : String(e);
        errors.push({ x: pos.x, y: pos.y, z: pos.z, error: errMsg });
      }

      if (Date.now() - lastProgressAt > stallMs || Date.now() - start > maxDuration) break;
    }

    const seedsEnd = countSeeds();
    const gained = Math.max(0, seedsEnd - seedsStart);
    const timedOut = Date.now() - start > maxDuration;
    const stalled = Date.now() - lastProgressAt > stallMs && gained < targetSeeds;

    return {
      ok: gained > 0,
      requested: targetSeeds,
      seeds: gained,
      remaining: Math.max(0, targetSeeds - gained),
      broken,
      timedOut,
      stalled,
      errors,
    };
  }
}
