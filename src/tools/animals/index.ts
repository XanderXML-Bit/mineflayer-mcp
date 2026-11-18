/**
 * Animal Tools
 * Tools for interacting with animals
 */

import { TameAnimalTool } from './tame-animal.js';
import { BreedAnimalsTool } from './breed-animals.js';
import { FindAnimalsTool } from './find-animals.js';
import type { ToolContext } from '../base-tool.js';

export function createAnimalTools(context: ToolContext) {
  return [
    new FindAnimalsTool(context),
    new TameAnimalTool(context),
    new BreedAnimalsTool(context),
  ];
}

export { FindAnimalsTool, TameAnimalTool, BreedAnimalsTool };
