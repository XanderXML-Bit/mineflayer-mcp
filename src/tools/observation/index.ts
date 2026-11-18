/**
 * Observation tools module
 * Tools for observing the game world
 */

export { GetPositionTool } from './get-position.js';
export { FindBlockTool } from './find-block.js';
export { FindEntityTool } from './find-entity.js';
export { ScanAreaTool } from './scan-area.js';
export { LookAroundTool } from './look-around.js';
export { ReturnToDeathTool } from './return-to-death.js';
export { GetWorldStateTool } from './get-world-state.js';

import { GetPositionTool } from './get-position.js';
import { FindBlockTool } from './find-block.js';
import { FindEntityTool } from './find-entity.js';
import { ScanAreaTool } from './scan-area.js';
import { LookAroundTool } from './look-around.js';
import { ReturnToDeathTool } from './return-to-death.js';
import { GetWorldStateTool } from './get-world-state.js';
import type { ToolContext } from '../base-tool.js';

/**
 * Create all observation tools
 */
export function createObservationTools(context: ToolContext) {
  return [
    new GetPositionTool(context),
    new FindBlockTool(context),
    new FindEntityTool(context),
    new ScanAreaTool(context),
    new LookAroundTool(context),
    new ReturnToDeathTool(context),
    new GetWorldStateTool(context),
  ];
}
