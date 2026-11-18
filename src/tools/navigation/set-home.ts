/**
 * Set Home Tool
 *
 * Mark current position as home base.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { remember, recall } from '../../services/memory.service.js';

const InputSchema = BaseInputSchema.extend({
  name: z
    .string()
    .min(1)
    .max(30)
    .optional()
    .default('home')
    .describe('Name for this home location (e.g., "home", "base", "mine_entrance")'),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
      z: z.number(),
    })
    .optional()
    .describe('Position to set as home. If not provided, uses current position.'),
});

type Input = z.infer<typeof InputSchema>;

interface HomeLocation {
  name: string;
  position: { x: number; y: number; z: number };
  dimension: string;
  setAt: number;
}

interface Output {
  success: boolean;
  home: HomeLocation;
  message: string;
}

export class SetHomeTool extends BaseTool<Input, Output> {
  readonly name = 'setHome';
  readonly description =
    'Mark current position (or specified position) as home. Can set multiple named home locations.';
  readonly category = 'navigation' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const pos = input.position ?? {
      x: Math.floor(bot.entity.position.x),
      y: Math.floor(bot.entity.position.y),
      z: Math.floor(bot.entity.position.z),
    };

    const dimension = this.getDimension(bot);

    const home: HomeLocation = {
      name: input.name,
      position: {
        x: Math.floor(pos.x),
        y: Math.floor(pos.y),
        z: Math.floor(pos.z),
      },
      dimension,
      setAt: Date.now(),
    };

    // Get existing homes
    const homes = recall<Record<string, HomeLocation>>('home:locations', 'spatial') ?? {};

    // Save this home
    homes[input.name] = home;
    remember('home:locations', homes, 'spatial');

    // If this is "home", also set as primary
    if (input.name === 'home') {
      remember('home:primary', input.name, 'spatial');
    }

    return {
      success: true,
      home,
      message: `Set "${input.name}" at (${home.position.x}, ${home.position.y}, ${home.position.z}) in ${dimension}`,
    };
  }

  private getDimension(bot: Bot): string {
    const dim = String(bot.game?.dimension ?? 'overworld');
    if (dim.includes('nether')) return 'nether';
    if (dim.includes('end')) return 'end';
    return 'overworld';
  }
}
