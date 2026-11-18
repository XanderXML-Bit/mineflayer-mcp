/**
 * Equip Item Tool
 * Equip an item from inventory to a slot
 */

import { z } from 'zod';
import type { Bot, EquipmentDestination } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { createEquipmentService } from '../../services/equipment.service.js';
import { getItemDurabilityInfo } from '../../utils/inventory-helpers.js';
import type { MinecraftData } from '../../types/bot.js';

/** Minecraft data module type */
interface MinecraftDataModule {
  default?: (version: string) => MinecraftData;
  (version: string): MinecraftData;
}

const InputSchema = BaseInputSchema.extend({
  itemName: z.string().describe('Name of the item to equip'),
  destination: z
    .enum(['hand', 'off-hand', 'head', 'torso', 'legs', 'feet'])
    .optional()
    .default('hand')
    .describe('Equipment slot destination'),
});

type Input = z.infer<typeof InputSchema>;

interface DurabilityInfo {
  max: number | null;
  used: number | null;
  left: number | null;
}

interface Output {
  ok: boolean;
  destination: string;
  durability: DurabilityInfo | null;
}

export class EquipItemTool extends BaseTool<Input, Output> {
  readonly name = 'equipItem';
  readonly description = 'Equip an item from inventory to a slot';
  readonly category = 'inventory' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { itemName, destination } = input;

    const item = bot.inventory.items().find((i) => i.name === itemName);
    if (!item) {
      throw new Error(`Item '${itemName}' not found in inventory`);
    }

    const equipment = createEquipmentService();
    equipment.pushSuspendAutoEat(bot);

    try {
      await bot.equip(item, destination as EquipmentDestination);
    } finally {
      equipment.popSuspendAutoEat(bot);
    }

    // Get durability info
    let durability: DurabilityInfo | null = null;
    try {
      const mcDataMod = await import('minecraft-data') as unknown as MinecraftDataModule;
      const mcData = mcDataMod.default
        ? mcDataMod.default(bot.version)
        : mcDataMod(bot.version);
      durability = getItemDurabilityInfo(mcData, item);
    } catch {}

    return { ok: true, destination: destination ?? 'hand', durability };
  }
}
