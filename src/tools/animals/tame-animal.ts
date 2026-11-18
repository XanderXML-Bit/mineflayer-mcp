/**
 * Tame Animal Tool
 * Tame wolves, cats, horses, etc.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { withTask } from '../../services/task.service.js';
import { goals } from 'mineflayer-pathfinder';

/** Metadata value with taming properties */
interface TamedMetadata {
  isTamed?: boolean;
  flags?: number;
}

const InputSchema = BaseInputSchema.extend({
  animalType: z.enum(['wolf', 'cat', 'ocelot', 'horse', 'donkey', 'mule', 'llama', 'parrot'])
    .describe('Type of animal to tame'),
  entityId: z.number().optional().describe('Specific entity ID to tame'),
  maxAttempts: z.number().optional().default(10).describe('Maximum taming attempts'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  success: boolean;
  animalType: string;
  entityId?: number;
  attempts: number;
  error?: string;
}

// Taming items for each animal
const TAMING_ITEMS: Record<string, string[]> = {
  wolf: ['bone'],
  cat: ['cod', 'salmon', 'tropical_fish', 'pufferfish'],
  ocelot: ['cod', 'salmon', 'tropical_fish', 'pufferfish'],
  horse: [], // Horses need to be mounted repeatedly
  donkey: [],
  mule: [],
  llama: [],
  parrot: ['wheat_seeds', 'melon_seeds', 'pumpkin_seeds', 'beetroot_seeds', 'torchflower_seeds'],
};

export class TameAnimalTool extends BaseTool<Input, Output> {
  readonly name = 'tameAnimal';
  readonly description = 'Tame a wolf, cat, horse, or other tameable animal';
  readonly category = 'animals' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    return withTask(bot, async (signal) => {
      let aborted = false;
      signal.onAbort(() => { aborted = true; });

      const { animalType, maxAttempts } = input;

      // Find the animal
      let animal = null;
      if (input.entityId) {
        animal = bot.entities[input.entityId];
        if (!animal || animal.name !== animalType) {
          return { success: false, animalType, attempts: 0, error: `No ${animalType} with ID ${input.entityId}` };
        }
      } else {
        // Find nearest untamed animal of type
        let nearestDist = Infinity;
        for (const entity of Object.values(bot.entities)) {
          if (entity.name !== animalType) continue;

          // Check if already tamed (has owner)
          const metadata = entity.metadata as unknown[];
          const isTamed = metadata?.some((m) => {
            if (m && typeof m === 'object') {
              return (m as TamedMetadata).isTamed;
            }
            return false;
          });
          if (isTamed) continue;

          const dist = entity.position.distanceTo(bot.entity.position);
          if (dist < nearestDist) {
            nearestDist = dist;
            animal = entity;
          }
        }

        if (!animal) {
          return { success: false, animalType, attempts: 0, error: `No untamed ${animalType} found nearby` };
        }
      }

      // Get taming items
      const tamingItems = TAMING_ITEMS[animalType] || [];

      // For horses and similar, we need to mount them
      const needsRiding = ['horse', 'donkey', 'mule', 'llama'].includes(animalType);

      if (!needsRiding && tamingItems.length > 0) {
        // Find taming item in inventory
        const tamingItem = bot.inventory.items().find(i =>
          tamingItems.some(t => i.name.includes(t))
        );

        if (!tamingItem) {
          return {
            success: false,
            animalType,
            attempts: 0,
            error: `No taming item found. Need one of: ${tamingItems.join(', ')}`
          };
        }

        // Equip the taming item
        await bot.equip(tamingItem, 'hand');
      }

      let attempts = 0;
      let success = false;

      const maxTries = maxAttempts ?? 10;
      while (attempts < maxTries && !aborted && !success) {
        attempts++;

        // Move to animal
        const distance = animal.position.distanceTo(bot.entity.position);
        if (distance > 3) {
          const { GoalNear } = goals;
          try {
            await bot.pathfinder.goto(new GoalNear(
              animal.position.x,
              animal.position.y,
              animal.position.z,
              2
            ));
          } catch {
            // Animal might have moved
            continue;
          }
        }

        // Look at animal
        await bot.lookAt(animal.position.offset(0, animal.height * 0.5, 0));

        if (needsRiding) {
          // Try to mount
          try {
            await bot.mount(animal);
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Check if tamed (hearts appear)
            // Dismount and check
            await bot.dismount();
            await new Promise(resolve => setTimeout(resolve, 500));

            // Check tamed status
            const updatedAnimal = bot.entities[animal.id];
            if (updatedAnimal) {
              const metadata = updatedAnimal.metadata as unknown[];
              const isTamed = metadata?.some((m) => {
                if (m && typeof m === 'object') {
                  return (m as TamedMetadata).isTamed;
                }
                return false;
              });
              if (isTamed) {
                success = true;
              }
            }
          } catch {
            // Mount failed, try again
          }
        } else {
          // Use item on animal
          try {
            await bot.useOn(animal);
            await new Promise(resolve => setTimeout(resolve, 500));

            // Check if tamed
            const updatedAnimal = bot.entities[animal.id];
            if (updatedAnimal) {
              const metadata = updatedAnimal.metadata as unknown[];
              const isTamed = metadata?.some((m) => {
                if (m && typeof m === 'object') {
                  const tamedMeta = m as TamedMetadata;
                  // Different ways tamed status is represented
                  if (tamedMeta.isTamed) return true;
                  if (typeof tamedMeta.flags === 'number') return (tamedMeta.flags & 0x04) !== 0;
                }
                return false;
              });
              if (isTamed) {
                success = true;
              }
            }
          } catch {
            // Use failed, try again
          }
        }

        await new Promise(resolve => setTimeout(resolve, 500));
      }

      return {
        success,
        animalType,
        entityId: animal.id,
        attempts,
        error: success ? undefined : `Failed to tame ${animalType} after ${attempts} attempts`,
      };
    });
  }
}
