/**
 * Sleep In Nearby Bed Tool
 * Find and sleep in a nearby bed, or set spawn point during daytime
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import type { Block } from 'prismarine-block';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { pathfindToPredicate } from '../../services/navigation.service.js';

/** Bot with time extension */
type BotWithTime = Bot & {
  time?: {
    timeOfDay?: number;
    time?: number;
  };
};

const InputSchema = BaseInputSchema.extend({
  setSpawnIfDay: z
    .boolean()
    .optional()
    .default(true)
    .describe('Set spawn point if daytime (cannot sleep during day)'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  ok: boolean;
  action: 'slept' | 'set_spawn';
}

export class SleepInBedTool extends BaseTool<Input, Output> {
  readonly name = 'sleepInNearbyBed';
  readonly description = 'Find and sleep in a nearby bed, or set spawn point during daytime';
  readonly category = 'utility' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { setSpawnIfDay } = input;

    const bedPos = await pathfindToPredicate(bot, (b: Block | null) => b?.name?.includes('bed') ?? false, 24, 1);

    // If daytime and setSpawn requested, use bed to set spawn point instead of sleeping
    try {
      const botWithTime = bot as BotWithTime;
      const tod = botWithTime.time?.timeOfDay ?? botWithTime.time?.time;
      const isDay = typeof tod === 'number' ? tod % 24000 < 12000 : false;

      if (setSpawnIfDay && isDay) {
        // Mineflayer: right-click bed in daytime sets spawn
        // bedPos is already a Block from pathfindToPredicate
        await bot.activateBlock(bedPos);
        return { ok: true, action: 'set_spawn' };
      }
    } catch {
      // Ignore errors during spawn set attempt
    }

    await bot.sleep(bedPos as Block);
    return { ok: true, action: 'slept' };
  }
}
