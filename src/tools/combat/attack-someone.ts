/**
 * Attack Someone Tool
 * Attack players, mobs, or animals
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
  targetType: z
    .enum(['player', 'mob', 'animal', 'hostile'])
    .optional()
    .default('player')
    .describe('Type of target to attack'),
  targetName: z.string().optional().describe('Specific entity name to target'),
  maxMs: z.number().optional().default(60000).describe('Maximum attack duration in milliseconds'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  ok: boolean;
  result: string;
  timedOut: boolean;
}

export class AttackSomeoneTool extends BaseTool<Input, Output> {
  readonly name = 'attackSomeone';
  readonly description = 'Attack players, mobs, or animals';
  readonly category = 'combat' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { targetType, targetName, maxMs } = input;
    const pvpBot = bot as BotWithPvP;

    const equipment = createEquipmentService();
    let entity: Entity | undefined;

    // Find target by name or type
    if (targetName) {
      entity = Object.values(bot.entities).find(
        (e: Entity) => e.name === targetName || e.username === targetName
      );
    } else {
      entity = Object.values(bot.entities).find((e: Entity) => {
        if (targetType === 'player') return e.type === 'player' && e.username !== bot.username;
        if (targetType === 'mob') return e.type === 'mob';
        if (targetType === 'animal') return e.kind === 'passive';
        if (targetType === 'hostile') return e.kind === 'hostile';
        return false;
      });
    }

    if (!entity) {
      throw new Error('Target not found');
    }

    // Equip best weapon
    const dist = bot.entity.position.distanceTo(entity.position);
    await equipment.equipBestWeapon(bot, dist);

    // If using ranged weapon at distance, do a ranged attack
    const heldItem = bot.heldItem;
    const isRanged = heldItem && (heldItem.name === 'bow' || heldItem.name === 'crossbow');

    if (isRanged && dist > 8) {
      const entityHeight = entity.height ?? 1.5;
      const aim = entity.position.offset(0, entityHeight * 0.8, 0);
      await bot.lookAt(aim, true);
      bot.activateItem();
      await bot.waitForTicks(15);
      bot.deactivateItem();
    }

    // Start PvP attack
    pvpBot.pvp?.attack?.(entity);

    const start = Date.now();
    let result = 'timeout';
    const targetId = entity.id;

    while (Date.now() - start < (maxMs ?? 60000)) {
      await bot.waitForTicks(10);
      const still = Object.values(bot.entities).find((e: Entity) => e.id === targetId);
      if (!still) {
        result = 'target_gone';
        break;
      }
    }

    // Stop attack
    try {
      pvpBot.pvp?.stop?.();
    } catch {
      // Ignore stop errors
    }

    const timedOut = result === 'timeout';
    return { ok: !timedOut, result, timedOut };
  }
}
