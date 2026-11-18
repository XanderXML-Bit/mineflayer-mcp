/**
 * Biome Tools
 * Tools for biome detection and exploration
 */

import { GetCurrentBiomeTool } from './get-current-biome.js';
import { FindBiomeTool } from './find-biome.js';
import { ListBiomesTool } from './list-biomes.js';
import type { ToolContext } from '../base-tool.js';

export function createBiomeTools(context: ToolContext) {
  return [
    new GetCurrentBiomeTool(context),
    new FindBiomeTool(context),
    new ListBiomesTool(context),
  ];
}

export { GetCurrentBiomeTool, FindBiomeTool, ListBiomesTool };
