/**
 * Stronghold & End Tools
 * Tools for finding strongholds and exploring the End dimension
 */

import { ThrowEyeTool } from './throw-eye.js';
import { TriangulateStrongholdTool } from './triangulate-stronghold.js';
import { FindEndCityTool } from './find-end-city.js';
import type { ToolContext } from '../base-tool.js';

export function createStrongholdTools(context: ToolContext) {
  return [
    new ThrowEyeTool(context),
    new TriangulateStrongholdTool(context),
    new FindEndCityTool(context),
  ];
}

export { ThrowEyeTool, TriangulateStrongholdTool, FindEndCityTool };
