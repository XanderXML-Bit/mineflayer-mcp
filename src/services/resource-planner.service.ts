/**
 * Resource Planner Service
 *
 * Track tool durability, food supplies, and crafting requirements.
 * Helps AI make decisions about resource management.
 */

import type { Bot } from 'mineflayer';
import type { Item } from 'prismarine-item';
import minecraftData from 'minecraft-data';

/** NBT structure for durability */
interface DurabilityNBT {
  value?: {
    Damage?: { value?: number };
  };
}

/** Recipe type with common properties from both ShapedRecipe and ShapelessRecipe */
type RecipeWithIngredients = {
  inShape?: Array<Array<{ id: number } | number | null>>;
  ingredients?: Array<{ id: number } | number>;
  result?: { id: number; count?: number } | number;
};

export interface ToolStatus {
  item: string;
  slot: number;
  durability: number;
  maxDurability: number;
  durabilityPercent: number;
  warning: boolean; // < 20%
  critical: boolean; // < 10%
}

export interface FoodItem {
  item: string;
  count: number;
  foodPoints: number;
  saturation: number;
}

export interface FoodSupply {
  items: FoodItem[];
  totalFood: number;
  totalSaturation: number;
  mealsRemaining: number; // Approximate meals (assuming 6 hunger points per meal)
}

export interface MaterialCount {
  item: string;
  count: number;
}

export interface ResourceStatus {
  tools: ToolStatus[];
  food: FoodSupply;
  materials: MaterialCount[];
  lowSupplyAlerts: string[];
  inventoryUsed: number;
  inventoryTotal: number;
  inventoryPercent: number;
}

export interface CraftingIngredient {
  item: string;
  need: number;
  have: number;
  missing: number;
}

export interface CraftingRequirement {
  item: string;
  count: number;
  canCraft: boolean;
  maxCraftable: number;
  ingredients: CraftingIngredient[];
  missingIngredients: CraftingIngredient[];
}

export interface CraftableItem {
  item: string;
  maxCount: number;
  recipe: string[];
}

// Food values from Minecraft wiki
const FOOD_VALUES: Record<string, { food: number; saturation: number }> = {
  apple: { food: 4, saturation: 2.4 },
  baked_potato: { food: 5, saturation: 6 },
  beef: { food: 3, saturation: 1.8 },
  beetroot: { food: 1, saturation: 1.2 },
  beetroot_soup: { food: 6, saturation: 7.2 },
  bread: { food: 5, saturation: 6 },
  carrot: { food: 3, saturation: 3.6 },
  chicken: { food: 2, saturation: 1.2 },
  chorus_fruit: { food: 4, saturation: 2.4 },
  cod: { food: 2, saturation: 0.4 },
  cooked_beef: { food: 8, saturation: 12.8 },
  cooked_chicken: { food: 6, saturation: 7.2 },
  cooked_cod: { food: 5, saturation: 6 },
  cooked_mutton: { food: 6, saturation: 9.6 },
  cooked_porkchop: { food: 8, saturation: 12.8 },
  cooked_rabbit: { food: 5, saturation: 6 },
  cooked_salmon: { food: 6, saturation: 9.6 },
  cookie: { food: 2, saturation: 0.4 },
  dried_kelp: { food: 1, saturation: 0.6 },
  enchanted_golden_apple: { food: 4, saturation: 9.6 },
  glow_berries: { food: 2, saturation: 0.4 },
  golden_apple: { food: 4, saturation: 9.6 },
  golden_carrot: { food: 6, saturation: 14.4 },
  honey_bottle: { food: 6, saturation: 1.2 },
  melon_slice: { food: 2, saturation: 1.2 },
  mushroom_stew: { food: 6, saturation: 7.2 },
  mutton: { food: 2, saturation: 1.2 },
  porkchop: { food: 3, saturation: 1.8 },
  potato: { food: 1, saturation: 0.6 },
  pufferfish: { food: 1, saturation: 0.2 },
  pumpkin_pie: { food: 8, saturation: 4.8 },
  rabbit: { food: 3, saturation: 1.8 },
  rabbit_stew: { food: 10, saturation: 12 },
  rotten_flesh: { food: 4, saturation: 0.8 },
  salmon: { food: 2, saturation: 0.4 },
  spider_eye: { food: 2, saturation: 3.2 },
  steak: { food: 8, saturation: 12.8 },
  suspicious_stew: { food: 6, saturation: 7.2 },
  sweet_berries: { food: 2, saturation: 0.4 },
  tropical_fish: { food: 1, saturation: 0.2 },
};

// Tools that have durability
const TOOL_PATTERNS = [
  'pickaxe',
  'axe',
  'shovel',
  'hoe',
  'sword',
  'bow',
  'crossbow',
  'fishing_rod',
  'flint_and_steel',
  'shears',
  'trident',
  'shield',
  'elytra',
  'carrot_on_a_stick',
  'warped_fungus_on_a_stick',
];

// Armor pieces
const ARMOR_PATTERNS = ['helmet', 'chestplate', 'leggings', 'boots'];

