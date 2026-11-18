/**
 * Dig Block Tool
 * Dig a block at a specific position with auto-equip and tool warnings
 */

import { z } from 'zod';
import { Vec3 } from 'vec3';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { withTask } from '../../services/task.service.js';
import { createEquipmentService } from '../../services/equipment.service.js';
import {
  requiredToolCategoryForBlockName,
  inventoryHasToolCategory,
  pickupNearbyDrops,
} from '../../utils/mining-helpers.js';

const InputSchema = BaseInputSchema.extend({
  x: z.number().describe('X coordinate of the block'),
  y: z.number().describe('Y coordinate of the block'),
  z: z.number().describe('Z coordinate of the block'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  ok: boolean;
  blockName?: string;
  warning?: string;
  toolEquipped?: string;
  willDrop?: boolean;
  itemsPickedUp?: number;
}

export class DigBlockTool extends BaseTool<Input, Output> {
  readonly name = 'digBlock';
  readonly description = 'Dig a block at a specific position';
  readonly category = 'mining' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { x, y, z } = input;
    const equipment = createEquipmentService();

    return withTask(bot, async (_signal) => {
      const block = bot.blockAt(new Vec3(x, y, z));
      if (!block) {
        throw new Error('Block not found at specified position');
      }

      const blockName = block.name;

      // Check what tool is required for this block
      const requiredTool = requiredToolCategoryForBlockName(blockName);

      // Check if we have the required tool
      if (requiredTool && !inventoryHasToolCategory(bot, requiredTool)) {
        // No suitable tool - warn and abort
        return {
          ok: false,
          blockName,
          warning: `Cannot mine ${blockName}: requires a ${requiredTool} but none found in inventory. ` +
            `Breaking this block with fists will not drop any items.`,
          willDrop: false,
        };
      }

      // Auto-equip the best tool for this block
      let toolEquipped: string | undefined;
      try {
        await equipment.equipBestToolForBlock(bot, blockName);
        const mainHand = bot.heldItem;
        if (mainHand) {
          toolEquipped = mainHand.name;
        }
      } catch {
        // If equip fails, continue but warn
      }

      // Check if the equipped tool can actually harvest the block
      const canHarvest = block.canHarvest(bot.heldItem?.type ?? null);
      if (!canHarvest && requiredTool) {
        return {
          ok: false,
          blockName,
          toolEquipped,
          warning: `Cannot harvest ${blockName}: the equipped tool (${toolEquipped || 'fists'}) ` +
            `cannot mine this block. Requires a ${requiredTool}.`,
          willDrop: false,
        };
      }

      const blockPos = block.position.clone();

      equipment.pushSuspendAutoEat(bot);
      try {
        await bot.dig(block);
      } finally {
        equipment.popSuspendAutoEat(bot);
      }

      // Auto-pickup dropped items near the mined block
      let itemsPickedUp = 0;
      if (canHarvest) {
        // Small delay for items to spawn
        await bot.waitForTicks(3);
        itemsPickedUp = await pickupNearbyDrops(bot, blockPos, 4, 3000);
      }

      return {
        ok: true,
        blockName,
        toolEquipped,
        willDrop: canHarvest,
        itemsPickedUp,
      };
    });
  }
}
