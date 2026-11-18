/**
 * Get Combat Readiness Tool
 *
 * Check if the bot is ready for combat.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import {
  getCombatReadiness,
  getCombatStats,
  type CombatReadiness,
  type CombatStats,
} from '../../services/combat-intelligence.service.js';

const InputSchema = BaseInputSchema.extend({
  includeStats: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include combat history statistics'),
});

type Input = z.infer<typeof InputSchema>;

interface Output extends CombatReadiness {
  stats?: CombatStats;
}

export class GetCombatReadinessTool extends BaseTool<Input, Output> {
  readonly name = 'getCombatReadiness';
  readonly description =
    'Check combat readiness: armor, weapons, health, and food. Optionally includes combat history.';
  readonly category = 'combat' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const readiness = getCombatReadiness(bot);

    if (input.includeStats) {
      return {
        ...readiness,
        stats: getCombatStats(),
      };
    }

    return readiness;
  }
}
