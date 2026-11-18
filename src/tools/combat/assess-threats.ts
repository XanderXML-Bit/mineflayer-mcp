/**
 * Assess Threats Tool
 *
 * Get threat assessment for the current area.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import {
  assessThreats,
  type ThreatAssessment,
} from '../../services/combat-intelligence.service.js';

const InputSchema = BaseInputSchema.extend({
  radius: z
    .number()
    .int()
    .min(4)
    .max(32)
    .optional()
    .default(16)
    .describe('Radius to scan for threats in blocks'),
});

type Input = z.infer<typeof InputSchema>;

interface Output extends ThreatAssessment {
  scanRadius: number;
}

export class AssessThreatsTool extends BaseTool<Input, Output> {
  readonly name = 'assessThreats';
  readonly description =
    'Scan for hostile mobs and assess threat level. Returns fight/flee recommendation.';
  readonly category = 'combat' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const assessment = assessThreats(bot, input.radius);

    return {
      ...assessment,
      scanRadius: input.radius,
    };
  }
}
