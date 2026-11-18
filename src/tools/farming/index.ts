/**
 * Farming Tools
 * Tools for farming and agriculture
 */

import { HarvestCropsTool } from './harvest-crops.js';
import { PlantSeedsTool } from './plant-seeds.js';
import { GatherSeedsTool } from './gather-seeds.js';
import type { ToolContext } from '../base-tool.js';

export function createFarmingTools(context: ToolContext) {
  return [
    new HarvestCropsTool(context),
    new PlantSeedsTool(context),
    new GatherSeedsTool(context),
  ];
}

export { HarvestCropsTool, PlantSeedsTool, GatherSeedsTool };
