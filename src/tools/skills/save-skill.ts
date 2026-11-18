/**
 * Save Skill Tool
 *
 * Saves a successful tool sequence as a reusable skill.
 * The LLM calls this after completing a multi-step task to remember the approach.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema, type ToolContext } from '../base-tool.js';
import { getSkillLibrary, type SkillStep } from '../../services/skill-library.service.js';

const SkillStepSchema = z.object({
  tool: z.string().describe('The tool name to call'),
  parameters: z.record(z.unknown()).describe('Parameters for the tool'),
  skill: z.string().optional().describe('Reference another skill instead of a tool'),
  times: z.number().optional().describe('How many times to execute (for skill references)'),
  expectedOutcome: z.string().optional().describe('What this step should achieve'),
  notes: z.string().optional().describe('Notes or tips for executing this step'),
});

const inputSchema = BaseInputSchema.extend({
  name: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/, 'Skill name must be snake_case')
    .describe('Unique skill identifier in snake_case (e.g., "craft_iron_pickaxe")'),
  description: z
    .string()
    .min(10)
    .max(200)
    .describe('Clear description of what this skill does'),
  tags: z
    .array(z.string())
    .min(1)
    .describe('Searchable tags (e.g., ["mining", "iron", "pickaxe"])'),
  steps: z
    .array(SkillStepSchema)
    .min(1)
    .describe('The sequence of tool calls that make up this skill'),
  prerequisites: z
    .array(z.string())
    .default([])
    .describe('Items or conditions required before using this skill'),
  outcomes: z
    .array(z.string())
    .default([])
    .describe('What this skill produces or achieves'),
  category: z
    .string()
    .optional()
    .describe('Category for organization (e.g., "crafting", "gathering", "combat")'),
});

type Input = z.infer<typeof inputSchema>;

interface Output {
  saved: boolean;
  skill: {
    name: string;
    description: string;
    complexity: string;
    stepCount: number;
  };
  message: string;
}

export class SaveSkillTool extends BaseTool<Input, Output> {
  readonly name = 'saveSkill';
  readonly description =
    'Save a successful tool sequence as a reusable skill. Call this after completing a multi-step task to remember the approach for future use.';
  readonly category = 'skills' as const;
  readonly inputSchema = inputSchema;

  constructor(context: ToolContext) {
    super(context);
  }

  protected async execute(input: Input, _bot: Bot): Promise<Output> {
    const library = getSkillLibrary();

    const skill = library.saveSkill({
      name: input.name,
      description: input.description,
      tags: input.tags,
      steps: input.steps as SkillStep[],
      prerequisites: input.prerequisites,
      outcomes: input.outcomes,
      category: input.category,
    });

    return {
      saved: true,
      skill: {
        name: skill.name,
        description: skill.description,
        complexity: skill.complexity,
        stepCount: skill.steps.length,
      },
      message: `Skill "${skill.name}" saved successfully (${skill.complexity}, ${skill.steps.length} steps)`,
    };
  }
}
