/**
 * Cooking Tools
 * Tools for cooking and smelting items
 */

import { SmeltItemTool } from './smelt-item.js';
import { CookItemTool } from './cook-item.js';
import { CookWithSmokerTool } from './cook-with-smoker.js';
import { SmeltWithBlastFurnaceTool } from './smelt-with-blast-furnace.js';
import { CookWithCampfireTool } from './cook-with-campfire.js';
import { RetrieveFromFurnaceTool } from './retrieve-from-furnace.js';
import type { ToolContext } from '../base-tool.js';

export function createCookingTools(context: ToolContext) {
  return [
    new SmeltItemTool(context),
    new CookItemTool(context),
    new CookWithSmokerTool(context),
    new SmeltWithBlastFurnaceTool(context),
    new CookWithCampfireTool(context),
    new RetrieveFromFurnaceTool(context),
  ];
}

export {
  SmeltItemTool,
  CookItemTool,
  CookWithSmokerTool,
  SmeltWithBlastFurnaceTool,
  CookWithCampfireTool,
  RetrieveFromFurnaceTool,
};
