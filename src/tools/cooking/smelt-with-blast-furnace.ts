/**
 * Smelt With Blast Furnace Tool
 * Smelt ores using a blast furnace
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { cookOrSmeltOnDevice } from './cooking-service.js';

const InputSchema = BaseInputSchema.extend({
  itemName: z.string().default('iron_ore').describe('Name of the ore to smelt'),
  count: z.number().optional().default(1).describe('Number of ores to smelt'),
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

export class SmeltWithBlastFurnaceTool extends BaseTool<Input, Output> {
  readonly name = 'smeltWithBlastFurnace';
  readonly description = 'Smelt ores using a blast furnace';
  readonly category = 'cooking' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { itemName, count, fuelName } = input;
    return cookOrSmeltOnDevice(bot, 'blast_furnace', itemName, fuelName, count ?? 1);
  }
}
