/**
 * Automation Tools
 * Tools for automated resource gathering and area defense
 */

import { AutoMineTool } from './auto-mine.js';
import { AutoFarmTool } from './auto-farm.js';
import { GuardAreaTool } from './guard-area.js';
import type { ToolContext } from '../base-tool.js';

export function createAutomationTools(context: ToolContext) {
  return [
    new AutoMineTool(context),
    new AutoFarmTool(context),
    new GuardAreaTool(context),
  ];
}

export { AutoMineTool, AutoFarmTool, GuardAreaTool };
