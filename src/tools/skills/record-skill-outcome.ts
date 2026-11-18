/**
 * Record Skill Outcome Tool
 *
 * Record whether a skill execution was successful or not.
 * This updates the skill's success rate for future reference.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema, type ToolContext } from '../base-tool.js';
import { getSkillLibrary } from '../../services/skill-library.service.js';

const inputSchema = BaseInputSchema.extend({
  skillName: z.string().describe('The name of the skill that was executed'),
  success: z.boolean().describe('Whether the skill execution was successful'),
  notes: z
    .string()
    .optional()
    .describe('Optional notes about what went wrong or could be improved'),
});

type Input = z.infer<typeof inputSchema>;

interface Output {
  recorded: boolean;
  skillName: string;
  newSuccessRate: number;
  totalUses: number;
  message: string;
}

export class RecordSkillOutcomeTool extends BaseTool<Input, Output> {
  readonly name = 'recordSkillOutcome';
  readonly description =
    'Record whether a skill execution was successful. Call this after using a skill to update its success rate.';
  readonly category = 'skills' as const;
  readonly inputSchema = inputSchema;

  constructor(context: ToolContext) {
    super(context);
  }

  protected async execute(input: Input, _bot: Bot): Promise<Output> {
    const library = getSkillLibrary();
    const success = library.recordOutcome(input.skillName, input.success);

    if (!success) {
      return {
        recorded: false,
        skillName: input.skillName,
        newSuccessRate: 0,
        totalUses: 0,
        message: `Skill "${input.skillName}" not found`,
      };
    }

    const skill = library.getSkill(input.skillName);
    const successRate = skill?.successRate ?? 0;
    const totalUses = skill?.timesUsed ?? 0;

    return {
      recorded: true,
      skillName: input.skillName,
      newSuccessRate: Math.round(successRate * 100) / 100,
      totalUses,
      message: input.success
        ? `Success recorded for "${input.skillName}" (${Math.round(successRate * 100)}% success rate)`
        : `Failure recorded for "${input.skillName}" (${Math.round(successRate * 100)}% success rate)`,
    };
  }
}
