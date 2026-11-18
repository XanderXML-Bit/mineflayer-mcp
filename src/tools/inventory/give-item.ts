/**
 * Give Item Tool
 * Give an item to another player
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';

const InputSchema = BaseInputSchema.extend({
  playerName: z.string().describe('Name of the player to give item to'),
  itemName: z.string().describe('Name of the item to give'),
  count: z.number().optional().default(1).describe('Number of items to give'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  ok: boolean;
  given: number;
}

export class GiveItemTool extends BaseTool<Input, Output> {
  readonly name = 'giveItemToSomeone';
  readonly description = 'Give an item to another player';
  readonly category = 'inventory' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { playerName, itemName, count } = input;
    const itemCount = count ?? 1;

    const player = bot.players[playerName]?.entity;
    if (!player) {
      throw new Error(`Player '${playerName}' not found or not nearby`);
    }

    const item = bot.inventory.items().find((i) => i.name === itemName && i.count >= itemCount);
    if (!item) {
      throw new Error(`Not enough '${itemName}' in inventory`);
    }

    await bot.toss(item.type, null, itemCount);

    return { ok: true, given: itemCount };
  }
}
