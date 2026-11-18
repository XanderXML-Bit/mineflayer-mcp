/**
 * Utility Tools
 * Miscellaneous utility tools
 */

import { RestTool } from './rest.js';
import { SleepInBedTool } from './sleep-in-bed.js';
import { DanceTool } from './dance.js';
import { DetectGamemodeTool } from './detect-gamemode.js';
import { GoToSurfaceTool } from './go-to-surface.js';
import { PickupItemTool } from './pickup-item.js';
import { PickupLootTool } from './pickup-loot.js';
import { StopAllTasksTool } from './stop-all-tasks.js';
import { GetEventsTool } from './get-events.js';
import { RecoverItemsTool } from './recover-items.js';
import { StatusDashboardTool } from './status-dashboard.js';
import type { ToolContext } from '../base-tool.js';

export function createUtilityTools(context: ToolContext) {
  return [
    new RestTool(context),
    new SleepInBedTool(context),
    new DanceTool(context),
    new DetectGamemodeTool(context),
    new GoToSurfaceTool(context),
    new PickupItemTool(context),
    new PickupLootTool(context),
    new StopAllTasksTool(context),
    new GetEventsTool(context),
    new RecoverItemsTool(context),
    new StatusDashboardTool(context),
  ];
}

export {
  RestTool,
  SleepInBedTool,
  DanceTool,
  DetectGamemodeTool,
  GoToSurfaceTool,
  PickupItemTool,
  PickupLootTool,
  StopAllTasksTool,
  GetEventsTool,
  RecoverItemsTool,
  StatusDashboardTool,
};
