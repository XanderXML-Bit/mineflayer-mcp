/**
 * Inventory Tools
 * Tools for managing bot inventory
 */

import { OpenInventoryTool } from './open-inventory.js';
import { ListInventoryTool } from './list-inventory.js';
import { EquipItemTool } from './equip-item.js';
import { DropItemTool } from './drop-item.js';
import { GiveItemTool } from './give-item.js';
import { EatFoodTool } from './eat-food.js';
import { CheckSuppliesTool } from './check-supplies.js';
import { WhatCanICraftTool } from './what-can-i-craft.js';
import { CheckRequirementsTool } from './check-requirements.js';
import type { ToolContext } from '../base-tool.js';

export function createInventoryTools(context: ToolContext) {
  return [
    new OpenInventoryTool(context),
    new ListInventoryTool(context),
    new EquipItemTool(context),
    new DropItemTool(context),
    new GiveItemTool(context),
    new EatFoodTool(context),
    new CheckSuppliesTool(context),
    new WhatCanICraftTool(context),
    new CheckRequirementsTool(context),
  ];
}

export {
  OpenInventoryTool,
  ListInventoryTool,
  EquipItemTool,
  DropItemTool,
  GiveItemTool,
  EatFoodTool,
  CheckSuppliesTool,
  WhatCanICraftTool,
  CheckRequirementsTool,
};
