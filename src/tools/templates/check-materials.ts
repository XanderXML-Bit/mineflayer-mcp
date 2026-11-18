/**
 * Check Template Materials Tool
 * Check what materials are needed to build a template
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { getTemplate, listTemplates } from './template-data.js';

const InputSchema = BaseInputSchema.extend({
  templateName: z.string().describe('Name of the template to check'),
});

type Input = z.infer<typeof InputSchema>;

interface MaterialStatus {
  item: string;
  required: number;
  have: number;
  need: number;
  sufficient: boolean;
}

interface Output {
  success: boolean;
  templateName: string;
  canBuild: boolean;
  materials: MaterialStatus[];
  missingMaterials: string[];
  availableTemplates?: string[];
  error?: string;
}

export class CheckTemplateMaterialsTool extends BaseTool<Input, Output> {
  readonly name = 'checkTemplateMaterials';
  readonly description = 'Check what materials are needed to build a template';
  readonly category = 'building' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { templateName } = input;
    const template = getTemplate(templateName);

    if (!template) {
      return {
        success: false,
        templateName,
        canBuild: false,
        materials: [],
        missingMaterials: [],
        availableTemplates: listTemplates(),
        error: `Template '${templateName}' not found`,
      };
    }

    // Count required blocks from template
    const blockCounts: Record<string, number> = {};
    for (const block of template.blocks) {
      blockCounts[block.block] = (blockCounts[block.block] || 0) + 1;
    }

    // Add any additional requirements
    for (const [item, count] of Object.entries(template.requirements)) {
      if (!blockCounts[item]) {
        blockCounts[item] = count;
      }
    }

    // Check inventory
    const materials: MaterialStatus[] = [];
    const missingMaterials: string[] = [];

    for (const [item, required] of Object.entries(blockCounts)) {
      const inventoryItems = bot.inventory.items().filter(i => i.name === item);
      const have = inventoryItems.reduce((sum, i) => sum + i.count, 0);
      const need = Math.max(0, required - have);
      const sufficient = have >= required;

      materials.push({
        item,
        required,
        have,
        need,
        sufficient,
      });

      if (!sufficient) {
        missingMaterials.push(`${item} (need ${need} more)`);
      }
    }

    const canBuild = missingMaterials.length === 0;

    return {
      success: true,
      templateName,
      canBuild,
      materials,
      missingMaterials,
    };
  }
}
