/**
 * Enchant Item Tool
 * Enchants an item using an enchanting table
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { withTask } from '../../services/task.service.js';
import mcData from 'minecraft-data';
import { goals } from 'mineflayer-pathfinder';

/** Enchantment option from enchanting table window */
interface EnchantmentOption {
  level?: number;
  xpCost?: number;
}

/** Enchanting table window with enchantments property */
interface EnchantWindow {
  enchantments?: EnchantmentOption[];
  enchant(slotIndex: number): Promise<void>;
  close(): void;
}

/** NBT enchantment entry structure */
interface NbtEnchantmentEntry {
  id?: { value?: string } | string;
  lvl?: { value?: number } | number;
}

/** Item NBT with enchantments */
interface ItemNbtWithEnchantments {
  value?: {
    Enchantments?: {
      value?: NbtEnchantmentEntry[];
    };
  };
}

const InputSchema = BaseInputSchema.extend({
  slotChoice: z.enum(['top', 'middle', 'bottom']).optional().default('bottom')
    .describe('Which enchantment slot to use (bottom = highest level, requires more XP and lapis)'),
  itemName: z.string().optional().describe('Item to enchant (uses held item if omitted)'),
});

type Input = z.infer<typeof InputSchema>;

interface EnchantmentResult {
  name: string;
  level: number;
}

interface Output {
  success: boolean;
  item?: string;
  enchantments?: EnchantmentResult[];
  xpCost?: number;
  lapisCost?: number;
  error?: string;
}

export class EnchantItemTool extends BaseTool<Input, Output> {
  readonly name = 'enchantItem';
  readonly description = 'Enchant an item using a nearby enchanting table';
  readonly category = 'enchanting' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    return withTask(bot, async (_signal) => {
      const data = mcData(bot.version);

      // Find enchanting table
      const enchantingTable = bot.findBlock({
        matching: data.blocksByName['enchanting_table']?.id,
        maxDistance: 32,
      });

      if (!enchantingTable) {
        return { success: false, error: 'No enchanting table found within 32 blocks' };
      }

      // Navigate to enchanting table if needed
      const distance = bot.entity.position.distanceTo(enchantingTable.position);
      if (distance > 4) {
        const { GoalNear } = goals;
        await bot.pathfinder.goto(new GoalNear(
          enchantingTable.position.x,
          enchantingTable.position.y,
          enchantingTable.position.z,
          2
        ));
      }

      // Get item to enchant
      let itemSlot: number;
      const itemNameSearch = input.itemName ?? '';
      if (input.itemName) {
        const item = bot.inventory.items().find(i => i.name.includes(itemNameSearch));
        if (!item) {
          return { success: false, error: `No item matching '${input.itemName}' found` };
        }
        itemSlot = item.slot;
      } else {
        const heldItem = bot.heldItem;
        if (!heldItem) {
          return { success: false, error: 'No item held. Hold an item or specify itemName.' };
        }
        itemSlot = bot.quickBarSlot + 36; // Convert quickbar to inventory slot
      }

      // Check lapis lazuli
      const lapis = bot.inventory.items().find(i => i.name === 'lapis_lazuli');
      if (!lapis || lapis.count < 1) {
        return { success: false, error: 'No lapis lazuli in inventory' };
      }

      // Open enchanting table
      const enchantWindow = await bot.openEnchantmentTable(enchantingTable);

      if (!enchantWindow) {
        return { success: false, error: 'Failed to open enchanting table' };
      }

      try {
        // Map slot choice to index (0 = top/cheapest, 2 = bottom/best)
        const slotIndex = input.slotChoice === 'top' ? 0 : input.slotChoice === 'middle' ? 1 : 2;

        // Wait for enchantment options to load
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check available enchantments
        const windowWithEnchants = enchantWindow as unknown as EnchantWindow;
        const enchantOptions = windowWithEnchants.enchantments || [];

        if (enchantOptions.length === 0) {
          enchantWindow.close();
          return { success: false, error: 'No enchantments available. Need more bookshelves or higher level.' };
        }

        if (!enchantOptions[slotIndex]) {
          enchantWindow.close();
          return { success: false, error: `Enchantment slot ${input.slotChoice} not available` };
        }

        const option = enchantOptions[slotIndex];
        const xpCost = option.level || option.xpCost || slotIndex + 1;
        const lapisCost = slotIndex + 1;

        // Check XP
        if ((bot.experience?.level || 0) < xpCost) {
          enchantWindow.close();
          return {
            success: false,
            error: `Not enough XP. Need ${xpCost}, have ${bot.experience?.level || 0}`
          };
        }

        // Check lapis
        if (lapis.count < lapisCost) {
          enchantWindow.close();
          return {
            success: false,
            error: `Not enough lapis lazuli. Need ${lapisCost}, have ${lapis.count}`
          };
        }

        // Perform enchantment
        await enchantWindow.enchant(slotIndex);

        // Wait for enchantment to complete
        await new Promise(resolve => setTimeout(resolve, 300));

        // Get the enchanted item
        const enchantedItem = bot.heldItem || bot.inventory.items().find(i => i.slot === itemSlot);

        let enchantments: EnchantmentResult[] = [];
        const itemNbt = enchantedItem?.nbt as ItemNbtWithEnchantments | undefined;
        if (itemNbt?.value?.Enchantments?.value) {
          const enchList = itemNbt.value.Enchantments.value;
          enchantments = enchList.map((e) => {
            const id = typeof e.id === 'string' ? e.id : e.id?.value ?? '';
            const lvl = typeof e.lvl === 'number' ? e.lvl : e.lvl?.value ?? 1;
            return {
              name: String(id).replace('minecraft:', ''),
              level: lvl,
            };
          });
        }

        enchantWindow.close();

        return {
          success: true,
          item: enchantedItem?.name || 'unknown',
          enchantments,
          xpCost,
          lapisCost,
        };
      } catch (err) {
        enchantWindow.close();
        throw err;
      }
    });
  }
}
