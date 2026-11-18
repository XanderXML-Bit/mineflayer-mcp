/**
 * Go To Surface Tool
 * Navigate upward to reach the surface (dig if needed)
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { configureMovements } from '../../services/navigation.service.js';
import { createEquipmentService } from '../../services/equipment.service.js';
import { isClearToSkyAt } from '../../utils/block-helpers.js';
import { digBlockWithTimeout, pickupNearbyDrops } from '../../utils/mining-helpers.js';

import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg;

/** Bot with defense active flag */
interface BotWithDefense extends Bot {
  __defenseActive?: boolean;
}

const InputSchema = BaseInputSchema.extend({
  maxMs: z.number().optional().default(120000).describe('Maximum time in milliseconds'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  ok: boolean;
  arrived: boolean;
}

function isDefenseActive(bot: Bot): boolean {
  return Boolean((bot as BotWithDefense).__defenseActive);
}

export class GoToSurfaceTool extends BaseTool<Input, Output> {
  readonly name = 'goToSurface';
  readonly description = 'Navigate upward to reach the surface (dig if needed)';
  readonly category = 'utility' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { maxMs } = input;
    const equipment = createEquipmentService();
    const maxDuration = maxMs ?? 120000;
    const startAt = Date.now();
    let arrived = false;

    while (Date.now() - startAt < maxDuration || isDefenseActive(bot)) {
      const here = bot.entity.position.floored();

      if (isClearToSkyAt(bot, here)) {
        arrived = true;
        break;
      }

      // Try stepping up one block or dig above
      const above = bot.blockAt(here.offset(0, 1, 0));
      const twoAbove = bot.blockAt(here.offset(0, 2, 0));

      if (above && above.boundingBox !== 'empty') {
        // Auto-equip best tool for the block
        await equipment.equipBestToolForBlock(bot, above.name);
        const blockPos = above.position.clone();
        equipment.pushSuspendAutoEat(bot);
        try {
          await digBlockWithTimeout(bot, above, 15000);
        } finally {
          equipment.popSuspendAutoEat(bot);
        }
        await bot.waitForTicks(2);
        // Auto-pickup dropped items
        await pickupNearbyDrops(bot, blockPos, 4, 2000);
        continue;
      }

      if (twoAbove && twoAbove.boundingBox !== 'empty') {
        // Auto-equip best tool for the block
        await equipment.equipBestToolForBlock(bot, twoAbove.name);
        const blockPos = twoAbove.position.clone();
        equipment.pushSuspendAutoEat(bot);
        try {
          await digBlockWithTimeout(bot, twoAbove, 15000);
        } finally {
          equipment.popSuspendAutoEat(bot);
        }
        await bot.waitForTicks(2);
        // Auto-pickup dropped items
        await pickupNearbyDrops(bot, blockPos, 4, 2000);
        continue;
      }

      // Move upward toward daylight by small hops
      const movements = configureMovements(bot);
      bot.pathfinder.setMovements(movements);
      bot.pathfinder.setGoal(new goals.GoalNear(here.x, here.y + 2, here.z, 1));
      await bot.waitForTicks(10);
    }

    return { ok: arrived, arrived };
  }
}
