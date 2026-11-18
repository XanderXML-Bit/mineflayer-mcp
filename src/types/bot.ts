/**
 * Extended bot type definitions for Minecraft MCP
 */

import type { Bot } from 'mineflayer';
import type { Entity } from 'prismarine-entity';
import type { Block } from 'prismarine-block';
import type { Vec3 } from 'vec3';
import type {
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

/** Minecraft data from minecraft-data package (IndexedData) */
export interface MinecraftData {
  blocksByName: Record<string, { id: number; name: string }>;
  itemsByName: Record<string, { id: number; name: string }>;
  entitiesByName: Record<string, { id: number; name: string }>;
  effects?: Record<number, { id: number; name: string }>;
  biomes?: Record<string | number, { id: number; name: string }>;
  recipes?: Record<string, unknown>;
}

/** Task state for managing concurrent operations */
export interface TaskState {
  running: boolean;
  abort: (() => void) | null;
}

/** Damage information from attacks */
export interface DamageInfo {
  from: string;
  amount: number;
  timestamp: number;
}

/** Information about broken equipment */
export interface BrokenItemInfo {
  name: string;
  slot: string;
  timestamp: number;
}

/** Defense action information */
export interface DefenseInfo {
  target: string;
  timestamp: number;
}

/** Death information */
export interface DeathInfo {
  position: Vec3;
  cause: string;
  timestamp: number;
}

/** Hunger warning information */
export interface HungerWarning {
  level: number;
  timestamp: number;
}

/** Active effect information */
export interface EffectInfo {
  id: number;
  name: string;
  amplifier: number;
  duration: number;
}

/** Chat message record */
export interface ChatMessage {
  username: string;
  message: string;
  timestamp: number;
}

/** Event types that can be pushed to the AI */
export type BotEventType =
  | 'damage_taken'
  | 'mob_nearby'
  | 'player_chat'
  | 'player_whisper'
  | 'death'
  | 'item_pickup'
  | 'day_night'
  | 'health_low'
  | 'hunger_low'
  | 'block_broken'
  | 'combat_started'
  | 'combat_ended'
  | 'spawned'
  // Auto-action events - report plugin activity to agent
  | 'auto_eat_started'
  | 'auto_eat_finished'
  | 'armor_equipped'
  | 'tool_switched'
  | 'auto_attack_started'
  | 'auto_attack_ended';

/** Bot event pushed to AI in tool responses */
export interface BotEvent {
  type: BotEventType;
  timestamp: number;
  data: Record<string, unknown>;
}

/** Event buffer state attached to bot */
export interface EventBufferState {
  buffer: BotEvent[];
  lastFlushedAt: number;
  lastTimePhase: 'day' | 'night';
  mobScanInterval?: ReturnType<typeof setInterval>;
  /** Stored listener references for cleanup */
  listeners?: {
    entityHurt?: (entity: Entity) => void;
    chat?: (username: string, message: string) => void;
    whisper?: (username: string, message: string) => void;
    death?: () => void;
    playerCollect?: (collector: Entity, collected: Entity) => void;
    time?: () => void;
    health?: () => void;
    diggingCompleted?: (block: Block) => void;
    end?: () => void;
  };
}

/** Bot status state for tracking events */
export interface StatusState {
  lastDamage: DamageInfo | null;
  lastBroken: BrokenItemInfo | null;
  lastDefense: DefenseInfo | null;
  lastDeath: DeathInfo | null;
  lastHungerWarning: HungerWarning | null;
  effects: Map<number, EffectInfo>;
}

/** Inventory status summary */
export interface InventoryStatus {
  usedSlots: number;
  emptySlots: number;
  totalSlots: number;
  full: boolean;
}

/** Equipment durability information */
export interface DurabilityInfo {
  max: number;
  used: number;
  remaining: number;
  percentage: number;
}

/** Environment information */
export interface EnvironmentInfo {
  position: { x: number; y: number; z: number };
  timeOfDay: number;
  isDay: boolean;
  biome: string;
  area: 'outside' | 'underground' | 'in_water' | 'underwater';
  isInWater: boolean;
  isOnGround: boolean;
  oxygenLevel: number;
  isDrowning: boolean;
}

/** Complete bot status */
export interface BotStatus {
  health: number;
  food: number;
  saturation: number;
  lastDamage: DamageInfo | null;
  lastBroken: BrokenItemInfo | null;
  lastDefense: DefenseInfo | null;
  lastDeath: DeathInfo | null;
  lastHungerWarning: HungerWarning | null;
  inventory: InventoryStatus;
  invFullWarning: { timestamp: number } | null;
  effects: EffectInfo[];
  env: EnvironmentInfo;
}

/** Status delta for tracking changes */
export interface StatusDelta {
  healthDelta: number;
  foodDelta: number;
  lastDamage: DamageInfo | null;
}

/** Extended bot instance with MCP-specific properties */
export interface ManagedBot extends Bot {
  /** Minecraft data for the current version */
  __mcdata: MinecraftData;
  /** Task state for mutex management */
  __task: TaskState;
  /** Status tracking state */
  __status: StatusState;
  /** Chat log buffer */
  __chatLog: ChatMessage[];
  /** Auto-eat suspension counter */
  __autoEatSuspended: number;
  /** Defense active flag */
  __defenseActive: boolean;
  /** Last death position */
  __lastDeathPos: Vec3 | null;
  /** Event buffer for AI notifications */
  __eventBuffer?: EventBufferState;
  /** Active intervals for cleanup on destroy */
  __intervals?: ReturnType<typeof setInterval>[];
  /** Progress tracker state */
  __progressTracker?: ProgressTrackerState;
  /** Progress tracking listeners */
  __progressListeners?: {
    diggingCompleted?: (block: Block) => void;
    playerCollect?: (collector: Entity, collected: Entity) => void;
  };
  /** Interruption manager state */
  __interruptionManager?: InterruptionState;
  /** Auto-defense state */
  __autoDefenseState?: AutoDefenseState;

  // New built-in service states (replacing external plugins)
  /** Auto-armor service state */
  __autoArmorState?: AutoArmorState;
  /** Auto-tool service state */
  __autoToolState?: AutoToolState;
  /** Smart eat service state */
  __smartEatState?: SmartEatState;
  /** Totem service state */
  __totemState?: TotemState;
  /** Shield service state */
  __shieldState?: ShieldState;
  /** Bed spawn service state */
  __bedSpawnState?: BedSpawnState;
  /** MLG water service state */
  __mlgState?: MLGState;
  /** Trident service state */
  __tridentState?: TridentState;
  /** Elytra service state */
  __elytraState?: ElytraState;
  /** Schematic service state */
  __schematicState?: SchematicState;
  /** Ranged combat service state */
  __rangedCombatState?: RangedCombatState;

  // Auto-behavior flags (used by bot-factory auto-behaviors)
  /** Auto-collect active flag */
  __collecting?: boolean;
  /** Auto-surface active flag */
  __surfacing?: boolean;
  /** Auto-retreat active flag */
  __retreating?: boolean;
}

/** Options for creating a new bot */
export interface CreateBotOptions {
  username: string;
  host?: string;
  port?: number;
  version?: string;
}
