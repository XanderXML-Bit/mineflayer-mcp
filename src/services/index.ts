/**
 * Services module exports
 */

// Task service
export {
  getTaskState,
  withTask,
  TaskScheduler,
  createTaskScheduler,
} from './task.service.js';

// Navigation service
export {
  configureMovements,
  attemptUnstuck,
  NavigationService,
  createNavigationService,
  type NavigationResult,
  type NavigationOptions,
} from './navigation.service.js';

// Equipment service
export {
  EquipmentService,
  createEquipmentService,
} from './equipment.service.js';

// Status service
export {
  initializeStatusState,
  getStatusState,
  recordDamage,
  recordBrokenItem,
  recordDefense,
  recordDeath,
  recordHungerWarning,
  recordEffect,
  removeEffect,
  recordChatMessage,
  getChatLog,
  getLastDeathPosition,
  getInventoryStatus,
  getEnvironmentInfo,
  getBotStatus,
  calculateStatusDelta,
  StatusService,
  createStatusService,
} from './status.service.js';

// Skill Library service (AI learning)
export {
  SkillLibraryService,
  getSkillLibrary,
  type Skill,
  type SkillStep,
  type SkillSearchOptions,
  type SkillStats,
} from './skill-library.service.js';

// Goal Decomposition service (tech tree)
export {
  GoalDecompositionService,
  getGoalDecomposition,
  decomposeGoal,
  suggestNextGoals,
  getTechTree,
  type TechTreeNode,
  type TechCategory,
  type DecomposedGoal,
  type GoalStep,
} from './goal-decomposition.service.js';

// Reflection service (learning from outcomes)
export {
  ReflectionService,
  getReflectionService,
  recordTaskOutcome,
  getReflectionStats,
  getInsights,
  type TaskOutcome,
  type FailureCategory,
  type ReflectionStats,
  type Insight,
} from './reflection.service.js';

// Auto-armor service (automatic armor management)
export {
  initializeAutoArmor,
  setAutoArmorEnabled,
  configureAutoArmor,
  getAutoArmorStatus,
  equipBestArmorNow,
  cleanupAutoArmor,
  type AutoArmorConfig,
} from './auto-armor.service.js';

// Auto-tool service (automatic tool selection)
export {
  equipBestToolForBlock,
  equipBestWeapon,
  configureAutoTool,
  getAutoToolStatus,
  setAutoToolEnabled,
  type AutoToolConfig,
} from './auto-tool.service.js';

// Ranged combat service (bow/crossbow aiming)
export {
  calculateAim,
  shootAt,
  rapidFire,
  configureRangedCombat,
  getRangedCombatStatus,
  equipRangedWeapon,
  hasAmmo,
  setRangedCombatEnabled,
  type RangedCombatConfig,
} from './ranged-combat.service.js';

// Smart eat service (intelligent eating with flee mechanic)
export {
  initializeSmartEat,
  setSmartEatEnabled,
  configureSmartEat,
  getSmartEatStatus,
  eatNow,
  cleanupSmartEat,
  type SmartEatConfig,
} from './smart-eat.service.js';

// Totem of Undying service (auto-equip death prevention)
export {
  initializeTotemService,
  setTotemServiceEnabled,
  configureTotemService,
  getTotemStatus,
  equipTotemNow,
  cleanupTotemService,
  type TotemConfig,
} from './totem.service.js';

// Shield service (auto-blocking in combat)
export {
  initializeShieldService,
  setShieldServiceEnabled,
  configureShieldService,
  getShieldStatus,
  raiseShieldNow,
  lowerShieldNow,
  counterAttack,
  cleanupShieldService,
  type ShieldConfig,
} from './shield.service.js';

// Bed spawn service (spawn point management)
export {
  initializeBedSpawnService,
  configureBedSpawnService,
  findNearbyBeds,
  registerBed,
  setSpawnPoint,
  getKnownBeds,
  getCurrentSpawnPoint,
  getBackupSpawnPoint,
  findNearestBed,
  canSleepNow,
  sleepInBed,
  goToBed,
  goToSpawnPoint,
  labelBed,
  removeBed,
  getBedSpawnStatus,
  exportBedData,
  importBedData,
  type BedLocation,
  type BedSpawnConfig,
} from './bed-spawn.service.js';

// MLG Water service (fall damage prevention)
export {
  initializeMLGWater,
  setMLGWaterEnabled,
  configureMLGWater,
  getMLGWaterStatus,
  performMLGNow,
  cleanupMLGWater,
  type MLGWaterConfig,
} from './mlg-water.service.js';

// Trident service (riptide, channeling, throwing)
export {
  initializeTridentService,
  configureTridentService,
  findTrident,
  getTridentEnchantments,
  canUseRiptide,
  useRiptide,
  riptideToward,
  throwTrident,
  canTriggerLightning,
  getTridentStatus,
  type TridentEnchantments,
  type TridentConfig,
} from './trident.service.js';

