/**
 * Cook With Smoker Tool
 * Cook food items using a smoker
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { cookOrSmeltOnDevice } from './cooking-service.js';

const InputSchema = BaseInputSchema.extend({
  itemName: z.string().default('beef').describe('Name of the food item to cook'),
  count: z.number().optional().default(1).describe('Number of items to cook'),
  fuelName: z.string().optional().describe('Specific fuel to use'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  ok: boolean;
  deviceUsed: string;
  outputsCollected: number;
  requested: number;
  remaining: number;
  timedOut?: boolean;
  stalled?: boolean;
  outOfFuel?: boolean;
  reason?: string;
  output?: string;
}

export class CookWithSmokerTool extends BaseTool<Input, Output> {
  readonly name = 'cookWithSmoker';
  readonly description = 'Cook food items using a smoker';
  readonly category = 'cooking' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { itemName, count, fuelName } = input;
    return cookOrSmeltOnDevice(bot, 'smoker', itemName, fuelName, count ?? 1);
  }
}
