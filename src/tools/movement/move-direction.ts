/**
 * Move In Direction Tool
 * Move in a specific direction for a duration
 */

import { z } from 'zod';
import type { Bot, ControlState } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';

const InputSchema = BaseInputSchema.extend({
  direction: z
    .enum(['forward', 'back', 'left', 'right', 'sprint', 'sneak'])
    .describe('Direction to move'),
  durationMs: z.number().optional().default(1000).describe('Duration in milliseconds'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  moved: boolean;
  direction: string;
}

export class MoveDirectionTool extends BaseTool<Input, Output> {
  readonly name = 'moveInDirection';
  readonly description = 'Move in a specific direction for a duration';
  readonly category = 'movement' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { direction, durationMs } = input;

    const controlMap: Record<string, string> = {
      forward: 'forward',
      back: 'back',
      left: 'left',
      right: 'right',
      sprint: 'sprint',
      sneak: 'sneak',
    };

    const control = controlMap[direction];
    if (!control) {
      throw new Error(`Invalid direction: ${direction}`);
    }

    bot.setControlState(control as ControlState, true);
    await new Promise((r) => setTimeout(r, durationMs ?? 1000));
    bot.setControlState(control as ControlState, false);

    return {
      moved: true,
      direction,
    };
  }
}
