/**
 * Scan Area Tool
 * Scans the area around the bot for blocks and entities
 */

import { z } from 'zod';
import { Vec3 } from 'vec3';
import type { Bot } from 'mineflayer';
import type { Entity } from 'prismarine-entity';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { deriveDroppedItemInfo } from '../../utils/inventory-helpers.js';
import type { ManagedBot, MinecraftData } from '../../types/bot.js';

const InputSchema = BaseInputSchema.extend({
  radius: z.number().min(1).max(12).optional().default(6).describe('Scan radius (1-12 blocks)'),
});

type Input = z.infer<typeof InputSchema>;

interface Position {
  x: number;
  y: number;
  z: number;
}

interface EntityInfo {
  id: number;
  name: string;
  type: string;
  position: Position;
}

interface DroppedItem {
  id: number;
  position: Position;
  item: { id?: number; name?: string; count?: number } | null;
}

interface Output {
  blocks: Record<string, number>;
  samples: Record<string, Position[]>;
  entities: EntityInfo[];
  droppedItems: DroppedItem[];
}

export class ScanAreaTool extends BaseTool<Input, Output> {
  readonly name = 'scanArea';
  readonly description = 'Scan the area around the bot for blocks, entities, and dropped items';
  readonly category = 'observation' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const radius = Math.max(1, Math.min(12, input.radius ?? 6));
    const origin = bot.entity.position.floored();

    // Scan blocks
    const blockCounts: Record<string, number> = {};
    const sampleCoords: Record<string, Position[]> = {};

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -Math.min(4, radius); dy <= Math.min(4, radius); dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const block = bot.blockAt(new Vec3(origin.x + dx, origin.y + dy, origin.z + dz));
          if (!block) continue;
          if (block.boundingBox === 'empty') continue;

          blockCounts[block.name] = (blockCounts[block.name] || 0) + 1;

          if (!sampleCoords[block.name]) {
            sampleCoords[block.name] = [];
          }

          if (sampleCoords[block.name].length < 5) {
            const pos = block.position;
            sampleCoords[block.name].push({
              x: pos.x,
              y: pos.y,
              z: pos.z,
            });
          }
        }
      }
    }

    // Scan entities
    const entities: EntityInfo[] = Object.values(bot.entities)
      .filter((e: Entity) => e.position && e.position.distanceTo(bot.entity.position) <= radius + 2)
      .filter((e: Entity) => e.type !== 'object') // Exclude dropped items
      .map((e: Entity) => ({
        id: e.id,
        name: e.name || e.username || e.displayName || 'unknown',
        type: e.type || 'unknown',
        position: {
          x: e.position.x,
          y: e.position.y,
          z: e.position.z,
        },
      }));

    // Scan dropped items
    const mcData: MinecraftData | undefined = (bot as ManagedBot).__mcdata;
    const droppedItems: DroppedItem[] = Object.values(bot.entities)
      .filter(
        (e: Entity) =>
          e.type === 'object' &&
          e.position &&
          e.position.distanceTo(bot.entity.position) <= radius + 2
      )
      .map((e: Entity) => ({
        id: e.id,
        position: {
          x: e.position.x,
          y: e.position.y,
          z: e.position.z,
        },
        item: deriveDroppedItemInfo(e, mcData),
      }));

    return {
      blocks: blockCounts,
      samples: sampleCoords,
      entities,
      droppedItems,
    };
  }
}
