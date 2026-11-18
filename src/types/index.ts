/**
 * Central type exports for Minecraft MCP
 */

// Configuration types
export type {
  ServerConfig,
  BotDefaultsConfig,
  AutoEatConfig,
  SelfDefenseConfig,
  AutoShieldConfig,
  NavigationConfig,
  TimeoutsConfig,
  MiningConfig,
  FarmingConfig,
  LoggingConfig,
  BotConfig,
  AppConfig,
} from './config.js';

// Bot types
export type {
  TaskState,
  DamageInfo,
  BrokenItemInfo,
  DefenseInfo,
  DeathInfo,
  HungerWarning,
  EffectInfo,
  ChatMessage,
  BotEventType,
  BotEvent,
  EventBufferState,
  StatusState,
  InventoryStatus,
  DurabilityInfo,
  EnvironmentInfo,
  BotStatus,
  StatusDelta,
  ManagedBot,
  CreateBotOptions,
  MinecraftData,
} from './bot.js';

// Service state types
export type {
  ProgressTrackerState,
  InterruptionState,
  AutoDefenseState,
  AutoArmorState,
  AutoToolState,
  SmartEatState,
  TotemState,
  ShieldState,
  BedSpawnState,
  MLGState,
  TridentState,
  ElytraState,
  SchematicState,
  RangedCombatState,
} from './service-states.js';

// Tool types
export type {
  JsonSchema,
  ToolDefinition,
  ToolResultBase,
  ToolSuccess,
  ToolError,
  ToolResult,
  ToolContext,
  ToolCategory,
  ToolMetadata,
  ClassifiedError,
  RetryOptions,
  QueuedTask,
} from './tool.js';

export { ErrorCategory, TaskPriority } from './tool.js';

// Progress tracking types
export type {
  TimestampedPosition,
  TaskType,
  ProgressState,
  ProgressIndicators,
  ProgressCheckResult,
  InterruptPriority,
  InterruptCondition,
  InterruptCheckResult,
  ProgressTimeoutConfig,
  InterruptionConfig,
} from './progress.js';

export { DEFAULT_PROGRESS_CONFIG, DEFAULT_INTERRUPT_CONFIG } from './progress.js';
