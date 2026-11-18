/**
 * Crafting Tools
 * Tools for crafting items
 */

import { CraftItemsTool } from './craft-items.js';
import { ListRecipesTool } from './list-recipes.js';
import { ListAllRecipesTool } from './list-all-recipes.js';
import type { ToolContext } from '../base-tool.js';

export function createCraftingTools(context: ToolContext) {
  return [
    new CraftItemsTool(context),
    new ListRecipesTool(context),
    new ListAllRecipesTool(context),
  ];
}

export { CraftItemsTool, ListRecipesTool, ListAllRecipesTool };
