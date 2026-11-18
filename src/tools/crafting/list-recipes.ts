/**
 * List Recipes Tool
 * List recipes for a specific item
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';

const InputSchema = BaseInputSchema.extend({
  itemName: z.string().describe('Name of the item to find recipes for'),
});

type Input = z.infer<typeof InputSchema>;

interface Ingredient {
  id: number;
  name: string;
  count: number;
}

interface RecipeInfo {
  item: { id: number; name: string };
  requiresTable: boolean;
  ingredients: Ingredient[];
  craftable: number;
}

interface Output {
  ok: boolean;
  item: string;
  recipes: RecipeInfo[];
}

export class ListRecipesTool extends BaseTool<Input, Output> {
  readonly name = 'listRecipes';
  readonly description = 'List recipes for a specific item';
  readonly category = 'crafting' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { itemName } = input;

    // Load minecraft-data
    const mcDataMod = await import('minecraft-data');
    type MinecraftDataFn = (version: string) => { itemsByName: Record<string, { id: number; name: string }>; items: Record<number, { name: string }> };
    const mcDataFn = (mcDataMod.default ?? mcDataMod) as MinecraftDataFn;
    const mcData = mcDataFn(bot.version);

    const item = mcData.itemsByName[itemName];
    if (!item) {
      throw new Error(`Unknown item ${itemName}`);
    }

    // Find nearby crafting table
    const tableBlock = bot.findBlock({
      matching: (b) => b !== null && b.name === 'crafting_table',
      maxDistance: 16,
    });

    // Get recipes with and without table
    const recipes = [
      ...bot.recipesFor(item.id, null, 1, null),
      ...(tableBlock ? bot.recipesFor(item.id, null, 1, tableBlock) : []),
    ];

    // Build inventory map
    const invMap: Record<number, number> = {};
    for (const it of bot.inventory.items()) {
      invMap[it.type] = (invMap[it.type] || 0) + it.count;
    }

    // Recipe type definitions
    interface RecipeIngredient { id: number; count?: number }
    interface RecipeShape { id: number }
    interface RecipeData {
      requiresTable?: boolean;
      ingredients?: Array<RecipeIngredient | null>;
      inShape?: Array<Array<RecipeShape | null> | null>;
    }

    const unique = new Set<unknown>();
    const out: RecipeInfo[] = [];

    for (const r of recipes) {
      if (unique.has(r)) continue;
      unique.add(r);

      const rec = r as RecipeData;
      const requiresTable = !!rec.requiresTable;
      const perUnitReq: Record<number, number> = {};

      // Extract ingredients
      if (Array.isArray(rec.ingredients)) {
        for (const ing of rec.ingredients) {
          if (!ing) continue;
          const id = Number(ing.id);
          const c = Number(ing.count ?? 1);
          perUnitReq[id] = (perUnitReq[id] || 0) + c;
        }
      }

      if (Array.isArray(rec.inShape)) {
        for (const row of rec.inShape) {
          if (!Array.isArray(row)) continue;
          for (const cell of row) {
            if (!cell) continue;
            const id = Number(cell.id);
            perUnitReq[id] = (perUnitReq[id] || 0) + 1;
          }
        }
      }

      // Build ingredient list
      const ingredients: Ingredient[] = [];
      for (const idStr of Object.keys(perUnitReq)) {
        const id = Number(idStr);
        const name = mcData.items[id]?.name || String(id);
        const cnt = perUnitReq[id];
        ingredients.push({ id, name, count: cnt });
      }

      // Estimate craftable units
      let max = 64;
      for (const idStr of Object.keys(perUnitReq)) {
        const id = Number(idStr);
        const need = perUnitReq[id];
        const have = invMap[id] || 0;
        max = Math.min(max, Math.floor(have / need));
      }
      const craftable = Math.max(0, max);

      out.push({
        item: { id: item.id, name: item.name },
        requiresTable,
        ingredients,
        craftable,
      });
    }

    return { ok: true, item: item.name, recipes: out };
  }
}
