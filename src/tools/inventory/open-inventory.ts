/**
 * Open Inventory Tool
 * List items in the bot's inventory
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { getEquippedSummary } from '../../utils/inventory-helpers.js';

const InputSchema = BaseInputSchema.extend({});

type Input = z.infer<typeof InputSchema>;

interface InventoryItem {
  name: string;
  count: number;
  slot: number;
}

interface ItemInfo {
  name: string;
  count: number;
  durability: { max: number | null; used: number | null; left: number | null };
}

interface EquippedInfo {
  mainHand: ItemInfo | null;
  offHand: ItemInfo | null;
  armor: {
    head: ItemInfo | null;
    chest: ItemInfo | null;
    legs: ItemInfo | null;
    feet: ItemInfo | null;
  };
}

interface Output {
  ok: boolean;
  items: InventoryItem[];
  equipped: EquippedInfo;
}

export class OpenInventoryTool extends BaseTool<Input, Output> {
  readonly name = 'openInventory';
  readonly description = 'List items in the bot inventory';
  readonly category = 'inventory' as const;
  readonly inputSchema = InputSchema;

  protected async execute(_input: Input, bot: Bot): Promise<Output> {
    const items = bot.inventory.items().map((i) => ({
      name: i.name,
      count: i.count,
      slot: i.slot,
    }));
    const equipped = getEquippedSummary(bot);

    return { ok: true, items, equipped };
  }
}
