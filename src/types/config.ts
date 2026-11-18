/**
 * Configuration type definitions for Minecraft MCP
 */

/** Server configuration */
export interface ServerConfig {
  name: string;
  version: string;
}

/** Bot default settings */
export interface BotDefaultsConfig {
  host: string;
  port: number;
}

/** Auto-eat configuration */
export interface AutoEatConfig {
  enabled: boolean;
  minHunger: number;
  priority: 'foodPoints' | 'saturation';
}

/** Self-defense configuration */
export interface SelfDefenseConfig {
  enabled: boolean;
  durationMs: number;
  hostileMobs: string[];
}

/** Auto-shield configuration */
export interface AutoShieldConfig {
  enabled: boolean;
  durationMs: number;
}

/** Navigation configuration */
export interface NavigationConfig {
  allowParkour: boolean;
  allowSprinting: boolean;
  canDig: boolean;
  maxDropDown: number;
  unstuckTimeoutMs: number;
}

/** Timeout configuration */
export interface TimeoutsConfig {
  navigation: number;
  navigationStall: number;
  mining: number;
  combat: number;
  crafting: number;
  smelting: number;
  collect: number;
  stallDetection: number;
}

/** Mining configuration */
export interface MiningConfig {
  clusterMining: boolean;
  maxClusterSize: number;
  requireToolCheck: boolean;
}

/** Farming configuration */
export interface FarmingConfig {
  autoReplant: boolean;
  hydrationRadius: number;
}

/** Logging configuration */
export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  format: 'json' | 'text';
}

/** Bot behavior configuration */
export interface BotConfig {
  defaults: BotDefaultsConfig;
  autoEat: AutoEatConfig;
  selfDefense: SelfDefenseConfig;
  autoShield: AutoShieldConfig;
}

/** Complete application configuration */
export interface AppConfig {
  server: ServerConfig;
  bot: BotConfig;
  navigation: NavigationConfig;
  timeouts: TimeoutsConfig;
  mining: MiningConfig;
  farming: FarmingConfig;
  logging: LoggingConfig;
}
