/**
 * Anvil Tools
 * Tools for using anvils to repair, rename, and combine items
 */

import { RepairItemTool } from './repair-item.js';
import { RenameItemTool } from './rename-item.js';
import { CombineEnchantmentsTool } from './combine-enchantments.js';
import type { ToolContext } from '../base-tool.js';

export function createAnvilTools(context: ToolContext) {
  return [
    new RepairItemTool(context),
    new RenameItemTool(context),
    new CombineEnchantmentsTool(context),
  ];
}

export { RepairItemTool, RenameItemTool, CombineEnchantmentsTool };
