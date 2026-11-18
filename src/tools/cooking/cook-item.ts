/**
 * Cook Item Tool
 * Cook food items (alias for smeltItem)
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { withTask } from '../../services/task.service.js';
import { isLikelyFood } from '../../utils/cooking-helpers.js';
import { cookOrSmeltOnDevice, cookOnCampfire } from './cooking-service.js';

const InputSchema = BaseInputSchema.extend({
  itemName: z.string().describe('Name of the food item to cook'),
  count: z.number().optional().default(1).describe('Number of items to cook'),
  preferDevice: z
    .enum(['furnace', 'smoker', 'campfire'])
    .optional()
    .describe('Preferred cooking device'),
  fuelName: z.string().optional().describe('Specific fuel to use'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  ok: boolean;
  deviceUsed?: string;
  outputsCollected?: number;
  requested?: number;
  remaining?: number;
  timedOut?: boolean;
  stalled?: boolean;
  outOfFuel?: boolean;
  reason?: string;
  output?: string;
  attemptedDevices?: string[];
  errors?: string[];
  error?: string;
}

export class CookItemTool extends BaseTool<Input, Output> {
  readonly name = 'cookItem';
  readonly description = 'Cook food items';
  readonly category = 'cooking' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { itemName, count, preferDevice, fuelName } = input;

    return withTask(bot, async (_signal) => {
      const isFoodItem = isLikelyFood(itemName);

      // Build device sequence - prefer smoker/campfire for food
      const sequence: Array<'furnace' | 'smoker' | 'campfire'> = [];

      if (preferDevice) {
        sequence.push(preferDevice);
        if (!sequence.includes('furnace')) sequence.push('furnace');
        if (isFoodItem && !sequence.includes('campfire')) sequence.push('campfire');
      } else {
        sequence.push('smoker', 'furnace', 'campfire');
      }

      const attempts: string[] = [];
      const errors: string[] = [];

      for (const dev of sequence) {
        attempts.push(dev);

        try {
          if (dev === 'campfire') {
            const r = await cookOnCampfire(bot, itemName);
            if (r?.ok) return { ...r, attemptedDevices: attempts };
            errors.push('campfire_failed');
            continue;
          }

          const r = await cookOrSmeltOnDevice(bot, dev, itemName, fuelName, count ?? 1);
          if (r?.ok) return { ...r, attemptedDevices: attempts };
          errors.push(`${dev}_failed${r?.timedOut ? ':timedOut' : ''}`);
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : String(e);
          errors.push(`${dev}: ${errorMessage}`);
          continue;
        }
      }

      return {
        ok: false,
        error: 'no_device_available',
        attemptedDevices: attempts,
        errors,
      };
    });
  }
}
