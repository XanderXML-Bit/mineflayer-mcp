/**
 * Craft Items Tool
 * Craft items using recipes
 */

import { z } from 'zod';
import { Vec3 } from 'vec3';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { withTask } from '../../services/task.service.js';
import { createEquipmentService } from '../../services/equipment.service.js';
import { configureMovements } from '../../services/navigation.service.js';

import pathfinderPkg from 'mineflayer-pathfinder';
import type { Block } from 'prismarine-block';
const { goals } = pathfinderPkg;

const InputSchema = BaseInputSchema.extend({
  itemName: z.string().describe('Name of the item to craft'),
  count: z.number().optional().default(1).describe('Number of items to craft'),
  maxMs: z.number().optional().default(60000).describe('Maximum crafting time in milliseconds'),
});

type Input = z.infer<typeof InputSchema>;

interface MissingItem {
  id: number;
  name: string;
  count: number;
}

interface Output {
  ok: boolean;
  requested: number;
  crafted: number;
  remaining: number;
  usedTable: boolean;
  timedOut: boolean;
  reason?: string;
  missingItems?: MissingItem[];
  errors: string[];
}

export class CraftItemsTool extends BaseTool<Input, Output> {
  readonly name = 'craftItems';
  readonly description = 'Craft items using recipes';
  readonly category = 'crafting' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { itemName, count, maxMs } = input;
    const equipment = createEquipmentService();

    return withTask(bot, async (_signal) => {
      const targetCount = count ?? 1;
      const maxDuration = maxMs ?? 60000;

      // Load minecraft-data
      const mcDataMod = await import('minecraft-data');
      const mcData = mcDataMod.default(bot.version);

      const item = mcData.itemsByName[itemName];
      if (!item) {
        throw new Error(`Unknown item ${itemName}`);
      }

      // Determine if a crafting table is needed
      const recipesNoTable = bot.recipesFor(item.id, null, 1, null) || [];
      let tableBlock: Block | null =
        bot.findBlock({
          matching: (b) => b !== null && b.name === 'crafting_table',
          maxDistance: 16,
        }) ?? null;

      if (recipesNoTable.length === 0) {
        // Requires a crafting table
        if (!tableBlock) {
          const tableItem = bot.inventory.items().find((i) => i.name === 'crafting_table');
          if (!tableItem) {
            return {
              ok: false,
              requested: targetCount,
              crafted: 0,
              remaining: targetCount,
              usedTable: false,
              timedOut: false,
              reason: 'missing_table',
              missingItems: [
                {
                  id: mcData.itemsByName['crafting_table']?.id ?? -1,
                  name: 'crafting_table',
                  count: 1,
                },
              ],
              errors: ['crafting_table required but not found nearby or in inventory'],
            };
          }

          const ref = bot.blockAt(bot.entity.position.floored().offset(0, -1, 0));
          if (!ref) {
            return {
              ok: false,
              requested: targetCount,
              crafted: 0,
              remaining: targetCount,
              usedTable: false,
              timedOut: false,
              reason: 'missing_table',
              errors: ['No support block to place crafting_table'],
            };
          }

          equipment.pushSuspendAutoEat(bot);
          try {
            await bot.equip(tableItem, 'hand');
          } finally {
            equipment.popSuspendAutoEat(bot);
          }

          await bot.placeBlock(ref, new Vec3(0, 1, 0));
          await bot.waitForTicks(2);

          const pos = bot.entity.position.floored().offset(0, 0, 1);
          tableBlock = bot.blockAt(pos);
        }
      }

      // Navigate to crafting table if using one
      if (tableBlock) {
        const tp = tableBlock.position;
        const movements = configureMovements(bot);
        bot.pathfinder.setMovements(movements);
        bot.pathfinder.setGoal(new goals.GoalNear(tp.x, tp.y, tp.z, 2));

        const start = Date.now();
        while (Date.now() - start < 15000) {
          const d = bot.entity.position.distanceTo(new Vec3(tp.x, tp.y, tp.z));
          if (d <= 3) break;
          await bot.waitForTicks(5);
        }
      }

      // Refresh recipes with correct context
      const recipes = bot.recipesFor(item.id, null, 1, tableBlock || null);
      if (!recipes || recipes.length === 0) {
        return {
          ok: false,
          requested: targetCount,
          crafted: 0,
          remaining: targetCount,
          usedTable: !!tableBlock,
          timedOut: false,
          reason: 'no_recipe',
          errors: ['No recipe for item in current context'],
        };
      }

      // Prefer a table recipe if we have a table
      const recipe = (tableBlock && recipes.find((r) => (r as unknown as { requiresTable?: boolean }).requiresTable)) || recipes[0];

      // Helper to compute missing ingredients
      const computeMissingFor = (units: number): MissingItem[] => {
        try {
          const invMap: Record<number, number> = {};
          for (const it of bot.inventory.items()) {
            invMap[it.type] = (invMap[it.type] || 0) + it.count;
          }

          const reqMap: Record<number, number> = {};
          // Recipe structure varies, cast to access optional fields
          const r = recipe as unknown as {
            ingredients?: Array<{ id: number; count?: number } | null>;
            inShape?: Array<Array<{ id: number } | null> | null>;
          };

          if (Array.isArray(r.ingredients)) {
            for (const ing of r.ingredients) {
              if (!ing) continue;
              const id = Number(ing.id);
              const c = Number(ing.count ?? 1) * units;
              reqMap[id] = (reqMap[id] || 0) + c;
            }
          }

          if (Array.isArray(r.inShape)) {
            for (const row of r.inShape) {
              if (!Array.isArray(row)) continue;
              for (const cell of row) {
                if (!cell) continue;
                const id = Number(cell.id);
                reqMap[id] = (reqMap[id] || 0) + 1 * units;
              }
            }
          }

          const missing: MissingItem[] = [];
          for (const idStr of Object.keys(reqMap)) {
            const id = Number(idStr);
            const need = reqMap[id];
            const have = invMap[id] || 0;
            if (have < need) {
              const name = mcData.items[id]?.name || String(id);
              missing.push({ id, name, count: need - have });
            }
          }
          return missing;
        } catch {
          return [];
        }
      };

      // Craft with timeout
      const craftWithTimeout = async (amount: number, timeoutMs = 15000): Promise<void> => {
        const timeout = setTimeout(() => {}, timeoutMs);
        try {
          await Promise.race([
            (async () => {
              equipment.pushSuspendAutoEat(bot);
              try {
                await bot.craft(recipe, amount, tableBlock ?? undefined);
              } finally {
                equipment.popSuspendAutoEat(bot);
              }
            })(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('craft_timeout')), timeoutMs)),
          ]);
        } finally {
          clearTimeout(timeout);
        }
      };

