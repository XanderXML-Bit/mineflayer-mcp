/**
 * Utility module exports for Minecraft MCP
 */

// Logger
export { logger, log, configureLogger, type LogLevel } from './logger.js';

// Errors
export {
  MCPError,
  NoBotError,
  BotNotFoundError,
  TaskRunningError,
  TimeoutError,
  NavigationError,
  ResourceError,
  BotDiedError,
  classifyError,
  withRetry,
  defaultRetryOptions,
  createErrorResult,
} from './errors.js';

// Timeout utilities
export {
  AdaptiveTimeoutManager,
  withTimeout,
  createTimeout,
  raceWithTimeout,
  sleep,
  createDeadline,
} from './timeout.js';

// Version adapter
export {
  VersionAdapter,
  createVersionAdapter,
  type VersionCapabilities,
} from './version-adapter.js';

// Mining helpers
export {
  isOreBlockName,
  isLogBlockName,
  posKey,
  collectBlockWithTimeout,
  digBlockWithTimeout,
  requiredToolCategoryForBlockName,
  inventoryHasToolCategory,
  getAdjacentPositions,
} from './mining-helpers.js';

// Block helpers
export {
  isWaterLike,
  isPlantObstruction,
  isClearToSkyAt,
  resolveBlockAliases,
  isFarmland,
  isMatureCrop,
  getBlockBelow,
  isSafePosition,
} from './block-helpers.js';

// Cooking helpers
export {
  isLikelyFood,
  isLikelyOre,
  chooseDeviceForItem,
  hasFood,
  getBestFood,
  getFuel,
  calculateFuelNeeded,
} from './cooking-helpers.js';

// Inventory helpers
export {
  deriveDroppedItemInfo,
  getItemDurabilityInfo,
  getEquippedSummary,
  countInventoryItems,
  countItem,
  hasInventorySpace,
  getEmptySlotCount,
  findItemByName,
  findAllItems,
} from './inventory-helpers.js';

// Text search helpers
export {
  levenshteinDistance,
  stringSimilarity,
  fuzzyMatch,
  expandWithSynonyms,
  calculateRelevance,
  searchAndRank,
  type SearchScore,
} from './text-search.js';

// Startup validation
export {
  runStartupChecks,
  validateConnectionParams,
  logSystemInfo,
  checkDependencies,
  type StartupCheckResult,
} from './startup-check.js';