// Elytra service (flight navigation)
export {
  initializeElytraService,
  configureElytraService,
  cleanupElytraService,
  findElytra,
  isElytraEquipped,
  getElytraDurability,
  findFireworks,
  equipElytra,
  isElytraFlying,
  startFlight,
  useFireworkBoost,
  setFlightDirection,
  landSafely,
  flyTo,
  getElytraStatus,
  type ElytraConfig,
} from './elytra.service.js';

// Schematic service (structure building)
export {
  initializeSchematicService,
  configureSchematicService,
  createSchematicFromArray,
  createSchematicFromTemplate,
  loadSchematic,
  unloadSchematic,
  calculateMaterials,
  getBuildProgress,
  buildSchematic,
  pauseBuild,
  resumeBuild,
  stopBuild,
  resetFailedBlocks,
  getSchematicStatus,
  type SchematicData,
  type BlockPlacement,
  type MaterialRequirements,
  type BuildProgress,
  type SchematicConfig,
} from './schematic.service.js';

// Memory service (persistent key-value storage)
export {
  MemoryService,
  getMemoryService,
  shutdownMemoryService,
  remember,
  recall,
  forget,
  type MemoryCategory,
  type MemoryEntry,
} from './memory.service.js';

// Event service (event buffering and listeners)
export {
  initializeEventBuffer,
  pushEvent,
  getAndClearEvents,
  peekEvents,
  attachEventListeners,
  detachEventListeners,
  type BotEventType,
  type BotEvent,
  type EventBufferState,
} from './event.service.js';

// Goal service (goal tracking and management)
export {
  addGoal,
  getGoal,
  updateGoal,
  completeGoal,
  failGoal,
  pauseGoal,
  resumeGoal,
  deleteGoal,
  getActiveGoals,
  getPendingGoals,
  getGoalHistory,
  getAllGoals,
  getGoalsByPriority,
  getGoalStats,
  clearAllGoals,
  addSubgoal,
  removeSubgoal,
  type GoalPriority,
  type GoalStatus,
  type Goal,
} from './goal.service.js';

// Exploration service (chunk tracking and POIs)
export {
  markExplored,
  isExplored,
  addPointOfInterest,
  getPointsOfInterest,
  findNearestPOI,
  getUnexploredDirection,
  getExplorationStats,
  getExplorationMap,
  clearExplorationData,
  type PointOfInterest,
  type ExploredChunk,
  type ExplorationStats,
} from './exploration.service.js';

// World state service (environment and danger assessment)
export {
  getWorldState,
  isNightTime,
  isSafeToSleep,
  getDangerLevel,
  type TimeInfo,
  type WorldState,
  type DangerAssessment,
} from './world-state.service.js';

// Combat intelligence service (threat assessment)
export {
  getArmorRating,
  getBestWeapon,
  assessThreats,
  getCombatReadiness,
  recordCombatResult,
  getCombatStats,
  clearCombatStats,
  type ThreatInfo,
  type ThreatLevel,
  type ThreatAssessment,
  type CombatReadiness,
  type CombatStats,
} from './combat-intelligence.service.js';

// Resource planner service (tool/food/material tracking)
export {
  getResourceStatus,
  checkToolDurability,
  getFoodSupply,
  canCraft,
  whatCanICraft,
  type ToolStatus,
  type FoodItem,
  type FoodSupply,
  type MaterialCount,
  type ResourceStatus,
  type CraftingIngredient,
  type CraftingRequirement,
  type CraftableItem,
} from './resource-planner.service.js';

// Storage index service (container tracking)
export {
  getAllStorageLocations,
  indexStorage,
  findItemInStorage,
  labelStorage,
  getStorageByLabel,
  getStorageSummary,
  findNearbyStorage,
  removeFromIndex,
  clearStorageIndex,
  type StorageItem,
  type StorageLocation,
  type StorageSearchResult,
  type StorageSummary,
} from './storage-index.service.js';

// Auto-defense service (automatic hostile mob response)
export {
  initializeAutoDefense,
  setAutoDefenseEnabled,
  configureAutoDefense,
  getAutoDefenseStatus,
  cleanupAutoDefenseListeners,
  DEFAULT_AUTO_DEFENSE_CONFIG,
  type AutoDefenseConfig,
  type AutoDefenseState,
} from './auto-defense.service.js';

// Progress tracker service (stall detection)
export {
  startProgressTracking,
  stopProgressTracking,
  getProgressStatus,
  recordProgress,
  onStalled,
  createProgressTimeout,
  withProgressTimeout,
  type ProgressTrackerState,
} from './progress-tracker.js';

// Interruption manager service (task safety)
export {
  initializeInterruptionManager,
  checkToolsAvailable,
  onInterrupt,
  onMandatoryInterrupt,
  checkForInterrupts,
  cleanupInterruptionListeners,
  getInterruptConfig,
  setInterruptConfig,
  type InterruptionState,
} from './interruption-manager.js';

// Death recovery service (death tracking and item recovery)
export {
  recordDeath as recordDeathForRecovery,
  getLastDeath,
  getDeathHistory,
  markRecovered,
  incrementRecoveryAttempts,
  itemsLikelyAvailable,
  clearDeathHistory,
  getDeathStats,
  type DeathRecord,
} from './death-recovery.service.js';
