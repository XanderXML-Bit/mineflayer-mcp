/**
 * Get Skill Details Tool
 *
 * Get complete details of a specific skill including all steps.
 * Use this to see the exact tool sequence for a skill before executing it.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema, type ToolContext } from '../base-tool.js';
import { getSkillLibrary, type Skill } from '../../services/skill-library.service.js';

const inputSchema = BaseInputSchema.extend({
  name: z.string().describe('The skill name to get details for'),
});

type Input = z.infer<typeof inputSchema>;

interface Output {
  found: boolean;
  skill: Skill | null;
  message: string;
}

export class GetSkillDetailsTool extends BaseTool<Input, Output> {
  readonly name = 'getSkillDetails';
  readonly description =
    'Get complete details of a specific skill including all steps. Use this to see the exact tool sequence before executing a skill.';
  readonly category = 'skills' as const;
  readonly inputSchema = inputSchema;

  constructor(context: ToolContext) {
    super(context);
  }

  protected async execute(input: Input, _bot: Bot): Promise<Output> {
    const library = getSkillLibrary();
    const skill = library.getSkill(input.name);

    if (!skill) {
      return {
        found: false,
        skill: null,
        message: `Skill "${input.name}" not found. Use getSkills to search for available skills.`,
      };
    }

    return {
      found: true,
      skill,
      message: `Skill "${skill.name}": ${skill.steps.length} steps, ${Math.round(skill.successRate * 100)}% success rate`,
    };
  }
}
