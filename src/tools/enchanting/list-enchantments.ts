/**
 * List Enchantments Tool
 * Lists possible enchantments for an item at an enchanting table
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import mcData from 'minecraft-data';

/** Enchantment data from minecraft-data */
interface EnchantData {
  id: number;
  name: string;
  displayName?: string;
  maxLevel?: number;
  category?: string;
  weight?: number;
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
  itemName: z.string().optional().describe('Name of item to check enchantments for (uses held item if omitted)'),
});

type Input = z.infer<typeof InputSchema>;

interface EnchantmentInfo {
  id: number;
  name: string;
  displayName: string;
  maxLevel: number;
  category: string;
  weight: number;
}

interface Output {
  item: string;
  enchantments: EnchantmentInfo[];
  currentEnchantments?: { name: string; level: number }[];
  nearbyTable: boolean;
  bookshelves: number;
  maxEnchantLevel: number;
}

export class ListEnchantmentsTool extends BaseTool<Input, Output> {
  readonly name = 'listEnchantments';
  readonly description = 'List possible enchantments for an item and nearby enchanting setup';
  readonly category = 'enchanting' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const data = mcData(bot.version);

    // Get item to check
    let item;
    const itemNameSearch = input.itemName ?? '';
    if (input.itemName) {
      const items = bot.inventory.items().filter(i => i.name.includes(itemNameSearch));
      if (items.length === 0) {
        throw new Error(`No item matching '${input.itemName}' found in inventory`);
      }
      item = items[0];
    } else {
      item = bot.heldItem;
      if (!item) {
        throw new Error('No item held. Hold an item or specify itemName.');
      }
    }

    // Find nearby enchanting table
    const enchantingTable = bot.findBlock({
      matching: data.blocksByName['enchanting_table']?.id,
      maxDistance: 4,
    });

    // Count nearby bookshelves
    let bookshelves = 0;
    if (enchantingTable) {
      const bookshelfId = data.blocksByName['bookshelf']?.id;
      if (bookshelfId) {
        // Bookshelves must be 2 blocks away and 1 block higher than table
        for (let dx = -2; dx <= 2; dx++) {
          for (let dz = -2; dz <= 2; dz++) {
            for (let dy = 0; dy <= 1; dy++) {
              if (Math.abs(dx) === 2 || Math.abs(dz) === 2) {
                const block = bot.blockAt(enchantingTable.position.offset(dx, dy, dz));
                if (block?.type === bookshelfId) {
                  bookshelves++;
                }
              }
            }
          }
        }
      }
    }

    // Max 15 bookshelves are useful
    bookshelves = Math.min(bookshelves, 15);
    const maxEnchantLevel = Math.min(30, bookshelves * 2);

    // Get enchantments for this item type
    const enchantments: EnchantmentInfo[] = [];
    const _itemInfo = data.itemsByName[item.name];

    if (data.enchantments) {
      for (const enchant of Object.values(data.enchantments)) {
        // Check if enchantment can apply to this item
        const enchantData = enchant as unknown as EnchantData;
        if (canEnchantItem(item.name, enchantData)) {
          enchantments.push({
            id: enchantData.id,
            name: enchantData.name,
            displayName: enchantData.displayName || enchantData.name,
            maxLevel: enchantData.maxLevel || 1,
            category: enchantData.category || 'unknown',
            weight: enchantData.weight || 1,
          });
        }
      }
    }

    // Get current enchantments on item
    let currentEnchantments: { name: string; level: number }[] | undefined;
    const itemNbt = item.nbt as ItemNbtWithEnchantments | undefined;
    if (itemNbt?.value?.Enchantments?.value) {
      const enchList = itemNbt.value.Enchantments.value;
      currentEnchantments = enchList.map((e) => {
        const id = typeof e.id === 'string' ? e.id : e.id?.value ?? '';
        const lvl = typeof e.lvl === 'number' ? e.lvl : e.lvl?.value ?? 1;
        return {
          name: String(id).replace('minecraft:', ''),
          level: lvl,
        };
      });
    }

    return {
      item: item.name,
      enchantments,
      currentEnchantments,
      nearbyTable: !!enchantingTable,
      bookshelves,
      maxEnchantLevel,
    };
  }
}

/**
 * Check if an enchantment can apply to an item
 */
function canEnchantItem(itemName: string, enchant: EnchantData): boolean {
  const category = enchant.category?.toLowerCase() || '';

  // Armor enchantments
  if (category.includes('armor')) {
    if (itemName.includes('helmet') || itemName.includes('chestplate') ||
        itemName.includes('leggings') || itemName.includes('boots') ||
        itemName.includes('turtle_shell')) {
      return true;
    }
  }

  // Weapon enchantments
  if (category.includes('weapon') || category.includes('sword')) {
    if (itemName.includes('sword') || itemName.includes('axe')) {
      return true;
    }
  }

  // Tool enchantments
  if (category.includes('tool') || category.includes('digger')) {
    if (itemName.includes('pickaxe') || itemName.includes('shovel') ||
        itemName.includes('axe') || itemName.includes('hoe')) {
      return true;
    }
  }

  // Bow enchantments
  if (category.includes('bow')) {
    if (itemName.includes('bow')) return true;
  }

  // Crossbow enchantments
  if (category.includes('crossbow')) {
    if (itemName.includes('crossbow')) return true;
  }

  // Trident enchantments
  if (category.includes('trident')) {
    if (itemName.includes('trident')) return true;
  }

  // Fishing rod enchantments
  if (category.includes('fishing')) {
    if (itemName.includes('fishing_rod')) return true;
  }

  // Universal enchantments (like mending, unbreaking)
  if (category === 'breakable' || enchant.name === 'mending' ||
      enchant.name === 'unbreaking' || enchant.name === 'vanishing_curse') {
    return true;
  }

  return false;
}
