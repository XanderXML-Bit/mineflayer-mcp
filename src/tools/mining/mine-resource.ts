/**
 * Mine Resource Tool
 * Mine blocks by name with cluster mining support
 */

import { z } from 'zod';
import { Vec3 } from 'vec3';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema, getProgressUpdater } from '../base-tool.js';
import { withTask } from '../../services/task.service.js';
import { createEquipmentService } from '../../services/equipment.service.js';
import { configureMovements, waitForNavigation } from '../../services/navigation.service.js';
import { resolveBlockAliases } from '../../utils/block-helpers.js';
import {
  isOreBlockName,
  isLogBlockName,
  posKey,
  collectBlockWithTimeout,
  requiredToolCategoryForBlockName,
  inventoryHasToolCategory,
  pickupNearbyDrops,
} from '../../utils/mining-helpers.js';

import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg;

const InputSchema = BaseInputSchema.extend({
  blockName: z.string().describe('Name of the block to mine (e.g., stone, iron_ore, oak_log)'),
  count: z.number().optional().default(1).describe('Number of blocks to mine'),
  maxMs: z.number().optional().default(120000).describe('Maximum mining time in milliseconds'),
});

type Input = z.infer<typeof InputSchema>;

interface FailedBlock {
  x: number;
  y: number;
  z: number;
  error?: string;
}

interface Output {
  ok: boolean;
  requested: number;
  completed: number;
  remaining: number;
  failed: FailedBlock[];
  timedOut?: boolean;
  stalled?: boolean;
  error?: string;
  reason?: string;
  needed?: string;
}

export class MineResourceTool extends BaseTool<Input, Output> {
  readonly name = 'mineResource';
  readonly description = 'Mine blocks by name with cluster mining support';
  readonly category = 'mining' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { blockName, count, maxMs } = input;
    const equipment = createEquipmentService();
    const updateProgress = getProgressUpdater(input);

