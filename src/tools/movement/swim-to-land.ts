/**
 * Swim To Land Tool
 * Navigate to the nearest land when in water
 */

import { z } from 'zod';
import { Vec3 } from 'vec3';
import type { Bot } from 'mineflayer';
import type { Block } from 'prismarine-block';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { configureMovements } from '../../services/navigation.service.js';

import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg;

/** Block with liquid property */
interface BlockWithLiquid extends Block {
  liquid?: boolean;
}

const InputSchema = BaseInputSchema.extend({
  maxRadius: z.number().optional().default(16).describe('Maximum search radius for land'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  found: boolean;
  targetPosition?: { x: number; y: number; z: number };
}

export class SwimToLandTool extends BaseTool<Input, Output> {
  readonly name = 'swimToLand';
  readonly description = 'Navigate to the nearest land when in water';
  readonly category = 'movement' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { maxRadius } = input;

    const origin = bot.entity.position.floored();
    let found: Vec3 | null = null;

    // Search for land in expanding radius
    for (let r = 1; r <= (maxRadius ?? 16) && !found; r++) {
      for (let dx = -r; dx <= r && !found; dx++) {
        for (let dz = -r; dz <= r && !found; dz++) {
          const x = origin.x + dx;
          const z = origin.z + dz;

          for (let dy = -1; dy <= 2 && !found; dy++) {
            const y = origin.y + dy;

            const blockBelow = bot.blockAt(new Vec3(x, y - 1, z));
            const here = bot.blockAt(new Vec3(x, y, z));
            const above = bot.blockAt(new Vec3(x, y + 1, z));

            const liquidBelow = blockBelow && (blockBelow as BlockWithLiquid).liquid;
            const solidBelow =
              blockBelow &&
              blockBelow.boundingBox === 'block' &&
              !(blockBelow as BlockWithLiquid).liquid;
            const space =
              here &&
              here.boundingBox === 'empty' &&
              above &&
              above.boundingBox === 'empty';

            if (solidBelow && space && !liquidBelow) {
              found = new Vec3(x, y, z);
            }
          }
        }
      }
    }

    if (!found) {
      throw new Error('No nearby land found');
    }

    const movements = configureMovements(bot);
    bot.pathfinder.setMovements(movements);
    bot.pathfinder.setGoal(new goals.GoalNear(found.x, found.y, found.z, 1));

    return {
      found: true,
      targetPosition: {
        x: found.x,
        y: found.y,
        z: found.z,
      },
    };
  }
}
