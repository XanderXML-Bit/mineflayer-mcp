/**
 * Check Supplies Tool
 *
 * Get comprehensive resource status with alerts for low supplies.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import {
  getResourceStatus,
  checkToolDurability,
  getFoodSupply,
  type ResourceStatus,
  type ToolStatus,
  type FoodSupply,
} from '../../services/resource-planner.service.js';

const InputSchema = BaseInputSchema.extend({
  category: z
    .enum(['all', 'tools', 'food', 'materials'])
    .optional()
    .default('all')
    .describe('Category to check: all, tools, food, or materials'),
  showAlerts: z
    .boolean()
    .optional()
    .default(true)
    .describe('Include low supply alerts'),
});

type Input = z.infer<typeof InputSchema>;

interface AllOutput extends ResourceStatus {
  summary: string;
}

interface ToolsOutput {
  tools: ToolStatus[];
  criticalCount: number;
  warningCount: number;
  summary: string;
}

interface FoodOutput extends FoodSupply {
  summary: string;
}

interface MaterialsOutput {
  materials: { item: string; count: number }[];
  totalTypes: number;
  summary: string;
}

type Output = AllOutput | ToolsOutput | FoodOutput | MaterialsOutput;

export class CheckSuppliesTool extends BaseTool<Input, Output> {
  readonly name = 'checkSupplies';
  readonly description =
    'Check resource status including tool durability, food supply, and materials. Returns alerts for low supplies.';
  readonly category = 'inventory' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    switch (input.category) {
      case 'tools':
        return this.checkTools(bot);

      case 'food':
        return this.checkFood(bot);

      case 'materials':
        return this.checkMaterials(bot);

      case 'all':
      default:
        return this.checkAll(bot, input.showAlerts);
    }
  }

  private checkAll(bot: Bot, showAlerts: boolean): AllOutput {
    const status = getResourceStatus(bot);

    const toolSummary =
      status.tools.length > 0
        ? `${status.tools.length} tools (${status.tools.filter((t) => t.warning || t.critical).length} need attention)`
        : 'No tools';

    const foodSummary = `${status.food.mealsRemaining} meals (${status.food.totalFood} food points)`;
    const invSummary = `${status.inventoryUsed}/${status.inventoryTotal} slots (${status.inventoryPercent}%)`;

    let summary = `Tools: ${toolSummary}. Food: ${foodSummary}. Inventory: ${invSummary}.`;

    if (showAlerts && status.lowSupplyAlerts.length > 0) {
      summary += ` ALERTS: ${status.lowSupplyAlerts.join('; ')}`;
    }

    return {
      ...status,
      summary,
    };
  }

  private checkTools(bot: Bot): ToolsOutput {
    const tools = checkToolDurability(bot);
    const criticalCount = tools.filter((t) => t.critical).length;
    const warningCount = tools.filter((t) => t.warning && !t.critical).length;

    let summary: string;
    if (tools.length === 0) {
      summary = 'No tools in inventory';
    } else if (criticalCount > 0) {
      summary = `${criticalCount} tools critically low! ${warningCount} need attention. ${tools.length} total.`;
    } else if (warningCount > 0) {
      summary = `${warningCount} tools need attention. ${tools.length} total.`;
    } else {
      summary = `All ${tools.length} tools in good condition.`;
    }

    return {
      tools,
      criticalCount,
      warningCount,
      summary,
    };
  }

  private checkFood(bot: Bot): FoodOutput {
    const food = getFoodSupply(bot);

    let summary: string;
    if (food.items.length === 0) {
      summary = 'No food in inventory!';
    } else if (food.mealsRemaining < 3) {
      summary = `Low food! Only ${food.mealsRemaining} meals remaining.`;
    } else if (food.mealsRemaining < 10) {
      summary = `${food.mealsRemaining} meals remaining. Consider restocking.`;
    } else {
      summary = `Well stocked: ${food.mealsRemaining} meals remaining.`;
    }

    return {
      ...food,
      summary,
    };
  }

  private checkMaterials(bot: Bot): MaterialsOutput {
    const status = getResourceStatus(bot);

    const summary =
      status.materials.length > 0
        ? `${status.materials.length} different materials. Top: ${status.materials
            .slice(0, 3)
            .map((m) => `${m.count}x ${m.item}`)
            .join(', ')}`
        : 'No materials in inventory';

    return {
      materials: status.materials,
      totalTypes: status.materials.length,
      summary,
    };
  }
}
