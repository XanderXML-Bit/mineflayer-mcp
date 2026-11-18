/**
 * Stop Follow Tool
 * Stop following a player
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';

const InputSchema = BaseInputSchema.extend({});

type Input = z.infer<typeof InputSchema>;

interface Output {
  stopped: boolean;
}

export class StopFollowTool extends BaseTool<Input, Output> {
  readonly name = 'stopFollow';
  readonly description = 'Stop following a player';
  readonly category = 'movement' as const;
  readonly inputSchema = InputSchema;

  protected async execute(_input: Input, bot: Bot): Promise<Output> {
    bot.pathfinder.stop();
    return { stopped: true };
  }
}
