/**
 * Inventory-related helper utilities
 */

import type { Bot } from 'mineflayer';
import type { Entity } from 'prismarine-entity';
import type { Item } from 'prismarine-item';
import type { ManagedBot, MinecraftData } from '../types/bot.js';

/** Item durability info */
export interface ItemDurabilityInfo {
  max: number | null;
  used: number | null;
  left: number | null;
}

/** Formatted item info */
export interface FormattedItem {
  name: string;
  count: number;
  durability: ItemDurabilityInfo;
}

/** Equipment summary */
export interface EquippedSummary {
  mainHand: FormattedItem | null;
  offHand: FormattedItem | null;
  armor: {
    head: FormattedItem | null;
    chest: FormattedItem | null;
    legs: FormattedItem | null;
    feet: FormattedItem | null;
  };
}

/** Entity metadata structure (varies by version) */
interface EntityMetadata {
  itemId?: number;
  itemCount?: number;
  id?: number;
  count?: number;
  [key: string]: unknown;
}

/**
 * Derive dropped item info from entity metadata
 */
export function deriveDroppedItemInfo(
  entity: Entity | null,
  mcData: MinecraftData | null
): { id?: number; name?: string; count?: number } | null {
  try {
    // Entity metadata can be an array or object depending on version
    const md = (entity as unknown as { metadata?: EntityMetadata })?.metadata;
    if (md && typeof md === 'object') {
      let id: number | undefined;
      let count: number | undefined;

      // Look for item info in common patterns
      if (md.itemId !== undefined && md.itemId !== null) id = Number(md.itemId);
      if (md.itemCount !== undefined && md.itemCount !== null) count = Number(md.itemCount);

      // Search nested objects
      for (const key of Object.keys(md)) {
        const val = md[key];
        if (val && typeof val === 'object') {
          const objVal = val as EntityMetadata;
          if (objVal.itemId !== undefined && objVal.itemId !== null && id === undefined) id = Number(objVal.itemId);
          if (objVal.itemCount !== undefined && objVal.itemCount !== null && count === undefined) count = Number(objVal.itemCount);
          if (objVal.id !== undefined && objVal.id !== null && id === undefined) id = Number(objVal.id);
          if (objVal.count !== undefined && objVal.count !== null && count === undefined) count = Number(objVal.count);
        }
      }

      // mcData.items is keyed by id, itemsByName is keyed by name
      const items = (mcData as { items?: Record<number, { name: string }> })?.items;
      const name = id !== undefined ? items?.[id]?.name : undefined;

      return { id, name, count };
    }
  } catch {
    // Ignore errors
  }
  return null;
}

/**
 * Get item durability info
 */
export function getItemDurabilityInfo(
  mcData: MinecraftData | null,
  item: Item | null
): ItemDurabilityInfo {
  if (!item) return { max: null, used: null, left: null };

  const def = mcData?.itemsByName?.[item.name] as { maxDurability?: number; durability?: number } | undefined;
  const max = def?.maxDurability ?? def?.durability ?? null;

  let used: number | null = (item as Item & { durabilityUsed?: number }).durabilityUsed ?? null;
  if (used === null) {
    const nbt = item.nbt as { value?: { Damage?: { value: number } }; Damage?: number } | null;
    const nbtDamage = nbt?.value?.Damage?.value ?? nbt?.Damage ?? null;
    if (nbtDamage !== null) used = Number(nbtDamage);
  }

  if (max === null || used === null) {
    return {
      max: max ?? null,
      used: used ?? null,
      left: max && used !== null ? Math.max(0, max - used) : null,
    };
  }

  return { max, used, left: Math.max(0, max - used) };
}

/**
 * Get equipped items summary
 */
export function getEquippedSummary(bot: Bot): EquippedSummary {
  const mcData = (bot as ManagedBot).__mcdata;
  const inventory = bot.inventory as { slots?: (Item | null)[] };
  const slots = inventory.slots || [];

  const formatItem = (item: Item | null): FormattedItem | null => {
    if (!item) return null;
    return {
      name: item.name,
      count: item.count,
      durability: getItemDurabilityInfo(mcData, item),
    };
  };

  const heldItem = bot.heldItem;
  const offItem = slots[45] ?? null;
  const headItem = slots[5] ?? null;
  const chestItem = slots[6] ?? null;
  const legsItem = slots[7] ?? null;
  const feetItem = slots[8] ?? null;

  return {
    mainHand: formatItem(heldItem),
    offHand: formatItem(offItem),
    armor: {
      head: formatItem(headItem),
      chest: formatItem(chestItem),
      legs: formatItem(legsItem),
      feet: formatItem(feetItem),
    },
  };
}

/**
 * Count total items in inventory
 */
export function countInventoryItems(bot: Bot): number {
  return bot.inventory.items().reduce((sum, item) => sum + item.count, 0);
}

/**
 * Count specific item by name
 */
export function countItem(bot: Bot, itemName: string): number {
  return bot.inventory
    .items()
    .filter((i) => i.name === itemName)
    .reduce((sum, item) => sum + item.count, 0);
}

/**
 * Check if inventory has space
 */
export function hasInventorySpace(bot: Bot): boolean {
  try {
    const inv = bot.inventory as { emptySlotCount?: () => number };
    const emptySlots = inv.emptySlotCount?.() ?? -1;
    return emptySlots > 0 || emptySlots === -1;
  } catch {
    return true;
  }
}

/**
 * Get empty slot count
 */
export function getEmptySlotCount(bot: Bot): number {
  try {
    const inv = bot.inventory as { emptySlotCount?: () => number };
    return inv.emptySlotCount?.() ?? -1;
  } catch {
    return -1;
  }
}

/**
 * Find item in inventory by name (partial match)
 */
export function findItemByName(bot: Bot, name: string): Item | null {
  const n = name.toLowerCase();
  return bot.inventory.items().find((i) => i.name.toLowerCase().includes(n)) ?? null;
}

/**
 * Find all items matching a predicate
 */
export function findAllItems(bot: Bot, predicate: (item: Item) => boolean): Item[] {
  return bot.inventory.items().filter(predicate);
}
