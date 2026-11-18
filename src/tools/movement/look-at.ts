/**
 * Look At Tool
 * Make the bot look at specific coordinates
 */

import { z } from 'zod';
import { Vec3 } from 'vec3';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';

const InputSchema = BaseInputSchema.extend({
  x: z.number().describe('X coordinate to look at'),
  y: z.number().describe('Y coordinate to look at'),
  z: z.number().describe('Z coordinate to look at'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  looked: boolean;
}

export class LookAtTool extends BaseTool<Input, Output> {
  readonly name = 'lookAt';
  readonly description = 'Make the bot look at specific coordinates';
  readonly category = 'movement' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { x, y, z } = input;
    await bot.lookAt(new Vec3(x, y, z), true);
    return { looked: true };
  }
}
