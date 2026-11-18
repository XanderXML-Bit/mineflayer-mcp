/**
 * Mining Tools
 * Tools for mining and digging blocks
 */

import { MineResourceTool } from './mine-resource.js';
import { DigBlockTool } from './dig-block.js';
import type { ToolContext } from '../base-tool.js';

export function createMiningTools(context: ToolContext) {
  return [new MineResourceTool(context), new DigBlockTool(context)];
}

export { MineResourceTool, DigBlockTool };