/**
 * Check if an item is a tool with durability
 */
function isTool(itemName: string): boolean {
  return TOOL_PATTERNS.some((pattern) => itemName.includes(pattern));
}

/**
 * Check if an item is armor
 */
function isArmor(itemName: string): boolean {
  return ARMOR_PATTERNS.some((pattern) => itemName.includes(pattern));
}

/**
 * Check if an item is food
 */
function _isFood(itemName: string): boolean {
  return itemName in FOOD_VALUES;
}

/**
 * Get food values for an item
 */
function getFoodValues(itemName: string): { food: number; saturation: number } | null {
  return FOOD_VALUES[itemName] ?? null;
}

/**
 * Get tool durability info from an item
 */
function getToolDurability(item: Item): ToolStatus | null {
  if (!isTool(item.name) && !isArmor(item.name)) {
    return null;
  }

  // Get max durability from item type
  const maxDurability = item.maxDurability ?? 0;
  if (maxDurability === 0) {
    return null;
  }

  // Current durability = max - damage
  const damage = (item.nbt as DurabilityNBT)?.value?.Damage?.value ?? 0;
  const durability = maxDurability - damage;
  const durabilityPercent = Math.round((durability / maxDurability) * 100);

  return {
    item: item.name,
    slot: item.slot,
    durability,
    maxDurability,
    durabilityPercent,
    warning: durabilityPercent < 20,
    critical: durabilityPercent < 10,
  };
}

/**
 * Get resource status for a bot
 */
export function getResourceStatus(bot: Bot): ResourceStatus {
  const items = bot.inventory.items();
  const tools: ToolStatus[] = [];
  const foodItems: FoodItem[] = [];
  const materials: Map<string, number> = new Map();
  const alerts: string[] = [];

  for (const item of items) {
    // Check for tools
    const toolStatus = getToolDurability(item);
    if (toolStatus) {
      tools.push(toolStatus);
      if (toolStatus.critical) {
        alerts.push(`${item.name} critically low (${toolStatus.durabilityPercent}%)`);
      } else if (toolStatus.warning) {
        alerts.push(`${item.name} durability low (${toolStatus.durabilityPercent}%)`);
      }
      continue;
    }

    // Check for food
    const foodValue = getFoodValues(item.name);
    if (foodValue) {
      foodItems.push({
        item: item.name,
        count: item.count,
        foodPoints: foodValue.food,
        saturation: foodValue.saturation,
      });
      continue;
    }

    // Everything else is materials
    const current = materials.get(item.name) ?? 0;
    materials.set(item.name, current + item.count);
  }

  // Calculate food totals
  const totalFood = foodItems.reduce((sum, f) => sum + f.foodPoints * f.count, 0);
  const totalSaturation = foodItems.reduce((sum, f) => sum + f.saturation * f.count, 0);
  const mealsRemaining = Math.floor(totalFood / 6); // ~6 food points per meal

  // Check for low food
  if (mealsRemaining < 3) {
    alerts.push(`Low food supply (${mealsRemaining} meals remaining)`);
  }

  // Convert materials map to array
  const materialList: MaterialCount[] = Array.from(materials.entries())
    .map(([item, count]) => ({ item, count }))
    .sort((a, b) => b.count - a.count);

  // Inventory space
  const inventoryUsed = items.length;
  const inventoryTotal = 36; // Main inventory slots
  const inventoryPercent = Math.round((inventoryUsed / inventoryTotal) * 100);

  if (inventoryPercent > 90) {
    alerts.push(`Inventory almost full (${inventoryPercent}%)`);
  }

  return {
    tools: tools.sort((a, b) => a.durabilityPercent - b.durabilityPercent),
    food: {
      items: foodItems,
      totalFood,
      totalSaturation,
      mealsRemaining,
    },
    materials: materialList,
    lowSupplyAlerts: alerts,
    inventoryUsed,
    inventoryTotal,
    inventoryPercent,
  };
}

/**
 * Check tool durability specifically
 */
export function checkToolDurability(bot: Bot): ToolStatus[] {
  const items = bot.inventory.items();
  const tools: ToolStatus[] = [];

  for (const item of items) {
    const toolStatus = getToolDurability(item);
    if (toolStatus) {
      tools.push(toolStatus);
    }
  }

  return tools.sort((a, b) => a.durabilityPercent - b.durabilityPercent);
}

/**
 * Get food supply summary
 */
export function getFoodSupply(bot: Bot): FoodSupply {
  const items = bot.inventory.items();
  const foodItems: FoodItem[] = [];

  for (const item of items) {
    const foodValue = getFoodValues(item.name);
    if (foodValue) {
      foodItems.push({
        item: item.name,
        count: item.count,
        foodPoints: foodValue.food,
        saturation: foodValue.saturation,
      });
    }
  }

  const totalFood = foodItems.reduce((sum, f) => sum + f.foodPoints * f.count, 0);
  const totalSaturation = foodItems.reduce((sum, f) => sum + f.saturation * f.count, 0);

  return {
    items: foodItems,
    totalFood,
    totalSaturation,
    mealsRemaining: Math.floor(totalFood / 6),
  };
}

