/**
 * Portal Tools
 * Tools for finding and using dimension portals
 */

import { FindPortalTool } from './find-portal.js';
import { UsePortalTool } from './use-portal.js';
import { BuildPortalTool } from './build-portal.js';
import type { ToolContext } from '../base-tool.js';

export function createPortalTools(context: ToolContext) {
  return [
    new FindPortalTool(context),
    new UsePortalTool(context),
    new BuildPortalTool(context),
  ];
}

export { FindPortalTool, UsePortalTool, BuildPortalTool };
