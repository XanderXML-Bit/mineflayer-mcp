/**
 * Enchanting Tools
 * Tools for enchanting items at enchanting tables
 */

import { ListEnchantmentsTool } from './list-enchantments.js';
import { EnchantItemTool } from './enchant-item.js';
import type { ToolContext } from '../base-tool.js';

export function createEnchantingTools(context: ToolContext) {
  return [
    new ListEnchantmentsTool(context),
    new EnchantItemTool(context),
  ];
}

export { ListEnchantmentsTool, EnchantItemTool };
