/**
 * Build Template Tool
 * Build a structure from a template
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { withTask } from '../../services/task.service.js';
import { getTemplate, listTemplates } from './template-data.js';
import { Vec3 } from 'vec3';
import mcData from 'minecraft-data';

const InputSchema = BaseInputSchema.extend({
  templateName: z.string().describe('Name of the template to build'),
  offsetX: z.number().optional().default(2).describe('X offset from bot position'),
  offsetY: z.number().optional().default(0).describe('Y offset from bot position'),
  offsetZ: z.number().optional().default(0).describe('Z offset from bot position'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  success: boolean;
  templateName: string;
  blocksPlaced: number;
  blocksFailed: number;
  position?: { x: number; y: number; z: number };
  availableTemplates?: string[];
  error?: string;
}

export class BuildTemplateTool extends BaseTool<Input, Output> {
  readonly name = 'buildTemplate';
  readonly description = 'Build a structure from a pre-defined template';
  readonly category = 'building' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    return withTask(bot, async (signal) => {
      let aborted = false;
      signal.onAbort(() => { aborted = true; });

      const { templateName, offsetX, offsetY, offsetZ } = input;
      const template = getTemplate(templateName);
      const _data = mcData(bot.version);

      if (!template) {
        return {
          success: false,
          templateName,
          blocksPlaced: 0,
          blocksFailed: 0,
          availableTemplates: listTemplates(),
          error: `Template '${templateName}' not found`,
        };
      }

      const startPos = bot.entity.position.floored().offset(offsetX ?? 2, offsetY ?? 0, offsetZ ?? 0);
      let blocksPlaced = 0;
      let blocksFailed = 0;

      // Sort blocks by Y level (build from bottom up)
      const sortedBlocks = [...template.blocks].sort((a, b) => a.y - b.y);

      for (const blockInfo of sortedBlocks) {
        if (aborted) break;

        const targetPos = startPos.offset(blockInfo.x, blockInfo.y, blockInfo.z);

        // Skip special blocks that can't be placed directly
        if (['water', 'lava', 'air'].includes(blockInfo.block)) {
          continue;
        }

        // Find the block item in inventory
        const blockItem = bot.inventory.items().find(i =>
          i.name === blockInfo.block ||
          i.name === blockInfo.block.replace('_block', '') ||
          i.name.includes(blockInfo.block.split('_')[0])
        );

        if (!blockItem) {
          blocksFailed++;
          continue;
        }

        // Check if there's already a block at this position
        const existingBlock = bot.blockAt(targetPos);
        if (existingBlock && existingBlock.name !== 'air') {
          // Block already placed
          blocksPlaced++;
          continue;
        }

        // Equip the block
        try {
          await bot.equip(blockItem, 'hand');
        } catch {
          blocksFailed++;
          continue;
        }

        // Find a reference block to place against
        const referenceOffsets = [
          new Vec3(0, -1, 0), // Below
          new Vec3(-1, 0, 0), // West
          new Vec3(1, 0, 0),  // East
          new Vec3(0, 0, -1), // North
          new Vec3(0, 0, 1),  // South
          new Vec3(0, 1, 0),  // Above
        ];

        let placed = false;
        for (const refOffset of referenceOffsets) {
          if (placed) break;

          const refPos = targetPos.plus(refOffset);
          const refBlock = bot.blockAt(refPos);

          if (refBlock && refBlock.name !== 'air') {
            try {
              // Look at target
              await bot.lookAt(targetPos.offset(0.5, 0.5, 0.5));

              // Place block
              const faceVector = refOffset.scaled(-1);
              await bot.placeBlock(refBlock, faceVector);
              blocksPlaced++;
              placed = true;

              // Small delay between placements
              await new Promise(resolve => setTimeout(resolve, 100));
            } catch {
              // Try next reference
            }
          }
        }

        if (!placed) {
          blocksFailed++;
        }
      }

      return {
        success: blocksPlaced > 0,
        templateName,
        blocksPlaced,
        blocksFailed,
        position: {
          x: startPos.x,
          y: startPos.y,
          z: startPos.z,
        },
        error: blocksPlaced === 0 ? 'Could not place any blocks. Check inventory and surroundings.' : undefined,
      };
    });
  }
}
