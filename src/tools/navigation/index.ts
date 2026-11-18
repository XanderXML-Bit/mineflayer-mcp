/**
 * Navigation Tools
 *
 * Tools for home base management and exploration tracking.
 */

import { SetHomeTool } from './set-home.js';
import { GoHomeTool } from './go-home.js';
import { GetHomeInfoTool } from './get-home-info.js';
import { ExploreAreaTool } from './explore-area.js';
import { GetExplorationMapTool } from './get-exploration-map.js';
import { FindPOITool } from './find-poi.js';
import type { ToolContext } from '../base-tool.js';

export function createNavigationTools(context: ToolContext) {
  return [
    new SetHomeTool(context),
    new GoHomeTool(context),
    new GetHomeInfoTool(context),
    new ExploreAreaTool(context),
    new GetExplorationMapTool(context),
    new FindPOITool(context),
  ];
}

export {
  SetHomeTool,
  GoHomeTool,
  GetHomeInfoTool,
  ExploreAreaTool,
  GetExplorationMapTool,
  FindPOITool,
};
