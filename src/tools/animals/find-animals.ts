/**
 * Find Animals Tool
 * Find animals by type within a radius
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import type { Entity } from 'prismarine-entity';
import { BaseTool, BaseInputSchema } from '../base-tool.js';

/** Entity with health property */
interface EntityWithHealth extends Entity {
  health?: number;
}

/** Metadata value with taming properties */
interface TamedMetadata {
  isTamed?: boolean;
  flags?: number;
}

const InputSchema = BaseInputSchema.extend({
  animalType: z.string().optional().describe('Specific animal type to find (finds all if omitted)'),
  maxDistance: z.number().optional().default(32).describe('Maximum search distance'),
  onlyTamed: z.boolean().optional().default(false).describe('Only find tamed animals'),
});

type Input = z.infer<typeof InputSchema>;

interface AnimalInfo {
  entityId: number;
  type: string;
  position: { x: number; y: number; z: number };
  distance: number;
  health?: number;
  isBaby: boolean;
  isTamed?: boolean;
}

interface Output {
  animals: AnimalInfo[];
  count: number;
  byType: Record<string, number>;
}

const ANIMAL_TYPES = [
  'cow', 'pig', 'sheep', 'chicken', 'rabbit', 'horse', 'donkey', 'mule',
  'llama', 'wolf', 'cat', 'ocelot', 'fox', 'panda', 'polar_bear', 'bee',
  'turtle', 'dolphin', 'squid', 'glow_squid', 'axolotl', 'frog', 'tadpole',
  'goat', 'camel', 'sniffer', 'mooshroom', 'parrot', 'strider', 'hoglin',
];

export class FindAnimalsTool extends BaseTool<Input, Output> {
  readonly name = 'findAnimals';
  readonly description = 'Find animals within a radius';
  readonly category = 'animals' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { animalType, maxDistance, onlyTamed } = input;

    const animals: AnimalInfo[] = [];
    const byType: Record<string, number> = {};
    const botPos = bot.entity.position;

    for (const entity of Object.values(bot.entities)) {
      // Check if it's an animal
      if (!entity.name) continue;
      const entityType = entity.name.toLowerCase();

      if (!ANIMAL_TYPES.includes(entityType)) continue;

      // Filter by specific type if provided
      if (animalType) {
        const searchType = animalType.toLowerCase().replace(/[_\s]/g, '');
        const actualType = entityType.replace(/[_\s]/g, '');
        if (!actualType.includes(searchType) && !searchType.includes(actualType)) {
          continue;
        }
      }

      const distance = entity.position.distanceTo(botPos);
      const maxDist = maxDistance ?? 32;
      if (distance > maxDist) continue;

      // Parse metadata
      const metadata = entity.metadata as unknown[];
      let isBaby = false;
      let isTamed = false;

      if (metadata) {
        for (let i = 0; i < metadata.length; i++) {
          const m = metadata[i];
          if (i === 16 && m === true) {
            isBaby = true;
          }
          if (m && typeof m === 'object') {
            const tamedMeta = m as TamedMetadata;
            if (tamedMeta.isTamed) isTamed = true;
            if (typeof tamedMeta.flags === 'number' && (tamedMeta.flags & 0x04)) isTamed = true;
          }
        }
      }

      // Filter by tamed status if requested
      if (onlyTamed && !isTamed) continue;

      animals.push({
        entityId: entity.id,
        type: entityType,
        position: {
          x: Math.round(entity.position.x),
          y: Math.round(entity.position.y),
          z: Math.round(entity.position.z),
        },
        distance: Math.round(distance * 10) / 10,
        health: (entity as EntityWithHealth).health,
        isBaby,
        isTamed: isTamed || undefined,
      });

      // Count by type
      byType[entityType] = (byType[entityType] || 0) + 1;
    }

    // Sort by distance
    animals.sort((a, b) => a.distance - b.distance);

    return {
      animals,
      count: animals.length,
      byType,
    };
  }
}
