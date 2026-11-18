/**
 * Service State Type Definitions
 *
 * This file defines interfaces for all bot-attached service states.
 * These are used by ManagedBot to properly type the __*State properties.
 *
 * Note: These types mirror the actual service interfaces to avoid circular imports.
 * The service files are the source of truth for their state structures.
 */

import type { Entity } from 'prismarine-entity';
import type { Item } from 'prismarine-item';
import type { EventEmitter } from 'events';
import type { Vec3 } from 'vec3';

// Forward declare types that would cause circular imports
type ProgressState = unknown;
type InterruptionConfig = unknown;

/**
 * Progress tracker state (mirrors services/progress-tracker.ts)
 */
export interface ProgressTrackerState {
  currentTask: ProgressState | null;
  trackingInterval: ReturnType<typeof setInterval> | null;
  emitter: EventEmitter;
}

/**
 * Interruption manager state (mirrors services/interruption-manager.ts)
 */
export interface InterruptionState {
  config: InterruptionConfig;
  emitter: EventEmitter;
  lastInterrupts: Map<string, number>;
  listeners: {
    entityHurt?: (entity: Entity) => void;
    health?: () => void;
    itemDrop?: (item: Item) => void;
  };
  lastEquippedTool: string | null;
  monitorInterval: ReturnType<typeof setInterval> | null;
}

/**
 * Auto-defense state (mirrors services/auto-defense.service.ts)
 */
export interface AutoDefenseState {
  config: {
    enabled: boolean;
    minHealthToFight: number;
    attackRange: number;
    chase: boolean;
    maxChaseDistance: number;
    proactiveDefense: boolean;
    proactiveRadius: number;
  };
  currentTarget: Entity | null;
  isAttacking: boolean;
  lastAttackTime: number;
  listeners: {
    entityHurt?: (entity: Entity) => void;
    physicsTick?: () => void;
  };
}

/**
 * Auto-armor service state (mirrors services/auto-armor.service.ts)
 */
export interface AutoArmorState {
  config: {
    enabled: boolean;
    checkIntervalMs: number;
    preferEnchanted: boolean;
  };
  checkInterval?: ReturnType<typeof setInterval>;
  lastArmorState: string;
}

/**
 * Auto-tool service state
 */
export interface AutoToolState {
  config: {
    enabled: boolean;
    checkIntervalMs: number;
  };
  checkInterval?: ReturnType<typeof setInterval>;
  lastToolState: string;
}

/**
 * Smart eat service state (mirrors services/smart-eat.service.ts)
 */
export interface SmartEatState {
  config: {
    enabled: boolean;
    minHunger: number;
    emergencyHealthThreshold: number;
    safeDistance: number;
    maxFleeDistance: number;
    checkIntervalMs: number;
    hostileAttackRange: number;
  };
  checkInterval?: ReturnType<typeof setInterval>;
  isEating: boolean;
  isFleeing: boolean;
  lastEatTime: number;
}

/**
 * Totem service state (mirrors services/totem.service.ts)
 */
export interface TotemState {
  config: {
    enabled: boolean;
    checkIntervalMs: number;
  };
  checkInterval?: ReturnType<typeof setInterval>;
  hasTotemEquipped: boolean;
}

/**
 * Shield service state (mirrors services/shield.service.ts)
 */
export interface ShieldState {
  config: {
    enabled: boolean;
    autoBlockRange: number;
    counterAttackWindowMs: number;
    blockCooldownMs: number;
    alwaysBlockHealthThreshold: number;
    axeDisableDurationMs: number;
  };
  isBlocking: boolean;
  isDisabled: boolean;
  disabledUntil: number;
  lastBlockTime: number;
  lastDamageTime: number;
  checkInterval?: ReturnType<typeof setInterval>;
  damageListener?: (entity: Entity) => void;
}

/**
 * Bed spawn service state (mirrors services/bed-spawn.service.ts)
 */
export interface BedSpawnState {
  config: {
    enabled: boolean;
    autoSetSpawn: boolean;
    maxSearchRadius: number;
  };
  lastBedPos: { x: number; y: number; z: number } | null;
  spawnSet: boolean;
  lastCheckTime: number;
}

/**
 * MLG water service state (mirrors services/mlg-water.service.ts)
 */
export interface MLGState {
  config: {
    enabled: boolean;
    minFallDistance: number;
    placeHeight: number;
    pickupDelayMs: number;
    autoPickup: boolean;
  };
  checkInterval?: ReturnType<typeof setInterval>;
  isFalling: boolean;
  fallStartY: number;
  lastWaterPos: Vec3 | null;
  isPerformingMLG: boolean;
  previousY: number;
  previousVelocityY: number;
  pickupTimeout?: ReturnType<typeof setTimeout>;
}

/**
 * Trident service state (mirrors services/trident.service.ts)
 */
export interface TridentState {
  config: {
    enabled: boolean;
    autoRiptide: boolean;
    maxRiptideDistance: number;
    riptideChargeMs: number;
  };
  isRiptiding: boolean;
  riptideStartTime: number;
  lastRiptidePos: Vec3 | null;
}

/**
 * Elytra service state (mirrors services/elytra.service.ts)
 */
export interface ElytraState {
  config: {
    enabled: boolean;
    minAltitude: number;
    maxAltitude: number;
    boostIntervalMs: number;
    autoBoost: boolean;
    landingApproachDistance: number;
    minDurabilityPercent: number;
  };
  isFlying: boolean;
  isLanding: boolean;
  flightStartTime: number;
  flightStartPos: Vec3 | null;
  targetPos: Vec3 | null;
  lastBoostTime: number;
  boostCount: number;
}

/**
 * Schematic service state (mirrors services/schematic.service.ts)
 */
export interface SchematicState {
  currentSchematic: unknown | null;
  buildQueue: unknown[];
  isPaused: boolean;
  progress: number;
  errors: string[];
}

/**
 * Ranged combat service state
 */
export interface RangedCombatState {
  config: {
    enabled: boolean;
    preferredWeapon: 'bow' | 'crossbow' | 'trident' | 'auto';
    minChargeTime: number;
    maxRange: number;
  };
  isAiming: boolean;
  target: Entity | null;
  chargeStartTime: number;
}