      const errors: string[] = [];
      const deadline = Date.now() + maxDuration;
      let reason: string | undefined;

      const invCountByName = (n: string) =>
        bot.inventory
          .items()
          .filter((i) => i.name === n)
          .reduce((a, b) => a + b.count, 0);

      const countBefore = invCountByName(item.name);
      let crafted = 0;
      let lastProgressAt = Date.now();
      const idleMs = 12000;

      while (crafted < targetCount && Date.now() < deadline) {
        try {
          await craftWithTimeout(1, 8000);
          await bot.waitForTicks(2);

          const now = invCountByName(item.name);
          const delta = Math.max(0, now - (countBefore + crafted));

          if (delta <= 0) {
            errors.push('no_output_from_craft');
            reason = reason || 'unknown';
            break;
          }

          crafted += delta;
          lastProgressAt = Date.now();
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(msg);

          if (msg.includes('timeout') || msg.includes('craft_timeout')) {
            reason = 'craft_timeout';
          } else {
            reason = reason || 'missing_resources';
          }
          break;
        }

        if (Date.now() - lastProgressAt > idleMs) {
          reason = reason || 'craft_stalled';
          break;
        }
      }

      const timedOut = Date.now() >= deadline && crafted < targetCount;
      const missingItems = crafted < targetCount ? computeMissingFor(Math.max(1, targetCount - crafted)) : [];

      return {
        ok: crafted > 0,
        requested: targetCount,
        crafted,
        remaining: Math.max(0, targetCount - crafted),
        usedTable: !!tableBlock,
        timedOut,
        reason,
        missingItems,
        errors,
      };
    });
  }
}
