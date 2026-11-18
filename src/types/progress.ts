/**
 * Types for progress tracking and task interruption
 */

/** Position with timestamp for tracking movement */
export interface TimestampedPosition {
  x: number;
  y: number;
  z: number;
  timestamp: number;
}

/** Progress indicators for different task types */
export type TaskType =
  | 'mining'
  | 'navigation'
  | 'crafting'
  | 'combat'
  | 'farming'
  | 'smelting'
  | 'fishing'
  | 'building'
  | 'generic';

/** Progress state for a running task */
export interface ProgressState {
  taskType: TaskType;
  startedAt: number;
  lastProgressAt: number;
  positions: TimestampedPosition[];
  indicators: ProgressIndicators;
}

/** Specific progress indicators */
export interface ProgressIndicators {
  blocksMinedCount: number;
  distanceTraveled: number;
  itemsCollected: number;
  itemsCrafted: number;
  damageDealt: number;
  cropsHarvested: number;
  lastInventoryHash: string;
}

/** Progress check result */
export interface ProgressCheckResult {
  isProgressing: boolean;
  stallDurationMs: number;
  indicators: ProgressIndicators;
  reason?: string;
}

/** Interruption priority levels */
export type InterruptPriority = 'critical' | 'high' | 'advisory';

/** Interruption condition definition */
export interface InterruptCondition {
  name: string;
  priority: InterruptPriority;
  message: string;
  data?: Record<string, unknown>;
}

/** Interruption check result */
export interface InterruptCheckResult {
  shouldInterrupt: boolean;
  condition?: InterruptCondition;
}

/** Progress-based timeout configuration */
export interface ProgressTimeoutConfig {
  /** Maximum time with no progress before timeout (ms) */
  stallTimeoutMs: number;
  /** How often to check progress (ms) */
  checkIntervalMs: number;
  /** Minimum movement to count as progress (blocks) */
  movementThreshold: number;
  /** Number of position samples to keep */
  positionHistorySize: number;
}

/** Default progress timeout configuration */
export const DEFAULT_PROGRESS_CONFIG: ProgressTimeoutConfig = {
  stallTimeoutMs: 15000,
  checkIntervalMs: 100,
  movementThreshold: 0.5,
  positionHistorySize: 50,
};

/** Interruption manager configuration */
export interface InterruptionConfig {
  /** Damage threshold to trigger interrupt (hearts) */
  damageThreshold: number;
  /** Health threshold for low health interrupt (hearts) */
  healthLowThreshold: number;
  /** Hunger threshold for food warning (hunger points) */
  hungerWarningThreshold: number;
  /** Whether to interrupt on tool break */
  interruptOnToolBreak: boolean;
  /** Whether to interrupt when no suitable tools remain */
  interruptOnNoTools: boolean;
  /** Cooldown between same-type interrupts (ms) */
  interruptCooldownMs: number;
}

/** Default interruption configuration */
export const DEFAULT_INTERRUPT_CONFIG: InterruptionConfig = {
  damageThreshold: 4, // 2 hearts
  healthLowThreshold: 8, // 4 hearts
  hungerWarningThreshold: 6, // 3 food bars
  interruptOnToolBreak: true,
  interruptOnNoTools: true,
  interruptCooldownMs: 5000,
};
