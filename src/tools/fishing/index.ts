/**
 * Fishing Tools
 * Tools for fishing
 */

import { FishTool } from './fish.js';
import type { ToolContext } from '../base-tool.js';

export function createFishingTools(context: ToolContext) {
  return [
    new FishTool(context),
  ];
}

export { FishTool };
