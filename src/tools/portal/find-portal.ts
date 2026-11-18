/**
 * Find Portal Tool
 * Find nether or end portals nearby
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import mcData from 'minecraft-data';

const InputSchema = BaseInputSchema.extend({
  portalType: z.enum(['nether', 'end']).optional().default('nether')
    .describe('Type of portal to find'),
  maxDistance: z.number().optional().default(64).describe('Maximum search distance'),
});

type Input = z.infer<typeof InputSchema>;

interface PortalInfo {
  type: string;
  position: { x: number; y: number; z: number };
  distance: number;
  isComplete: boolean;
  frameBlocks: number;
}

interface Output {
  found: boolean;
  portals: PortalInfo[];
  nearest?: PortalInfo;
}

export class FindPortalTool extends BaseTool<Input, Output> {
  readonly name = 'findPortal';
  readonly description = 'Find nether or end portals nearby';
  readonly category = 'navigation' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { portalType, maxDistance } = input;
    const data = mcData(bot.version);

    const portals: PortalInfo[] = [];
    const botPos = bot.entity.position;

    if (portalType === 'nether') {
      // Find nether portal blocks
      const portalBlockId = data.blocksByName['nether_portal']?.id;
      const obsidianId = data.blocksByName['obsidian']?.id;

      if (portalBlockId) {
        // Find active portal blocks
        const portalBlock = bot.findBlock({
          matching: portalBlockId,
          maxDistance: maxDistance ?? 64,
        });

        if (portalBlock) {
          // Count frame blocks around it
          let frameBlocks = 0;
          for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -1; dy <= 4; dy++) {
              const block = bot.blockAt(portalBlock.position.offset(dx, dy, 0));
              if (block?.type === obsidianId) frameBlocks++;
              const block2 = bot.blockAt(portalBlock.position.offset(0, dy, dx));
              if (block2?.type === obsidianId) frameBlocks++;
            }
          }

          portals.push({
            type: 'nether',
            position: {
              x: Math.round(portalBlock.position.x),
              y: Math.round(portalBlock.position.y),
              z: Math.round(portalBlock.position.z),
            },
            distance: Math.round(portalBlock.position.distanceTo(botPos) * 10) / 10,
            isComplete: true,
            frameBlocks,
          });
        }
      }

      // Also find obsidian frames that could be portals
      if (obsidianId) {
        const obsidianBlocks = bot.findBlocks({
          matching: obsidianId,
          maxDistance: maxDistance ?? 64,
          count: 100,
        });

        // Group obsidian blocks that might form a portal frame
        const checked = new Set<string>();
        for (const pos of obsidianBlocks) {
          const key = `${pos.x},${pos.y},${pos.z}`;
          if (checked.has(key)) continue;
          checked.add(key);

          // Check if this could be bottom of a portal
          let verticalCount = 0;
          for (let dy = 0; dy < 5; dy++) {
            const block = bot.blockAt(pos.offset(0, dy, 0));
            if (block?.type === obsidianId) verticalCount++;
          }

          if (verticalCount >= 4) {
            // Potential portal frame
            const distance = pos.distanceTo(botPos);
            const existing = portals.find(p =>
              Math.abs(p.position.x - pos.x) < 5 &&
              Math.abs(p.position.z - pos.z) < 5
            );

            if (!existing) {
              portals.push({
                type: 'nether_frame',
                position: {
                  x: Math.round(pos.x),
                  y: Math.round(pos.y),
                  z: Math.round(pos.z),
                },
                distance: Math.round(distance * 10) / 10,
                isComplete: false,
                frameBlocks: verticalCount,
              });
            }
          }
        }
      }
    } else if (portalType === 'end') {
      // Find end portal frames
      const endFrameId = data.blocksByName['end_portal_frame']?.id;
      const endPortalId = data.blocksByName['end_portal']?.id;

      if (endPortalId) {
        const endPortal = bot.findBlock({
          matching: endPortalId,
          maxDistance: maxDistance ?? 64,
        });

        if (endPortal) {
          portals.push({
            type: 'end',
            position: {
              x: Math.round(endPortal.position.x),
              y: Math.round(endPortal.position.y),
              z: Math.round(endPortal.position.z),
            },
            distance: Math.round(endPortal.position.distanceTo(botPos) * 10) / 10,
            isComplete: true,
            frameBlocks: 12,
          });
        }
      }

      if (endFrameId) {
        const frameBlocks = bot.findBlocks({
          matching: endFrameId,
          maxDistance: maxDistance ?? 64,
          count: 50,
        });

        if (frameBlocks.length > 0) {
          // Group frames
          const firstFrame = frameBlocks[0];
          const framesNearby = frameBlocks.filter(f =>
            f.distanceTo(firstFrame) < 10
          );

          if (!portals.some(p => p.type === 'end')) {
            portals.push({
              type: 'end_frame',
              position: {
                x: Math.round(firstFrame.x),
                y: Math.round(firstFrame.y),
                z: Math.round(firstFrame.z),
              },
              distance: Math.round(firstFrame.distanceTo(botPos) * 10) / 10,
              isComplete: framesNearby.length >= 12,
              frameBlocks: framesNearby.length,
            });
          }
        }
      }
    }

    // Sort by distance
    portals.sort((a, b) => a.distance - b.distance);

    return {
      found: portals.length > 0,
      portals,
      nearest: portals[0],
    };
  }
}
