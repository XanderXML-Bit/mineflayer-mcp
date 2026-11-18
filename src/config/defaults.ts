/**
 * Default configuration values for Minecraft MCP
 */

import type { AppConfig } from './schema.js';

/**
 * Default configuration that gets merged with user config.
 * All values here match the Zod schema defaults.
 */
export const defaultConfig: AppConfig = {
  server: {
    name: 'minecraft-mcp-mineflayer',
    version: '2.0.0',
  },
  bot: {
    defaults: {
      host: 'localhost',
      port: 25565,
    },
    autoEat: {
      enabled: true,
      minHunger: 15,
      priority: 'foodPoints',
    },
    selfDefense: {
      enabled: true,
      durationMs: 10000,
      hostileMobs: [
        'zombie', 'skeleton', 'creeper', 'spider', 'witch', 'drowned', 'husk', 'stray',
        'pillager', 'vindicator', 'ravager', 'guardian', 'elder_guardian', 'phantom',
        'slime', 'magma_cube', 'hoglin', 'zoglin', 'blaze', 'ghast', 'warden', 'evoker',
      ],
    },
    autoShield: {
      enabled: true,
      durationMs: 800,
      autoBlockRange: 6,
      counterAttackWindowMs: 400,
    },
    totem: {
      enabled: true,
      healthThreshold: 10,
      alwaysEquip: false,
    },
    mlgWater: {
      enabled: true,
      minFallDistance: 4,
      autoPickup: true,
    },
    elytra: {
      enabled: true,
      minAltitude: 20,
      autoBoost: true,
      minDurabilityPercent: 10,
    },
  },
  navigation: {
    allowParkour: false,
    allowSprinting: true,
    canDig: true,
    maxDropDown: 3,
    unstuckTimeoutMs: 15000,
  },
  timeouts: {
    navigation: 60000,
    navigationStall: 15000,
    mining: 120000,
    combat: 60000,
    crafting: 30000,
    smelting: 90000,
    collect: 30000,
    stallDetection: 20000,
  },
  mining: {
    clusterMining: true,
    maxClusterSize: 64,
    requireToolCheck: true,
  },
  farming: {
    autoReplant: true,
    hydrationRadius: 4,
  },
  logging: {
    level: 'info',
    format: 'text',
  },
  autoBehaviors: {
    autoCollect: {
      enabled: true,
      radius: 5,
      delayMs: 200,
    },
    autoSurface: {
      enabled: true,
      oxygenThreshold: 5,
    },
    autoRetreat: {
      enabled: true,
      healthThreshold: 6,
      retreatDistance: 15,
    },
    stuckRecovery: {
      enabled: true,
      timeoutMs: 10000,
      jumpAttempts: 3,
    },
    autoTorch: {
      enabled: true,
      lightThreshold: 7,
      checkIntervalMs: 5000,
    },
    autoPosition: {
      enabled: true,
    },
  },
};
