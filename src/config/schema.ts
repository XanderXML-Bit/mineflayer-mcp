/**
 * Zod schemas for configuration validation
 */

import { z } from 'zod';

/** Server configuration schema */
export const ServerConfigSchema = z.object({
  name: z.string().default('minecraft-mcp-mineflayer'),
  version: z.string().default('2.0.0'),
});

/** Bot defaults schema */
export const BotDefaultsSchema = z.object({
  host: z.string().default('localhost'),
  port: z.number().int().min(1).max(65535).default(25565),
});

/** Auto-eat configuration schema */
export const AutoEatSchema = z.object({
  enabled: z.boolean().default(true),
  minHunger: z.number().int().min(0).max(20).default(15),
  priority: z.enum(['foodPoints', 'saturation']).default('foodPoints'),
});

/** Self-defense configuration schema */
export const SelfDefenseSchema = z.object({
  enabled: z.boolean().default(true),
  durationMs: z.number().int().min(0).default(10000),
  hostileMobs: z.array(z.string()).default([
    'zombie', 'skeleton', 'creeper', 'spider', 'witch', 'drowned', 'husk', 'stray',
    'pillager', 'vindicator', 'ravager', 'guardian', 'elder_guardian', 'phantom',
    'slime', 'magma_cube', 'hoglin', 'zoglin', 'blaze', 'ghast', 'warden', 'evoker',
  ]),
});

/** Auto-shield configuration schema */
export const AutoShieldSchema = z.object({
  enabled: z.boolean().default(true),
  durationMs: z.number().int().min(0).default(800),
  autoBlockRange: z.number().int().min(1).max(16).default(6),
  counterAttackWindowMs: z.number().int().min(100).max(1000).default(400),
});

/** Totem of Undying configuration schema */
export const TotemSchema = z.object({
  enabled: z.boolean().default(true),
  healthThreshold: z.number().int().min(1).max(20).default(10),
  alwaysEquip: z.boolean().default(false),
});

/** MLG Water bucket configuration schema */
export const MLGWaterSchema = z.object({
  enabled: z.boolean().default(true),
  minFallDistance: z.number().int().min(1).max(10).default(4),
  autoPickup: z.boolean().default(true),
});

/** Elytra flight configuration schema */
export const ElytraSchema = z.object({
  enabled: z.boolean().default(true),
  minAltitude: z.number().int().min(5).max(100).default(20),
  autoBoost: z.boolean().default(true),
  minDurabilityPercent: z.number().min(1).max(50).default(10),
});

/** Navigation configuration schema */
export const NavigationSchema = z.object({
  allowParkour: z.boolean().default(false),
  allowSprinting: z.boolean().default(true),
  canDig: z.boolean().default(true),
  maxDropDown: z.number().int().min(1).max(10).default(3),
  unstuckTimeoutMs: z.number().int().min(1000).default(15000),
});

/** Timeouts configuration schema */
export const TimeoutsSchema = z.object({
  navigation: z.number().int().min(1000).default(60000),
  navigationStall: z.number().int().min(1000).default(15000),
  mining: z.number().int().min(1000).default(120000),
  combat: z.number().int().min(1000).default(60000),
  crafting: z.number().int().min(1000).default(30000),
  smelting: z.number().int().min(1000).default(90000),
  collect: z.number().int().min(1000).default(30000),
  stallDetection: z.number().int().min(1000).default(20000),
});

/** Mining configuration schema */
export const MiningSchema = z.object({
  clusterMining: z.boolean().default(true),
  maxClusterSize: z.number().int().min(1).max(256).default(64),
  requireToolCheck: z.boolean().default(true),
});

/** Farming configuration schema */
export const FarmingSchema = z.object({
  autoReplant: z.boolean().default(true),
  hydrationRadius: z.number().int().min(1).max(8).default(4),
});

/** Logging configuration schema */
export const LoggingSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  format: z.enum(['json', 'text']).default('text'),
});

/** Auto-behaviors configuration schema */
export const AutoBehaviorsSchema = z.object({
  /** Auto-collect items after mining */
  autoCollect: z.object({
    enabled: z.boolean().default(true),
    radius: z.number().min(1).max(10).default(5),
    delayMs: z.number().min(0).default(200),
  }).default({}),

  /** Auto-surface when drowning */
  autoSurface: z.object({
    enabled: z.boolean().default(true),
    oxygenThreshold: z.number().min(0).max(20).default(5),
  }).default({}),

  /** Auto-retreat on low health */
  autoRetreat: z.object({
    enabled: z.boolean().default(true),
    healthThreshold: z.number().min(1).max(20).default(6),
    retreatDistance: z.number().min(5).max(30).default(15),
  }).default({}),

  /** Enhanced stuck detection and recovery */
  stuckRecovery: z.object({
    enabled: z.boolean().default(true),
    timeoutMs: z.number().min(3000).max(60000).default(10000),
    jumpAttempts: z.number().min(1).max(5).default(3),
  }).default({}),

  /** Auto-torch in darkness */
  autoTorch: z.object({
    enabled: z.boolean().default(true),
    lightThreshold: z.number().min(0).max(15).default(7),
    checkIntervalMs: z.number().min(1000).default(5000),
  }).default({}),

  /** Auto-position before block placement */
  autoPosition: z.object({
    enabled: z.boolean().default(true),
  }).default({}),
});

/** Bot configuration schema */
export const BotConfigSchema = z.object({
  defaults: BotDefaultsSchema.default({}),
  autoEat: AutoEatSchema.default({}),
  selfDefense: SelfDefenseSchema.default({}),
  autoShield: AutoShieldSchema.default({}),
  totem: TotemSchema.default({}),
  mlgWater: MLGWaterSchema.default({}),
  elytra: ElytraSchema.default({}),
});

/** Complete application configuration schema */
export const AppConfigSchema = z.object({
  server: ServerConfigSchema.default({}),
  bot: BotConfigSchema.default({}),
  navigation: NavigationSchema.default({}),
  timeouts: TimeoutsSchema.default({}),
  mining: MiningSchema.default({}),
  farming: FarmingSchema.default({}),
  logging: LoggingSchema.default({}),
  autoBehaviors: AutoBehaviorsSchema.default({}),
});

/** Inferred types from schemas */
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type BotDefaults = z.infer<typeof BotDefaultsSchema>;
export type AutoEatConfig = z.infer<typeof AutoEatSchema>;
export type SelfDefenseConfig = z.infer<typeof SelfDefenseSchema>;
export type AutoShieldConfig = z.infer<typeof AutoShieldSchema>;
export type TotemConfig = z.infer<typeof TotemSchema>;
export type MLGWaterConfig = z.infer<typeof MLGWaterSchema>;
export type ElytraConfig = z.infer<typeof ElytraSchema>;
export type NavigationConfig = z.infer<typeof NavigationSchema>;
export type TimeoutsConfig = z.infer<typeof TimeoutsSchema>;
export type MiningConfig = z.infer<typeof MiningSchema>;
export type FarmingConfig = z.infer<typeof FarmingSchema>;
export type LoggingConfig = z.infer<typeof LoggingSchema>;
export type AutoBehaviorsConfig = z.infer<typeof AutoBehaviorsSchema>;
export type BotConfig = z.infer<typeof BotConfigSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;
