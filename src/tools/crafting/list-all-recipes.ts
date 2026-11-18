/**
 * List All Recipes Tool
 * List all available recipes with filters
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';

const InputSchema = BaseInputSchema.extend({
  requiresTable: z.boolean().optional().describe('Filter by whether recipe requires crafting table'),
  craftableOnly: z.boolean().optional().default(false).describe('Only show recipes craftable with current inventory'),
  search: z.string().optional().describe('Search term for item or ingredient names'),
  limit: z.number().optional().default(100).describe('Maximum number of recipes to return'),
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
  count: number;
  recipes: RecipeInfo[];
}

export class ListAllRecipesTool extends BaseTool<Input, Output> {
  readonly name = 'listAllRecipes';
  readonly description = 'List all available recipes with filters';
  readonly category = 'crafting' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { requiresTable: requiresTableFilter, craftableOnly, search, limit } = input;

    const maxResults = Math.max(1, Math.min(500, limit ?? 100));
    const searchTerm = (search ?? '').toLowerCase().trim();

    // Load minecraft-data
    const mcDataMod = await import('minecraft-data');
    const mcData = mcDataMod.default(bot.version);

    // Item type from minecraft-data
    interface McItem {
      id: number;
      name: string;
    }

    const itemsArr: McItem[] = Object.values(mcData.itemsByName);

    // Find nearby crafting table
    const tableBlock = bot.findBlock({
      matching: (b) => b !== null && b.name === 'crafting_table',
      maxDistance: 16,
    });

    // Build inventory map
    const invMap: Record<number, number> = {};
    for (const it of bot.inventory.items()) {
      invMap[it.type] = (invMap[it.type] || 0) + it.count;
    }

    const out: RecipeInfo[] = [];

    // Recipe structure for type safety
    interface RecipeIngredient {
      id: number;
      count?: number;
    }
    interface RecipeShape {
      id: number;
    }
    interface RecipeData {
      requiresTable?: boolean;
      ingredients?: Array<RecipeIngredient | null>;
      inShape?: Array<Array<RecipeShape | null> | null>;
    }

    for (const it of itemsArr) {
      const itemName: string = String(it?.name || '').toLowerCase();
      const itemMatches = !searchTerm || itemName.includes(searchTerm);

      const recipesNo = bot.recipesFor(it.id, null, 1, null) || [];
      const recipesTab = tableBlock ? bot.recipesFor(it.id, null, 1, tableBlock) || [] : [];
      const all = [...recipesNo, ...recipesTab];

      const seen = new Set<unknown>();

      for (const r of all) {
        if (seen.has(r)) continue;
        seen.add(r);

        const rec = r as RecipeData;
        const requiresTable = !!rec.requiresTable;

        // Filter by requiresTable
        if (typeof requiresTableFilter === 'boolean' && requiresTable !== requiresTableFilter) {
          continue;
        }

        // Build per-unit ingredient map
        const perUnitReq: Record<number, number> = {};

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

        // Ingredient search filter
        let ingMatches = false;
        if (searchTerm && !itemMatches) {
          for (const idStr of Object.keys(perUnitReq)) {
            const id = Number(idStr);
            const name = (mcData.items[id]?.name || '').toLowerCase();
            if (name.includes(searchTerm)) {
              ingMatches = true;
              break;
            }
          }
          if (!ingMatches) continue;
        }

        // Calculate craftable amount
        let max = 64;
        for (const idStr of Object.keys(perUnitReq)) {
          const id = Number(idStr);
          const need = perUnitReq[id];
          const have = invMap[id] || 0;
          max = Math.min(max, Math.floor(have / need));
        }
        const craftable = Math.max(0, max);

        // Filter by craftability
        if (craftableOnly && craftable <= 0) continue;

        // Build ingredient list
        const ingredients: Ingredient[] = [];
        for (const idStr of Object.keys(perUnitReq)) {
          const id = Number(idStr);
          const name = mcData.items[id]?.name || String(id);
          const cnt = perUnitReq[id];
          ingredients.push({ id, name, count: cnt });
        }

        out.push({
          item: { id: it.id, name: it.name },
          requiresTable,
          ingredients,
          craftable,
        });

        if (out.length >= maxResults) {
          return { ok: true, count: out.length, recipes: out };
        }
      }
    }

    return { ok: true, count: out.length, recipes: out };
  }
}
