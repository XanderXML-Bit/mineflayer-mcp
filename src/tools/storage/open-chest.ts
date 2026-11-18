/**
 * Open Chest Tool
 * Open a nearby chest and list its contents
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import type { Block } from 'prismarine-block';
import type { Item } from 'prismarine-item';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { createEquipmentService } from '../../services/equipment.service.js';
import { pathfindToPredicate } from '../../services/navigation.service.js';

/** Bot with chest opening method */
type BotWithChest = Bot & {
  openChest(block: Block): Promise<ChestWindow>;
};

/** Chest window interface */
interface ChestWindow {
  containerItems(): Item[];
  close(): void;
}

const InputSchema = BaseInputSchema.extend({});

type Input = z.infer<typeof InputSchema>;

interface ChestItem {
  name: string;
  count: number;
}

interface Output {
  ok: boolean;
  chestItems: ChestItem[];
}

export class OpenChestTool extends BaseTool<Input, Output> {
  readonly name = 'openNearbyChest';
  readonly description = 'Open a nearby chest and list its contents';
  readonly category = 'storage' as const;
  readonly inputSchema = InputSchema;

  protected async execute(_input: Input, bot: Bot): Promise<Output> {
    const equipment = createEquipmentService();

    const pos = await pathfindToPredicate(bot, (b: Block | null) => b?.name?.includes('chest') ?? false, 24, 2);

    let chest: ChestWindow;
    equipment.pushSuspendAutoEat(bot);
    try {
      chest = await (bot as unknown as BotWithChest).openChest(pos);
    } finally {
      equipment.popSuspendAutoEat(bot);
    }

    await bot.waitForTicks(10);
    const items = chest.containerItems().map((i) => ({
      name: i.name,
      count: i.count,
    }));
    chest.close();

    return { ok: true, chestItems: items };
  }
}
