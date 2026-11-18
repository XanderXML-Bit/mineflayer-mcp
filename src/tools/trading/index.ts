/**
 * Trading Tools
 * Tools for trading with villagers
 */

import { FindVillagerTool } from './find-villager.js';
import { ListTradesTool } from './list-trades.js';
import { TradeWithVillagerTool } from './trade-with-villager.js';
import type { ToolContext } from '../base-tool.js';

export function createTradingTools(context: ToolContext) {
  return [
    new FindVillagerTool(context),
    new ListTradesTool(context),
    new TradeWithVillagerTool(context),
  ];
}

export { FindVillagerTool, ListTradesTool, TradeWithVillagerTool };
