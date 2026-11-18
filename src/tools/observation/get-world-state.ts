/**
 * Get World State Tool
 *
 * Returns comprehensive environment information including time, weather,
 * biome, dimension, light level, and danger assessment.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import {
  getWorldState,
  getDangerLevel,
  isSafeToSleep,
  type WorldState,
  type DangerAssessment,
} from '../../services/world-state.service.js';

const InputSchema = BaseInputSchema.extend({
  includeDanger: z
    .boolean()
    .optional()
    .default(true)
    .describe('Include danger assessment'),
  includeSleepCheck: z
    .boolean()
    .optional()
    .default(true)
    .describe('Check if safe to sleep'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  world: WorldState;
  danger?: DangerAssessment;
  canSleep?: { safe: boolean; reason?: string };
  summary: string;
}

export class GetWorldStateTool extends BaseTool<Input, Output> {
  readonly name = 'getWorldState';
  readonly description =
    'Get comprehensive environment info: time, weather, biome, dimension, light level, danger assessment. Use to make strategic decisions about when to mine, sleep, or seek shelter.';
  readonly category = 'observation' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const world = getWorldState(bot);

    const result: Output = {
      world,
      summary: '',
    };

    if (input.includeDanger) {
      result.danger = getDangerLevel(bot);
    }

    if (input.includeSleepCheck) {
      result.canSleep = isSafeToSleep(bot);
    }

    // Build human-readable summary
    const parts: string[] = [];

    // Time info
    const timeStr = `${world.time.phase} (day ${world.time.day})`;
    parts.push(`Time: ${timeStr}`);

    // Weather
    if (world.weather !== 'clear') {
      parts.push(`Weather: ${world.weather}`);
    }

    // Biome and dimension
    parts.push(`Biome: ${world.biome}`);
    if (world.dimension !== 'overworld') {
      parts.push(`Dimension: ${world.dimension}`);
    }

    // Light level
    if (world.lightLevel < 8) {
      parts.push(`Light: ${world.lightLevel} (dark!)`);
    }

    // Underground
    if (world.isUnderground) {
      parts.push('Underground');
    }

    // Structures
    if (world.nearbyStructures.length > 0) {
      parts.push(`Nearby: ${world.nearbyStructures.join(', ')}`);
    }

    // Danger
    if (result.danger) {
      parts.push(`Danger: ${result.danger.description} (${result.danger.level}/10)`);
    }

    result.summary = parts.join(' | ');

    return result;
  }
}
