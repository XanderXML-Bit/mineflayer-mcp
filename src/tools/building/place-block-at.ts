/**
 * Place Block At Tool
 * Place a block at specific coordinates
 */

import { z } from 'zod';
import { Vec3 } from 'vec3';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { withTask } from '../../services/task.service.js';
import { createEquipmentService } from '../../services/equipment.service.js';
import { configureMovements } from '../../services/navigation.service.js';

import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg;

const InputSchema = BaseInputSchema.extend({
  x: z.number().describe('X coordinate'),
  y: z.number().describe('Y coordinate'),
  z: z.number().describe('Z coordinate'),
  itemName: z.string().describe('Name of the item to place'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  ok: boolean;
}

export class PlaceBlockAtTool extends BaseTool<Input, Output> {
  readonly name = 'placeBlockAt';
  readonly description = 'Place a block at specific coordinates';
  readonly category = 'building' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { x, y, z, itemName } = input;
    const equipment = createEquipmentService();

    return withTask(bot, async (_signal) => {
      const item = bot.inventory.items().find((i) => i.name === itemName);
      if (!item) {
        throw new Error('Item not in inventory');
      }

      const below = bot.blockAt(new Vec3(x, y - 1, z));
      if (!below) {
        throw new Error('No support block below target');
      }

      equipment.pushSuspendAutoEat(bot);
      try {
        await bot.equip(item, 'hand');
      } finally {
        equipment.popSuspendAutoEat(bot);
      }

      // Move into range if needed
      const targetVec = new Vec3(x, y, z);
      if (bot.entity.position.distanceTo(targetVec) > 4.5) {
        const movements = configureMovements(bot);
        bot.pathfinder.setMovements(movements);
        bot.pathfinder.setGoal(new goals.GoalNear(x, y, z, 2));

        const start = Date.now();
        while (Date.now() - start < 20000) {
          if (bot.entity.position.distanceTo(targetVec) <= 4.5) break;
          await bot.waitForTicks(5);
        }
      }

      equipment.pushSuspendAutoEat(bot);
      try {
        await bot.placeBlock(below, new Vec3(0, 1, 0));
      } finally {
        equipment.popSuspendAutoEat(bot);
      }

      return { ok: true };
    });
  }
}
