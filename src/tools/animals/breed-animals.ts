/**
 * Breed Animals Tool
 * Breed two animals together
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { withTask } from '../../services/task.service.js';
import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg;

/** Entity metadata array type */
type EntityMetadata = unknown[];

const InputSchema = BaseInputSchema.extend({
  animalType: z.string().describe('Type of animal to breed (cow, pig, sheep, chicken, etc.)'),
  foodItem: z.string().optional().describe('Food item to use (auto-detects if omitted)'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  success: boolean;
  animalType: string;
  animalsFed: number;
  error?: string;
}

// Breeding food for each animal type
const BREEDING_FOOD: Record<string, string[]> = {
  cow: ['wheat'],
  mooshroom: ['wheat'],
  sheep: ['wheat'],
  pig: ['carrot', 'potato', 'beetroot'],
  chicken: ['wheat_seeds', 'melon_seeds', 'pumpkin_seeds', 'beetroot_seeds', 'torchflower_seeds'],
  rabbit: ['carrot', 'golden_carrot', 'dandelion'],
  horse: ['golden_apple', 'golden_carrot'],
  donkey: ['golden_apple', 'golden_carrot'],
  mule: [],  // Can't breed
  llama: ['hay_block'],
  wolf: ['any_meat'],
  cat: ['cod', 'salmon'],
  ocelot: ['cod', 'salmon'],
  fox: ['sweet_berries', 'glow_berries'],
  panda: ['bamboo'],
  bee: ['any_flower'],
  turtle: ['seagrass'],
  strider: ['warped_fungus'],
  hoglin: ['crimson_fungus'],
  goat: ['wheat'],
  axolotl: ['tropical_fish_bucket'],
  frog: ['slime_ball'],
  camel: ['cactus'],
  sniffer: ['torchflower_seeds'],
};

const MEAT_ITEMS = ['beef', 'porkchop', 'mutton', 'chicken', 'rabbit', 'cooked_beef', 'cooked_porkchop', 'cooked_mutton', 'cooked_chicken', 'cooked_rabbit', 'rotten_flesh'];
const FLOWER_ITEMS = ['dandelion', 'poppy', 'blue_orchid', 'allium', 'azure_bluet', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip', 'oxeye_daisy', 'cornflower', 'lily_of_the_valley', 'sunflower', 'lilac', 'rose_bush', 'peony'];

export class BreedAnimalsTool extends BaseTool<Input, Output> {
  readonly name = 'breedAnimals';
  readonly description = 'Breed two animals of the same type';
  readonly category = 'animals' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    return withTask(bot, async (signal) => {
      let aborted = false;
      signal.onAbort(() => { aborted = true; });

      const { animalType } = input;
      const normalizedType = animalType.toLowerCase().replace(/[_\s]/g, '');

      // Find breeding food
      let breedingFood = BREEDING_FOOD[normalizedType] || [];

      // Handle special cases
      if (breedingFood.includes('any_meat')) {
        breedingFood = MEAT_ITEMS;
      }
      if (breedingFood.includes('any_flower')) {
        breedingFood = FLOWER_ITEMS;
      }

      if (breedingFood.length === 0) {
        return { success: false, animalType, animalsFed: 0, error: `Cannot breed ${animalType} or unknown breeding food` };
      }

      // Find food in inventory
      let foodItem;
      if (input.foodItem) {
        const searchFood = input.foodItem;
        foodItem = bot.inventory.items().find(i => i.name.includes(searchFood));
      } else {
        foodItem = bot.inventory.items().find(i =>
          breedingFood.some(f => i.name.includes(f))
        );
      }

      if (!foodItem) {
        return {
          success: false,
          animalType,
          animalsFed: 0,
          error: `No breeding food found. Need one of: ${breedingFood.slice(0, 5).join(', ')}${breedingFood.length > 5 ? '...' : ''}`
        };
      }

      if (foodItem.count < 2) {
        return { success: false, animalType, animalsFed: 0, error: 'Need at least 2 food items to breed' };
      }

      // Find two adults of this type
      const animals = Object.values(bot.entities)
        .filter(e => {
          if (e.name !== animalType && !e.name?.includes(normalizedType)) return false;
          // Check if not baby (metadata index 16 typically)
          const metadata = e.metadata as EntityMetadata;
          const isBaby = metadata?.[16] === true;
          return !isBaby;
        })
        .sort((a, b) =>
          a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position)
        )
        .slice(0, 2);

      if (animals.length < 2) {
        return { success: false, animalType, animalsFed: animals.length, error: `Need at least 2 adult ${animalType}s nearby` };
      }

      // Equip food
      await bot.equip(foodItem, 'hand');

      let animalsFed = 0;

      // Feed both animals
      for (const animal of animals) {
        if (aborted) break;

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
            continue;
          }
        }

        // Look at animal and use food
        await bot.lookAt(animal.position.offset(0, animal.height * 0.5, 0));

        try {
          await bot.useOn(animal);
          animalsFed++;
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch {
          // Feeding failed
        }
      }

      return {
        success: animalsFed >= 2,
        animalType,
        animalsFed,
        error: animalsFed < 2 ? `Only fed ${animalsFed} animals` : undefined,
      };
    });
  }
}
