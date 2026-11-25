/**
 * Place Item Near Tool
 * Place an item at the nearest valid spot near the bot
 */

import { z } from 'zod';
import { Vec3 } from 'vec3';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { createEquipmentService } from '../../services/equipment.service.js';
import { configureMovements } from '../../services/navigation.service.js';

import type { Block } from 'prismarine-block';
import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg;

/** Block with liquid property */
interface BlockWithLiquid extends Block {
  liquid?: boolean;
}

const InputSchema = BaseInputSchema.extend({
  itemName: z.string().describe('Name of the item to place'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  ok: boolean;
  placedAt: { x: number; y: number; z: number };
}

export class PlaceItemNearTool extends BaseTool<Input, Output> {
  readonly name = 'placeItemNearYou';
  readonly description = 'Place an item at the nearest valid spot near the bot';
  readonly category = 'building' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { itemName } = input;
    const equipment = createEquipmentService();

    const item = bot.inventory.items().find((i) => i.name === itemName);
    if (!item) {
      throw new Error('Item not in inventory');
    }

    equipment.pushSuspendAutoEat(bot);
    try {
      await bot.equip(item, 'hand');
    } finally {
      equipment.popSuspendAutoEat(bot);
    }

    // Find nearest empty target cell adjacent to a solid face
    const origin = bot.entity.position.floored();
    const faces = [
      new Vec3(0, 1, 0),
      new Vec3(0, -1, 0),
      new Vec3(1, 0, 0),
      new Vec3(-1, 0, 0),
      new Vec3(0, 0, 1),
      new Vec3(0, 0, -1),
    ];

    let best: { target: Vec3; ref: Block; face: Vec3; dist: number } | null = null;
    const maxR = 3;

    for (let dx = -maxR; dx <= maxR; dx++) {
      for (let dy = -1; dy <= 2; dy++) {
        for (let dz = -maxR; dz <= maxR; dz++) {
          const pos = origin.offset(dx, dy, dz);

          // Avoid placing where the bot stands (feet or head)
          const feet = bot.entity.position.floored();
          const head = feet.offset(0, 1, 0);
          if (
            (pos.x === feet.x && pos.y === feet.y && pos.z === feet.z) ||
            (pos.x === head.x && pos.y === head.y && pos.z === head.z)
          ) {
            continue;
          }

          const here = bot.blockAt(pos);
          if (!here || here.boundingBox !== 'empty') continue;

          for (const f of faces) {
            const refPos = pos.minus(f);
            const ref = bot.blockAt(refPos);
            if (!ref) continue;

            const solid = ref.boundingBox === 'block' && !(ref as BlockWithLiquid).liquid;
            if (!solid) continue;

            const dist = bot.entity.position.distanceTo(new Vec3(pos.x, pos.y, pos.z));
            if (!best || dist < best.dist) {
              best = { target: pos, ref, face: f, dist };
            }
          }
        }
      }
    }

    if (!best) {
      throw new Error('No nearby spot to place');
    }

    // Move into placement range if too far
    if (best.dist > 4.5) {
      const movements = configureMovements(bot);
      bot.pathfinder.setMovements(movements);
      bot.pathfinder.setGoal(
        new goals.GoalNear(best.ref.position.x, best.ref.position.y, best.ref.position.z, 2)
      );

      const start = Date.now();
      while (Date.now() - start < 20000) {
        const d = bot.entity.position.distanceTo(best.ref.position);
        if (d <= 4.5) break;
        await bot.waitForTicks(5);
      }
    }

    await bot.placeBlock(best.ref, best.face);

    return {
      ok: true,
      placedAt: { x: best.target.x, y: best.target.y, z: best.target.z },
    };
  }
}
