/**
 * Smelt Item Tool
 * Smelt items using the best available device
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { withTask } from '../../services/task.service.js';
import { isLikelyFood, isLikelyOre } from '../../utils/cooking-helpers.js';
import { cookOrSmeltOnDevice, cookOnCampfire } from './cooking-service.js';

const InputSchema = BaseInputSchema.extend({
  itemName: z.string().describe('Name of the item to smelt'),
  count: z.number().optional().default(1).describe('Number of items to smelt'),
  preferDevice: z
    .enum(['furnace', 'smoker', 'blast_furnace', 'campfire'])
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

export class SmeltItemTool extends BaseTool<Input, Output> {
  readonly name = 'smeltItem';
  readonly description = 'Smelt items using the best available device';
  readonly category = 'cooking' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { itemName, count, preferDevice, fuelName } = input;

    return withTask(bot, async (_signal) => {
      const isFoodItem = isLikelyFood(itemName);
      const isOreItem = isLikelyOre(itemName);

      // Build device sequence based on item type and preference
      const sequence: Array<'furnace' | 'smoker' | 'blast_furnace' | 'campfire'> = [];

      if (preferDevice) {
        sequence.push(preferDevice);
        if (!sequence.includes('furnace')) sequence.push('furnace');
        if (isFoodItem && !sequence.includes('campfire')) sequence.push('campfire');
      } else if (isFoodItem) {
        sequence.push('smoker', 'furnace', 'campfire');
      } else if (isOreItem) {
        sequence.push('blast_furnace', 'furnace');
      } else {
        sequence.push('furnace');
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
