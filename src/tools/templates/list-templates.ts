/**
 * List Templates Tool
 * List available building templates
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { BUILDING_TEMPLATES } from './template-data.js';

const InputSchema = BaseInputSchema.extend({});

type Input = z.infer<typeof InputSchema>;

interface TemplateInfo {
  name: string;
  description: string;
  size: { x: number; y: number; z: number };
  blockCount: number;
  requirements: Record<string, number>;
}

interface Output {
  templates: TemplateInfo[];
  count: number;
}

export class ListTemplatesTool extends BaseTool<Input, Output> {
  readonly name = 'listBuildingTemplates';
  readonly description = 'List available building templates';
  readonly category = 'building' as const;
  readonly inputSchema = InputSchema;

  protected async execute(_input: Input, _bot: Bot): Promise<Output> {
    const templates: TemplateInfo[] = Object.values(BUILDING_TEMPLATES).map(t => ({
      name: t.name,
      description: t.description,
      size: t.size,
      blockCount: t.blocks.length,
      requirements: t.requirements,
    }));

    return {
      templates,
      count: templates.length,
    };
  }
}