/**
 * Check if we can craft an item and what's missing
 */
export function canCraft(bot: Bot, itemName: string, count: number = 1): CraftingRequirement {
  const mcData = minecraftData(bot.version);
  const recipe = mcData.recipes[mcData.itemsByName[itemName]?.id];

  if (!recipe || recipe.length === 0) {
    return {
      item: itemName,
      count,
      canCraft: false,
      maxCraftable: 0,
      ingredients: [],
      missingIngredients: [{ item: itemName, need: count, have: 0, missing: count }],
    };
  }

  // Get first recipe (cast to our type for property access)
  const firstRecipe = recipe[0] as RecipeWithIngredients;
  const ingredients: CraftingIngredient[] = [];
  const missingIngredients: CraftingIngredient[] = [];

  // Count what we have in inventory
  const inventory: Map<number, number> = new Map();
  for (const item of bot.inventory.items()) {
    const current = inventory.get(item.type) ?? 0;
    inventory.set(item.type, current + item.count);
  }

  // Check each ingredient
  const ingredientCounts: Map<number, number> = new Map();

  if (firstRecipe.ingredients) {
    for (const ing of firstRecipe.ingredients) {
      const id = typeof ing === 'number' ? ing : ing.id;
      const current = ingredientCounts.get(id) ?? 0;
      ingredientCounts.set(id, current + 1);
    }
  } else if (firstRecipe.inShape) {
    for (const row of firstRecipe.inShape) {
      for (const cell of row) {
        if (cell) {
          const id = typeof cell === 'number' ? cell : cell.id;
          const current = ingredientCounts.get(id) ?? 0;
          ingredientCounts.set(id, current + 1);
        }
      }
    }
  }

  let maxCraftable = Infinity;

  for (const [itemId, need] of ingredientCounts) {
    const itemInfo = mcData.items[itemId];
    const have = inventory.get(itemId) ?? 0;
    const totalNeed = need * count;
    const missing = Math.max(0, totalNeed - have);

    const ingredient: CraftingIngredient = {
      item: itemInfo?.name ?? `item_${itemId}`,
      need: totalNeed,
      have,
      missing,
    };

    ingredients.push(ingredient);

    if (missing > 0) {
      missingIngredients.push(ingredient);
    }

    // Calculate max we can craft
    const canCraftFromThis = Math.floor(have / need);
    maxCraftable = Math.min(maxCraftable, canCraftFromThis);
  }

  if (maxCraftable === Infinity) {
    maxCraftable = 0;
  }

  return {
    item: itemName,
    count,
    canCraft: missingIngredients.length === 0,
    maxCraftable,
    ingredients,
    missingIngredients,
  };
}

/**
 * Get list of items we can craft from current inventory
 */
export function whatCanICraft(bot: Bot): CraftableItem[] {
  const mcData = minecraftData(bot.version);
  const craftable: CraftableItem[] = [];

  // Count what we have in inventory
  const inventory: Map<number, number> = new Map();
  for (const item of bot.inventory.items()) {
    const current = inventory.get(item.type) ?? 0;
    inventory.set(item.type, current + item.count);
  }

  // Check each recipe
  for (const [itemIdStr, recipes] of Object.entries(mcData.recipes)) {
    const itemId = parseInt(itemIdStr, 10);
    const itemInfo = mcData.items[itemId];
    if (!itemInfo || !Array.isArray(recipes) || recipes.length === 0) continue;

    const recipe = recipes[0] as RecipeWithIngredients;

    // Count ingredients needed
    const ingredientCounts: Map<number, number> = new Map();

    if (recipe.ingredients) {
      for (const ing of recipe.ingredients) {
        const id = typeof ing === 'number' ? ing : ing.id;
        const current = ingredientCounts.get(id) ?? 0;
        ingredientCounts.set(id, current + 1);
      }
    } else if (recipe.inShape) {
      for (const row of recipe.inShape) {
        for (const cell of row) {
          if (cell) {
            const id = typeof cell === 'number' ? cell : cell.id;
            const current = ingredientCounts.get(id) ?? 0;
            ingredientCounts.set(id, current + 1);
          }
        }
      }
    }

    // Check if we can craft at least one
    let maxCraftable = Infinity;
    const recipeItems: string[] = [];

    for (const [ingId, need] of ingredientCounts) {
      const have = inventory.get(ingId) ?? 0;
      const ingInfo = mcData.items[ingId];
      recipeItems.push(`${need}x ${ingInfo?.name ?? ingId}`);
      maxCraftable = Math.min(maxCraftable, Math.floor(have / need));
    }

    if (maxCraftable > 0 && maxCraftable !== Infinity) {
      const resultCount = typeof recipe.result === 'object' && recipe.result !== null
        ? (recipe.result.count ?? 1)
        : 1;
      craftable.push({
        item: itemInfo.name,
        maxCount: maxCraftable * resultCount,
        recipe: recipeItems,
      });
    }
  }

  return craftable.sort((a, b) => b.maxCount - a.maxCount);
}
