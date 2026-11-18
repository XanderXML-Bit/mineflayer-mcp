/**
 * Cook With Campfire Tool
 * Cook food items using a campfire
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { cookOnCampfire } from './cooking-service.js';

const InputSchema = BaseInputSchema.extend({
  itemName: z.string().default('beef').describe('Name of the food item to cook'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  ok: boolean;
  deviceUsed: string;
  timedOut?: boolean;
}

export class CookWithCampfireTool extends BaseTool<Input, Output> {
  readonly name = 'cookWithCampfire';
  readonly description = 'Cook food items using a campfire';
  readonly category = 'cooking' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { itemName } = input;
    return cookOnCampfire(bot, itemName);
  }
}
