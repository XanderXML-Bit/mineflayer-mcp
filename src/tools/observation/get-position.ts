/**
 * Get Position Tool
 * Returns the current position of the bot
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';

const InputSchema = BaseInputSchema.extend({});

type Input = z.infer<typeof InputSchema>;

interface Output {
  position: {
    x: number;
    y: number;
    z: number;
  };
}

export class GetPositionTool extends BaseTool<Input, Output> {
  readonly name = 'getPosition';
  readonly description = 'Get the current position of the bot in the world';
  readonly category = 'observation' as const;
  readonly inputSchema = InputSchema;

  protected async execute(_input: Input, bot: Bot): Promise<Output> {
    const pos = bot.entity.position;
    return {
      position: {
        x: pos.x,
        y: pos.y,
        z: pos.z,
      },
    };
  }
}
