/**
 * Deposit Items Tool
 * Deposit items into a nearby chest
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import type { Block } from 'prismarine-block';
import type { Item } from 'prismarine-item';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { withTask } from '../../services/task.service.js';
import { createEquipmentService } from '../../services/equipment.service.js';
import { pathfindToPredicate } from '../../services/navigation.service.js';

/** Bot with chest opening method */
type BotWithChest = Bot & {
  openChest(block: Block): Promise<ChestWindow>;
};

/** Chest window interface */
interface ChestWindow {
  deposit(itemType: number, metadata: number | null, count: number): Promise<void>;
  containerItems(): Item[];
  close(): void;
}

const InputSchema = BaseInputSchema.extend({
  itemName: z.string().describe('Name of the item to deposit'),
  count: z.number().optional().describe('Number of items to deposit (all if not specified)'),
});

type Input = z.infer<typeof InputSchema>;

interface ChestItem {
  name: string;
  count: number;
}

interface Output {
  ok: boolean;
  chestItems: ChestItem[];
}

export class DepositItemsTool extends BaseTool<Input, Output> {
  readonly name = 'depositItemsToNearbyChest';
  readonly description = 'Deposit items into a nearby chest';
  readonly category = 'storage' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { itemName, count } = input;
    const equipment = createEquipmentService();

    return withTask(bot, async (_signal) => {
      const chestPos = await pathfindToPredicate(bot, (b: Block | null) => b?.name?.includes('chest') ?? false, 24, 2);

      let chest: ChestWindow;
      equipment.pushSuspendAutoEat(bot);
      try {
        chest = await (bot as unknown as BotWithChest).openChest(chestPos);
      } finally {
        equipment.popSuspendAutoEat(bot);
      }

      try {
        const item = bot.inventory.items().find((i) => i.name === itemName);
        if (!item) {
          throw new Error('Item not in inventory');
        }

        equipment.pushSuspendAutoEat(bot);
        try {
          await chest.deposit(item.type, null, count ?? item.count);
        } finally {
          equipment.popSuspendAutoEat(bot);
        }

        const items = chest.containerItems().map((i) => ({
          name: i.name,
          count: i.count,
        }));

        return { ok: true, chestItems: items };
      } finally {
        chest.close();
      }
    });
  }
}
