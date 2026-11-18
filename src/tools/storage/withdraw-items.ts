/**
 * Withdraw Items Tool
 * Withdraw items from a nearby chest
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
  withdraw(itemType: number, metadata: number | null, count: number): Promise<void>;
  containerItems(): Item[];
  close(): void;
}

/** Minecraft data module type */
interface MinecraftDataModule {
  default?: (version: string) => MinecraftData;
  (version: string): MinecraftData;
}

/** Minecraft data interface */
interface MinecraftData {
  itemsByName: Record<string, { id: number; name: string } | undefined>;
}

const InputSchema = BaseInputSchema.extend({
  itemName: z.string().describe('Name of the item to withdraw'),
  count: z.number().optional().default(1).describe('Number of items to withdraw'),
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

export class WithdrawItemsTool extends BaseTool<Input, Output> {
  readonly name = 'withdrawItemsFromNearbyChest';
  readonly description = 'Withdraw items from a nearby chest';
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
        // Load minecraft-data
        const mcDataMod = await import('minecraft-data') as unknown as MinecraftDataModule;
        const mcData = mcDataMod.default
          ? mcDataMod.default(bot.version)
          : mcDataMod(bot.version);

        const item = mcData.itemsByName[itemName];
        if (!item) {
          throw new Error(`Unknown item ${itemName}`);
        }

        equipment.pushSuspendAutoEat(bot);
        try {
          await chest.withdraw(item.id, null, count ?? 1);
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
