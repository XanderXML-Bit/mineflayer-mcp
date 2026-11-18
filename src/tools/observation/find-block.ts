/**
 * Find Block Tool
 * Finds the nearest block of a given type
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import type { Block } from 'prismarine-block';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { resolveBlockAliases } from '../../utils/block-helpers.js';

/** Minecraft data module type */
interface MinecraftDataModule {
  default?: (version: string) => MinecraftData;
  (version: string): MinecraftData;
}

/** Minecraft data interface */
interface MinecraftData {
  blocksByName: Record<string, { id: number; name: string } | undefined>;
}

const InputSchema = BaseInputSchema.extend({
  blockName: z.string().describe('Name of the block to find (e.g., "diamond_ore", "log", "bed")'),
  maxDistance: z.number().optional().default(64).describe('Maximum search distance'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  position: {
    x: number;
    y: number;
    z: number;
  };
  blockName: string;
}

export class FindBlockTool extends BaseTool<Input, Output> {
  readonly name = 'findBlock';
  readonly description = 'Find the nearest block of a specific type';
  readonly category = 'observation' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { blockName, maxDistance } = input;

    if (!blockName) {
      throw new Error('blockName required');
    }

    // Load mcData for block resolution
    const mcDataMod = await import('minecraft-data') as unknown as MinecraftDataModule;
    const mcData = mcDataMod.default
      ? mcDataMod.default(bot.version)
      : mcDataMod(bot.version);

    // Resolve block name aliases
    const candidates = resolveBlockAliases(blockName, mcData);

    // Find the block
    const block = bot.findBlock({
      matching: (b: Block) => b && candidates.includes(b.name),
      maxDistance: maxDistance ?? 64,
    });

    if (!block) {
      throw new Error(`Block '${blockName}' not found within ${maxDistance} blocks`);
    }

    const pos = block.position;

    return {
      position: {
        x: pos.x,
        y: pos.y,
        z: pos.z,
      },
      blockName: block.name,
    };
  }
}
