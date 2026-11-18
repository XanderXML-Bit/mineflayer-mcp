/**
 * Pickup Item Tool
 * Pick up a dropped item entity near the bot
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import type { Entity } from 'prismarine-entity';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { configureMovements } from '../../services/navigation.service.js';

import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg;

const InputSchema = BaseInputSchema.extend({
  itemName: z.string().optional().describe('Name of the item to pick up (any if not specified)'),
  maxMs: z.number().optional().default(30000).describe('Maximum time in milliseconds'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  ok: boolean;
  pickedUp: boolean;
  timedOut: boolean;
}

export class PickupItemTool extends BaseTool<Input, Output> {
  readonly name = 'pickupItem';
  readonly description = 'Pick up a dropped item entity near the bot';
  readonly category = 'utility' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { itemName, maxMs } = input;

    const foundEntity: Entity | null = bot.nearestEntity(
      (e) => e.type === 'object' && (!itemName || e.displayName === itemName)
    );

    if (!foundEntity) {
      throw new Error('No dropped item found');
    }

    const movements = configureMovements(bot);
    bot.pathfinder.setMovements(movements);
    bot.pathfinder.setGoal(new goals.GoalFollow(foundEntity, 1));

    // Wait up to maxMs to pick up the item
    const start = Date.now();
    const maxDuration = maxMs ?? 30000;
    let pickedUp = false;
    const entityId = foundEntity.id;

    while (Date.now() - start < maxDuration) {
      await bot.waitForTicks(5);
      if (!bot.nearestEntity((e) => e.id === entityId)) {
        pickedUp = true;
        break;
      }
    }

    const timedOut = Date.now() - start >= maxDuration;

    return { ok: pickedUp, pickedUp, timedOut };
  }
}
