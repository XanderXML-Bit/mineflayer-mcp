/**
 * Build Portal Tool
 * Build a nether portal frame
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { withTask } from '../../services/task.service.js';
import mcData from 'minecraft-data';

const InputSchema = BaseInputSchema.extend({
  lightPortal: z.boolean().optional().default(true)
    .describe('Light the portal with flint and steel after building'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  success: boolean;
  position?: { x: number; y: number; z: number };
  obsidianUsed?: number;
  portalLit?: boolean;
  error?: string;
}

export class BuildPortalTool extends BaseTool<Input, Output> {
  readonly name = 'buildNetherPortal';
  readonly description = 'Build a nether portal frame at current location';
  readonly category = 'building' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    return withTask(bot, async (signal) => {
      let aborted = false;
      signal.onAbort(() => { aborted = true; });

      const _data = mcData(bot.version);

      // Check for obsidian (minimum 10 for portal frame)
      const obsidian = bot.inventory.items().find(i => i.name === 'obsidian');
      if (!obsidian || obsidian.count < 10) {
        return {
          success: false,
          error: `Need at least 10 obsidian. Have ${obsidian?.count || 0}`,
        };
      }

      // Check for flint and steel if lighting
      let flintAndSteel = null;
      if (input.lightPortal) {
        flintAndSteel = bot.inventory.items().find(i => i.name === 'flint_and_steel');
        if (!flintAndSteel) {
          return { success: false, error: 'Need flint and steel to light portal' };
        }
      }

      const startPos = bot.entity.position.floored();
      let obsidianUsed = 0;

      // Portal frame pattern (4 wide x 5 tall, hollow inside)
      // Looking at portal from front:
      //   O O O O
      //   O . . O
      //   O . . O
      //   O . . O
      //   O O O O

      const framePositions = [
        // Bottom row
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
        { x: 3, y: 0, z: 0 },
        // Left column
        { x: 0, y: 1, z: 0 },
        { x: 0, y: 2, z: 0 },
        { x: 0, y: 3, z: 0 },
        // Right column
        { x: 3, y: 1, z: 0 },
        { x: 3, y: 2, z: 0 },
        { x: 3, y: 3, z: 0 },
        // Top row
        { x: 0, y: 4, z: 0 },
        { x: 1, y: 4, z: 0 },
        { x: 2, y: 4, z: 0 },
        { x: 3, y: 4, z: 0 },
      ];

      // Find a good spot to build (need clear space)
      const buildPos = startPos.offset(2, 0, 0); // Build 2 blocks in front

      // Equip obsidian
      await bot.equip(obsidian, 'hand');

      // Place obsidian blocks
      for (const offset of framePositions) {
        if (aborted) break;

        const placePos = buildPos.offset(offset.x, offset.y, offset.z);
        const existingBlock = bot.blockAt(placePos);

        // Skip if obsidian already there
        if (existingBlock?.name === 'obsidian') continue;

        // Find a reference block to place against
        const referencePositions = [
          placePos.offset(0, -1, 0), // Below
          placePos.offset(-1, 0, 0), // Left
          placePos.offset(1, 0, 0),  // Right
          placePos.offset(0, 0, -1), // Back
          placePos.offset(0, 0, 1),  // Front
        ];

        let placed = false;
        for (const refPos of referencePositions) {
          const refBlock = bot.blockAt(refPos);
          if (refBlock && refBlock.name !== 'air') {
            try {
              // Look at the placement position
              await bot.lookAt(placePos.offset(0.5, 0.5, 0.5));
              await bot.placeBlock(refBlock, placePos.minus(refPos));
              obsidianUsed++;
              placed = true;
              await new Promise(resolve => setTimeout(resolve, 200));
              break;
            } catch {
              // Try next reference
            }
          }
        }

        if (!placed && offset.y === 0) {
          // For bottom row, place on ground
          const groundBlock = bot.blockAt(placePos.offset(0, -1, 0));
          if (groundBlock) {
            try {
              await bot.lookAt(placePos.offset(0.5, 0.5, 0.5));
              await bot.placeBlock(groundBlock, new Vec3(0, 1, 0));
              obsidianUsed++;
              placed = true;
              await new Promise(resolve => setTimeout(resolve, 200));
            } catch {
              // Continue
            }
          }
        }
      }

      // Light the portal
      let portalLit = false;
      if (input.lightPortal && flintAndSteel && !aborted) {
        await bot.equip(flintAndSteel, 'hand');

        // Find an obsidian block at bottom of portal interior
        const lightPos = buildPos.offset(1, 1, 0);
        const insideBlock = bot.blockAt(lightPos);

        if (insideBlock) {
          try {
            const bottomBlock = bot.blockAt(buildPos.offset(1, 0, 0));
            if (bottomBlock) {
              await bot.lookAt(lightPos.offset(0.5, 0, 0.5));
              await bot.activateBlock(bottomBlock);
              portalLit = true;
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          } catch {
            // Portal lighting failed
          }
        }
      }

      return {
        success: obsidianUsed >= 10,
        position: {
          x: buildPos.x,
          y: buildPos.y,
          z: buildPos.z,
        },
        obsidianUsed,
        portalLit,
        error: obsidianUsed < 10 ? 'Could not place all obsidian blocks' : undefined,
      };
    });
  }
}
