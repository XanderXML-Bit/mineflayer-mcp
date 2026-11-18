/**
 * Brewing Tools
 * Tools for brewing potions at brewing stands
 */

import { ListBrewingRecipesTool } from './list-brewing-recipes.js';
import { BrewPotionTool } from './brew-potion.js';
import { RetrieveFromBrewingStandTool } from './retrieve-from-brewing-stand.js';
import { AddToBrewingStandTool } from './add-to-brewing-stand.js';
import type { ToolContext } from '../base-tool.js';

export function createBrewingTools(context: ToolContext) {
  return [
    new ListBrewingRecipesTool(context),
    new BrewPotionTool(context),
    new AddToBrewingStandTool(context),
    new RetrieveFromBrewingStandTool(context),
  ];
}

export {
  ListBrewingRecipesTool,
  BrewPotionTool,
  AddToBrewingStandTool,
  RetrieveFromBrewingStandTool,
};
