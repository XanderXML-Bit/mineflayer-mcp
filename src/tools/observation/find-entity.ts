/**
 * Find Entity Tool
 * Finds the nearest entity of a given type
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import type { Entity } from 'prismarine-entity';
import { BaseTool, BaseInputSchema } from '../base-tool.js';

/** Extended entity with optional properties */
interface ExtendedEntity extends Entity {
  displayName?: string;
  kind?: string;
}

const InputSchema = BaseInputSchema.extend({
  targetName: z.string().optional().describe('Name or type of entity to find (e.g., "zombie", "cow", player name)'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  entity: {
    name: string;
    type: string;
    position: {
      x: number;
      y: number;
      z: number;
    };
    distance: number;
  };
}

export class FindEntityTool extends BaseTool<Input, Output> {
  readonly name = 'findEntity';
  readonly description = 'Find the nearest entity, optionally filtering by name or type';
  readonly category = 'observation' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { targetName } = input;

    const entity = targetName
      ? bot.nearestEntity(
          (e: Entity) => {
            const ext = e as ExtendedEntity;
            return ext.name === targetName ||
              ext.displayName === targetName ||
              ext.kind === targetName ||
              ext.username === targetName;
          }
        )
      : bot.nearestEntity();

    if (!entity) {
      throw new Error(targetName ? `Entity '${targetName}' not found` : 'No entities nearby');
    }

    const pos = entity.position || bot.entity.position;
    const distance = bot.entity.position.distanceTo(pos);

    return {
      entity: {
        name: entity.name || entity.username || entity.displayName || 'unknown',
        type: entity.type || 'unknown',
        position: {
          x: pos.x,
          y: pos.y,
          z: pos.z,
        },
        distance,
      },
    };
  }
}
