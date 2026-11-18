/**
 * Hunt Tool
 * Hunt and kill animals or mobs
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import type { Entity } from 'prismarine-entity';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { createEquipmentService } from '../../services/equipment.service.js';

/** Bot with PvP plugin */
interface BotWithPvP extends Bot {
  pvp?: {
    attack(entity: Entity): void;
    stop(): void;
  };
}

const InputSchema = BaseInputSchema.extend({
  targetName: z.string().optional().default('cow').describe('Name of entity to hunt (e.g., cow, pig, zombie)'),
  count: z.number().optional().default(1).describe('Number of targets to kill'),
  maxMs: z.number().optional().default(120000).describe('Maximum hunt duration in milliseconds'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  ok: boolean;
  requested: number;
  kills: number;
  remaining: number;
  timedOut: boolean;
  stalled: boolean;
  errors: string[];
}

export class HuntTool extends BaseTool<Input, Output> {
  readonly name = 'hunt';
  readonly description = 'Hunt and kill animals or mobs';
  readonly category = 'combat' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { targetName, count, maxMs } = input;
    const countTarget = Math.max(1, count ?? 1);
    const maxDuration = maxMs ?? 120000;
    const stallMs = 20000;
    const pvpBot = bot as BotWithPvP;

    const equipment = createEquipmentService();
    let kills = 0;
    const errors: string[] = [];
    const start = Date.now();
    let lastProgressAt = start;

    const matches = (e: Entity) =>
      e && (e.name === targetName || e.displayName === targetName || e.kind === targetName);

    while (kills < countTarget && Date.now() - start < maxDuration) {
      // Acquire target
      let ent: Entity | null = bot.nearestEntity(matches);
      const acquireStart = Date.now();

      while (!ent && Date.now() - acquireStart < 10000) {
        await bot.waitForTicks(5);
        ent = bot.nearestEntity(matches);
      }

      if (!ent) {
        errors.push('no_target_found');
        break;
      }

      // Equip best weapon for distance
      try {
        const dist = bot.entity.position.distanceTo(ent.position);
        await equipment.equipBestWeapon(bot, dist);
      } catch {
        // Ignore weapon equip errors
      }

      // Attack and wait for outcome
      const targetId = ent.id;
      let dead = false;

      const onDead = (entity: Entity) => {
        if (entity?.id === targetId) dead = true;
      };

      try {
        bot.on('entityDead', onDead);
      } catch {
        // Ignore listener errors
      }

      try {
        pvpBot.pvp?.attack?.(ent);

        const fightStart = Date.now();
        while (Date.now() - fightStart < 30000) {
          await bot.waitForTicks(5);
          if (dead) break;

          const still = Object.values(bot.entities).find((e: Entity) => e.id === targetId);
          if (!still) {
            // Out of range or dead - give brief grace to get death event
            const grace = Date.now() + 1000;
            while (!dead && Date.now() < grace) {
              await bot.waitForTicks(2);
            }
            break;
          }
        }
      } finally {
        try {
          pvpBot.pvp?.stop?.();
        } catch {
          // Ignore stop errors
        }
        try {
          bot.removeListener('entityDead', onDead);
        } catch {
          // Ignore listener removal errors
        }
      }

      if (dead) {
        kills++;
        lastProgressAt = Date.now();
        continue;
      } else {
        errors.push('target_escaped_or_timeout');
      }

      if (Date.now() - lastProgressAt > stallMs) break;
    }

    const timedOut = kills < countTarget && Date.now() - start >= maxDuration;
    const stalled = kills < countTarget && Date.now() - lastProgressAt > stallMs;

    return {
      ok: kills > 0,
      requested: countTarget,
      kills,
      remaining: Math.max(0, countTarget - kills),
      timedOut,
      stalled,
      errors,
    };
  }
}
