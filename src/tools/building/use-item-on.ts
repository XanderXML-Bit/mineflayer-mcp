/**
 * Use Item On Block or Entity Tool
 * Activate a block at coordinates or interact with a player entity
 */

import { z } from 'zod';
import { Vec3 } from 'vec3';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';

const InputSchema = BaseInputSchema.extend({
  x: z.number().optional().describe('X coordinate of block'),
  y: z.number().optional().describe('Y coordinate of block'),
  z: z.number().optional().describe('Z coordinate of block'),
  userName: z.string().optional().describe('Player name to interact with'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  ok: boolean;
}

export class UseItemOnTool extends BaseTool<Input, Output> {
  readonly name = 'useItemOnBlockOrEntity';
  readonly description = 'Activate a block at coordinates or interact with a player entity';
  readonly category = 'building' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { x, y, z, userName } = input;

    // Block interaction
    if (x !== null && x !== undefined && y !== null && y !== undefined && z !== null && z !== undefined) {
      const block = bot.blockAt(new Vec3(x, y, z));
      if (!block) {
        throw new Error('Block not found');
      }
      await bot.activateBlock(block);
      return { ok: true };
    }

    // Player interaction
    if (userName) {
      const entity = bot.players[userName]?.entity;
      if (!entity) {
        throw new Error('Player not found');
      }
      await bot.activateEntity(entity);
      return { ok: true };
    }

    throw new Error('Specify block coords or userName');
  }
}
