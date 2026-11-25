/**
 * Brew Potion Tool
 * Brews potions using a brewing stand
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import type { Block } from 'prismarine-block';
import type { Item } from 'prismarine-item';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { withTask } from '../../services/task.service.js';
import pathfinderPkg from 'mineflayer-pathfinder';
import mcData from 'minecraft-data';

const { goals } = pathfinderPkg;

/** Bot with brewing stand methods */
interface BotWithBrewingStand extends Bot {
  openBrewingStand(block: Block): Promise<BrewingStandWindow>;
}

/** Brewing stand window interface */
interface BrewingStandWindow {
  fuel: number;
  brewTime: number;
  slots: (Item | null)[];
  fuelItem?(): Item | null;
  putIntoSlot(slot: number, type: number, metadata: number | null, count: number): Promise<void>;
  close(): void;
}

const InputSchema = BaseInputSchema.extend({
  ingredient: z.string().describe('Ingredient to add to brewing stand'),
  waitForCompletion: z.boolean().optional().default(true).describe('Wait for brewing to complete'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  success: boolean;
  ingredient?: string;
  brewingStarted?: boolean;
  brewingComplete?: boolean;
  potionsInStand?: number;
  error?: string;
}

export class BrewPotionTool extends BaseTool<Input, Output> {
  readonly name = 'brewPotion';
  readonly description = 'Add an ingredient to a brewing stand and optionally wait for completion';
  readonly category = 'brewing' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    return withTask(bot, async (signal) => {
      let aborted = false;
      signal.onAbort(() => { aborted = true; });
      const data = mcData(bot.version);

      // Find brewing stand
      const brewingStand = bot.findBlock({
        matching: data.blocksByName['brewing_stand']?.id,
        maxDistance: 32,
      });

      if (!brewingStand) {
        return { success: false, error: 'No brewing stand found within 32 blocks' };
      }

      // Navigate to brewing stand if needed
      const distance = bot.entity.position.distanceTo(brewingStand.position);
      if (distance > 4) {
        const { GoalNear } = goals;
        await bot.pathfinder.goto(new GoalNear(
          brewingStand.position.x,
          brewingStand.position.y,
          brewingStand.position.z,
          2
        ));
      }

      // Find ingredient in inventory
      const ingredientItem = bot.inventory.items().find(i =>
        i.name.toLowerCase().includes(input.ingredient.toLowerCase()) ||
        input.ingredient.toLowerCase().includes(i.name.toLowerCase())
      );

      if (!ingredientItem) {
        return { success: false, error: `No ${input.ingredient} found in inventory` };
      }

      // Open brewing stand
      const brewWindow = await (bot as unknown as BotWithBrewingStand).openBrewingStand(brewingStand);

      if (!brewWindow) {
        return { success: false, error: 'Failed to open brewing stand' };
      }

      try {
        // Wait for window to load
        await new Promise(resolve => setTimeout(resolve, 200));

        // Check for blaze powder (fuel)
        const fuelSlot = brewWindow.fuelItem?.();
        const fuelAmount = brewWindow.fuel || 0;

        if (fuelAmount <= 0 && !fuelSlot) {
          // Try to add blaze powder
          const blazePowder = bot.inventory.items().find(i => i.name === 'blaze_powder');
          if (blazePowder) {
            // Add fuel - slot 4 is typically the fuel slot
            await brewWindow.putIntoSlot(4, blazePowder.type, null, 1);
            await new Promise(resolve => setTimeout(resolve, 100));
          } else {
            brewWindow.close();
            return { success: false, error: 'No blaze powder for fuel' };
          }
        }

        // Count potions in stand
        let potionsInStand = 0;
        for (let slot = 0; slot < 3; slot++) {
          const potionSlot = brewWindow.slots[slot];
          if (potionSlot) potionsInStand++;
        }

        if (potionsInStand === 0) {
          brewWindow.close();
          return { success: false, error: 'No potions in brewing stand. Add water bottles or potions first.' };
        }

        // Add ingredient to brewing stand (slot 3 is ingredient slot)
        await brewWindow.putIntoSlot(3, ingredientItem.type, null, 1);

        // Wait for brewing to start
        await new Promise(resolve => setTimeout(resolve, 500));

        if (!input.waitForCompletion) {
          brewWindow.close();
          return {
            success: true,
            ingredient: ingredientItem.name,
            brewingStarted: true,
            brewingComplete: false,
            potionsInStand,
          };
        }

        // Wait for brewing to complete (20 seconds max)
        const brewTime = 20000;
        const startTime = Date.now();

        while (Date.now() - startTime < brewTime) {
          if (aborted) {
            brewWindow.close();
            return { success: false, error: 'Brewing interrupted' };
          }

          // Check if brewing is done (ingredient slot empty and no brew time)
          const ingredientSlot = brewWindow.slots[3];
          const brewProgress = brewWindow.brewTime || 0;

          if (!ingredientSlot && brewProgress === 0) {
            // Brewing complete
            await new Promise(resolve => setTimeout(resolve, 200));
            brewWindow.close();
            return {
              success: true,
              ingredient: ingredientItem.name,
              brewingStarted: true,
              brewingComplete: true,
              potionsInStand,
            };
          }

          await new Promise(resolve => setTimeout(resolve, 500));
        }

        brewWindow.close();
        return {
          success: true,
          ingredient: ingredientItem.name,
          brewingStarted: true,
          brewingComplete: false,
          potionsInStand,
          error: 'Brewing timed out (may still be in progress)',
        };
      } catch (err) {
        brewWindow.close();
        throw err;
      }
    });
  }
}
