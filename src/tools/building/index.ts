/**
 * Building Tools
 * Tools for placing blocks and building structures
 */

import { PlaceItemNearTool } from './place-item-near.js';
import { PlaceBlockAtTool } from './place-block-at.js';
import { PrepareFarmlandTool } from './prepare-farmland.js';
import { UseItemOnTool } from './use-item-on.js';
import { BuildSomethingTool } from './build-something.js';
import type { ToolContext } from '../base-tool.js';

export function createBuildingTools(context: ToolContext) {
  return [
    new PlaceItemNearTool(context),
    new PlaceBlockAtTool(context),
    new PrepareFarmlandTool(context),
    new UseItemOnTool(context),
    new BuildSomethingTool(context),
  ];
}

export {
  PlaceItemNearTool,
  PlaceBlockAtTool,
  PrepareFarmlandTool,
  UseItemOnTool,
  BuildSomethingTool,
};