    return withTask(bot, async (_signal) => {
      const targetCount = count ?? 1;
      const maxDuration = maxMs ?? 120000;

      // Report initial progress
      updateProgress?.({ percent: 0, message: `Starting to mine ${blockName}...` });

      // Load minecraft-data
      const mcDataMod = await import('minecraft-data');
      const mcData = mcDataMod.default(bot.version);

      // Resolve block aliases
      const candidates = resolveBlockAliases(blockName, mcData);

      // Find blocks
      const positions = bot.findBlocks({
        matching: (b) => b !== null && candidates.includes(b.name),
        maxDistance: 64,
        count: targetCount,
      });

      if (!positions.length) {
        throw new Error(`No ${blockName} found nearby`);
      }

      const blocks = positions.map((v) => bot.blockAt(v)).filter((b): b is NonNullable<typeof b> => b !== null);

      // Pre-check for required tool
      const needCat = requiredToolCategoryForBlockName(blocks[0]?.name || blockName);
      if (needCat && !inventoryHasToolCategory(bot, needCat)) {
        const err = needCat === 'pickaxe' ? 'no_pickaxe' : 'no_tools';
        return {
          ok: false,
          requested: targetCount,
          completed: 0,
          remaining: targetCount,
          failed: [],
          error: err,
          reason: 'missing_tool',
          needed: needCat,
        };
      }

      let completed = 0;
      const failed: FailedBlock[] = [];
      const start = Date.now();
      let lastProgressAt = start;
      const stallMs = 20000;

      for (const block of blocks) {
        if (Date.now() - start > maxDuration) break;

        const pos = block.position;
        try {

          // Per-block tool check
          const need = requiredToolCategoryForBlockName(block.name);
          if (need && !inventoryHasToolCategory(bot, need)) {
            const err = need === 'pickaxe' ? 'no_pickaxe' : 'no_tools';
            failed.push({ x: pos.x, y: pos.y, z: pos.z, error: err });
            return {
              ok: completed > 0,
              requested: targetCount,
              completed,
              remaining: Math.max(0, targetCount - completed),
              failed,
              error: err,
              reason: 'missing_tool',
              needed: need,
            };
          }

          // Equip best tool
          await equipment.equipBestToolForBlock(bot, block.name);

          // Navigate near block
          const movements = configureMovements(bot);
          bot.pathfinder.setMovements(movements);
          bot.pathfinder.setGoal(new goals.GoalNear(pos.x, pos.y, pos.z, 1));

          await waitForNavigation(bot, pos, { timeoutMs: 20000, arrivedDistance: 2.5 });

          // Collect block
          const blockPos = block.position.clone();
          equipment.pushSuspendAutoEat(bot);
          try {
            await collectBlockWithTimeout(bot, block, 30000);
          } finally {
            equipment.popSuspendAutoEat(bot);
          }

          // Auto-pickup dropped items
          await bot.waitForTicks(2);
          await pickupNearbyDrops(bot, blockPos, 4, 2000);

          completed++;
          lastProgressAt = Date.now();

          // Report progress
          const percent = Math.min(99, Math.round((completed / targetCount) * 100));
          updateProgress?.({ percent, message: `Mined ${completed}/${targetCount} ${blockName}` });

          // Cluster mining for ores and logs
          const minedName = block.name;
          const isClusterType = isOreBlockName(minedName) || isLogBlockName(minedName);

          if (isClusterType) {
            const originPos = block.position;
            const visited = new Set<string>([posKey(originPos)]);
            const queue: Vec3[] = [originPos];
            const maxExtra = 64;
            const dirs = [
              new Vec3(1, 0, 0),
              new Vec3(-1, 0, 0),
              new Vec3(0, 1, 0),
              new Vec3(0, -1, 0),
              new Vec3(0, 0, 1),
              new Vec3(0, 0, -1),
            ];

            while (queue.length && visited.size < maxExtra && Date.now() - start < maxDuration) {
              const cur = queue.shift();
              if (!cur) break;

              for (const dir of dirs) {
                const np = new Vec3(cur.x + dir.x, cur.y + dir.y, cur.z + dir.z);
                const k = posKey(np);

                if (visited.has(k)) continue;

                const nb = bot.blockAt(np);
                if (!nb) continue;
                if (String(nb.name || '').toLowerCase() !== minedName.toLowerCase()) continue;

                visited.add(k);

                try {
                  const need = requiredToolCategoryForBlockName(nb.name || '');
                  if (need && !inventoryHasToolCategory(bot, need)) {
                    const err = need === 'pickaxe' ? 'no_pickaxe' : 'no_tools';
                    failed.push({ x: np.x, y: np.y, z: np.z, error: err });
                    return {
                      ok: completed > 0,
                      requested: targetCount,
                      completed,
                      remaining: Math.max(0, targetCount - completed),
                      failed,
                      error: err,
                      reason: 'missing_tool',
                      needed: need,
                    };
                  }

                  await equipment.equipBestToolForBlock(bot, nb.name);

                  const movements2 = configureMovements(bot);
                  bot.pathfinder.setMovements(movements2);
                  bot.pathfinder.setGoal(new goals.GoalNear(np.x, np.y, np.z, 1));

                  await waitForNavigation(bot, np, { timeoutMs: 15000, arrivedDistance: 2.5 });

                  const clusterBlockPos = np.clone();
                  equipment.pushSuspendAutoEat(bot);
                  try {
                    await collectBlockWithTimeout(bot, nb, 30000);
                  } finally {
                    equipment.popSuspendAutoEat(bot);
                  }

                  // Auto-pickup dropped items
                  await bot.waitForTicks(2);
                  await pickupNearbyDrops(bot, clusterBlockPos, 4, 2000);

                  completed++;
                  lastProgressAt = Date.now();

                  // Report progress
                  const percent = Math.min(99, Math.round((completed / targetCount) * 100));
                  updateProgress?.({ percent, message: `Mined ${completed}/${targetCount} ${blockName} (cluster)` });

                  queue.push(np);
                } catch (e) {
                  const errMsg = e instanceof Error ? e.message : String(e);
                  failed.push({ x: np.x, y: np.y, z: np.z, error: errMsg });
                }
              }

              if (Date.now() - lastProgressAt > stallMs) break;
            }
          }
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          failed.push({ x: pos.x, y: pos.y, z: pos.z, error: errMsg });
        }

        if (Date.now() - lastProgressAt > stallMs) break;
      }

      const timedOut = Date.now() - start > maxDuration;
      const stalled = Date.now() - lastProgressAt > stallMs && !timedOut && completed < targetCount;

      return {
        ok: completed > 0,
        requested: targetCount,
        completed,
        remaining: Math.max(0, targetCount - completed),
        failed,
        timedOut,
        stalled,
      };
    });
  }
}
