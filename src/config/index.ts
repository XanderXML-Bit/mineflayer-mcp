/**
 * Configuration loader for Minecraft MCP
 *
 * Loads configuration from:
 * 1. Default values
 * 2. YAML config file (if exists)
 * 3. Environment variables
 */

import { readFileSync, existsSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { AppConfigSchema, type AppConfig } from './schema.js';
import { defaultConfig } from './defaults.js';

/** Path to look for config file */
const CONFIG_PATHS = [
  './config/default.config.yaml',
  './config.yaml',
  '../config/default.config.yaml',
];

/**
 * Deep merge two objects, with source values taking precedence
 */
function deepMerge<T extends object>(target: T, source: object): T {
  const result = { ...target } as Record<string, unknown>;

  for (const key of Object.keys(source)) {
    const sourceValue = (source as Record<string, unknown>)[key];
    const targetValue = (target as Record<string, unknown>)[key];

    if (
      sourceValue !== undefined &&
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as object,
        sourceValue as object
      );
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue;
    }
  }

  return result as T;
}

/** Partial environment config that can have nested partial values */
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Load configuration from environment variables
 */
function loadFromEnv(): DeepPartial<AppConfig> {
  const env: DeepPartial<AppConfig> = {};

  // Bot defaults
  const botHost = process.env.MCP_BOT_HOST;
  const botPort = process.env.MCP_BOT_PORT;

  if (botHost || botPort) {
    env.bot = {
      defaults: {
        ...(botHost && { host: botHost }),
        ...(botPort && { port: parseInt(botPort, 10) }),
      },
    };
  }

  // Logging
  const logLevel = process.env.MCP_LOG_LEVEL;
  if (logLevel) {
    env.logging = {
      level: logLevel as 'debug' | 'info' | 'warn' | 'error',
    };
  }

  return env;
}

/**
 * Load configuration from YAML file
 */
function loadFromFile(customPath?: string): Partial<AppConfig> {
  const paths = customPath ? [customPath, ...CONFIG_PATHS] : CONFIG_PATHS;

  for (const configPath of paths) {
    try {
      if (existsSync(configPath)) {
        const content = readFileSync(configPath, 'utf-8');
        const parsed = parseYaml(content);
        return parsed || {};
      }
    } catch {
      // Continue to next path
    }
  }

  return {};
}

/**
 * Configuration loader class
 */
export class ConfigLoader {
  private config: AppConfig;

  constructor(customConfigPath?: string) {
    // Load from file
    const fileConfig = loadFromFile(customConfigPath);

    // Load from environment
    const envConfig = loadFromEnv();

    // Merge: defaults < file < env
    const merged = deepMerge(deepMerge(defaultConfig, fileConfig), envConfig);

    // Validate with Zod
    this.config = AppConfigSchema.parse(merged);
  }

  /**
   * Get the loaded configuration
   */
  getConfig(): AppConfig {
    return this.config;
  }

  /**
   * Get a specific section of the configuration
   */
  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.config[key];
  }

  /**
   * Static method to load configuration
   */
  static load(customPath?: string): AppConfig {
    const loader = new ConfigLoader(customPath);
    return loader.getConfig();
  }
}

// Re-export schema types
export { AppConfigSchema } from './schema.js';
export type { AppConfig } from './schema.js';
export { defaultConfig } from './defaults.js';
