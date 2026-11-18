/**
 * Multi-Bot Coordination Tools
 * Tools for coordinating multiple bots
 */

import { TeamStatusTool } from './team-status.js';
import { AssignRoleTool } from './assign-role.js';
import { FormUpTool } from './form-up.js';
import type { ToolContext } from '../base-tool.js';

export function createMultiBotTools(context: ToolContext) {
  return [
    new TeamStatusTool(context),
    new AssignRoleTool(context),
    new FormUpTool(context),
  ];
}

export { TeamStatusTool, AssignRoleTool, FormUpTool };
