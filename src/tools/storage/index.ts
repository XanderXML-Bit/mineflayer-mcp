/**
 * Storage Tools
 * Tools for managing chests and containers
 */

import { OpenChestTool } from './open-chest.js';
import { DepositItemsTool } from './deposit-items.js';
import { WithdrawItemsTool } from './withdraw-items.js';
import { IndexNearbyStorageTool } from './index-nearby-storage.js';
import { FindItemInStorageTool } from './find-item-in-storage.js';
import { LabelStorageTool } from './label-storage.js';
import { GetStorageSummaryTool } from './get-storage-summary.js';
import type { ToolContext } from '../base-tool.js';

export function createStorageTools(context: ToolContext) {
  return [
    new OpenChestTool(context),
    new DepositItemsTool(context),
    new WithdrawItemsTool(context),
    new IndexNearbyStorageTool(context),
    new FindItemInStorageTool(context),
    new LabelStorageTool(context),
    new GetStorageSummaryTool(context),
  ];
}

export {
  OpenChestTool,
  DepositItemsTool,
  WithdrawItemsTool,
  IndexNearbyStorageTool,
  FindItemInStorageTool,
  LabelStorageTool,
  GetStorageSummaryTool,
};
