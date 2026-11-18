/**
 * Bot status tracking service
 */

import type { Bot } from 'mineflayer';
import type { Vec3 } from 'vec3';
import type {
  ManagedBot,
  StatusState,
  BotStatus,
  StatusDelta,
  EffectInfo,
  InventoryStatus,
  EnvironmentInfo,
  ChatMessage,
} from '../types/index.js';
import { logger } from '../utils/logger.js';

const log = logger.child('status');

/** Maximum chat log size */
const MAX_CHAT_LOG = 100;

/**
 * Initialize status state for a bot
 */
export function initializeStatusState(bot: Bot): StatusState {
  const managed = bot as ManagedBot;

  managed.__status = {
    lastDamage: null,
    lastBroken: null,
    lastDefense: null,
    lastDeath: null,
    lastHungerWarning: null,
    effects: new Map(),
  };

  managed.__chatLog = [];
  managed.__lastDeathPos = null;

  return managed.__status;
}

/**
 * Get status state for a bot
 */
export function getStatusState(bot: Bot): StatusState {
  const managed = bot as ManagedBot;
  if (!managed.__status) {
    return initializeStatusState(bot);
  }
  return managed.__status;
}

/**
 * Record damage event
 */
export function recordDamage(bot: Bot, from: string, amount: number): void {
  const state = getStatusState(bot);
  state.lastDamage = {
    from,
    amount,
    timestamp: Date.now(),
  };
}

/**
 * Record equipment break event
 */
export function recordBrokenItem(bot: Bot, name: string, slot: string): void {
  const state = getStatusState(bot);
  state.lastBroken = {
    name,
    slot,
    timestamp: Date.now(),
  };
}

/**
 * Record defense event
 */
export function recordDefense(bot: Bot, target: string): void {
  const state = getStatusState(bot);
  state.lastDefense = {
    target,
    timestamp: Date.now(),
  };
}

/**
 * Record death event
 */
export function recordDeath(bot: Bot, cause: string): void {
  const managed = bot as ManagedBot;
  const state = getStatusState(bot);

  // Store death position
  const deathPos = bot.entity?.position?.clone() ?? null;
  managed.__lastDeathPos = deathPos;

  state.lastDeath = {
    position: deathPos,
    cause,
    timestamp: Date.now(),
  };
}

/**
 * Record hunger warning
 */
export function recordHungerWarning(bot: Bot, level: number): void {
  const state = getStatusState(bot);
  state.lastHungerWarning = {
    level,
    timestamp: Date.now(),
  };
}

/**
 * Record effect
 */
export function recordEffect(bot: Bot, effect: { id: number; amplifier: number; duration: number }): void {
  const state = getStatusState(bot);
  const mcData = (bot as ManagedBot).__mcdata;

  const effectData = mcData?.effects?.[effect.id];
  const name = effectData?.name || `effect_${effect.id}`;

  state.effects.set(effect.id, {
    id: effect.id,
    name,
    amplifier: effect.amplifier,
    duration: effect.duration,
  });
}

/**
 * Remove effect
 */
export function removeEffect(bot: Bot, effectId: number): void {
  const state = getStatusState(bot);
  state.effects.delete(effectId);
}

/**
 * Record chat message
 */
export function recordChatMessage(bot: Bot, username: string, message: string): void {
  const managed = bot as ManagedBot;
  if (!managed.__chatLog) managed.__chatLog = [];

  managed.__chatLog.push({
    username,
    message,
    timestamp: Date.now(),
  });

  // Trim chat log
  while (managed.__chatLog.length > MAX_CHAT_LOG) {
    managed.__chatLog.shift();
  }
}

/**
 * Get recent chat messages
 */
export function getChatLog(bot: Bot, count?: number): ChatMessage[] {
  const managed = bot as ManagedBot;
  if (!managed.__chatLog) return [];

  if (count) {
    return managed.__chatLog.slice(-count);
  }
  return [...managed.__chatLog];
}

/**
 * Get last death position
 */
export function getLastDeathPosition(bot: Bot): Vec3 | null {
  return (bot as ManagedBot).__lastDeathPos ?? null;
}

/**
 * Get last damage source
 */
export function getLastDamageSource(bot: Bot): string {
  const state = getStatusState(bot);
  return state.lastDamage?.from ?? 'unknown';
}

/**
 * Get inventory status
 */
export function getInventoryStatus(bot: Bot): InventoryStatus {
  const items = bot.inventory.items();
  const totalSlots = 36; // Main inventory slots
  const usedSlots = items.length;
  const emptySlots = totalSlots - usedSlots;

  return {
    usedSlots,
    emptySlots,
    totalSlots,
    full: emptySlots === 0,
  };
}

/**
 * Get environment info
 */
export function getEnvironmentInfo(bot: Bot): EnvironmentInfo {
  const pos = bot.entity.position;
  const blockAtFeet = bot.blockAt(pos.floored());
  const isInWater = blockAtFeet?.name?.includes('water') || false;
  const headPos = pos.offset(0, 1, 0).floored();
  const blockAtHead = bot.blockAt(headPos);
  const isUnderwater = blockAtHead?.name?.includes('water') || false;

  // Determine area type
  let area: 'outside' | 'underground' | 'in_water' | 'underwater' = 'outside';
  if (isUnderwater) {
    area = 'underwater';
  } else if (isInWater) {
    area = 'in_water';
  } else if (pos.y < 50) {
    // Simple heuristic for underground
    const blockWithLight = blockAtFeet as { skyLight?: number } | null;
    const skyLight = blockWithLight?.skyLight ?? 15;
    if (skyLight < 5) area = 'underground';
  }

  // Get biome
  let biome = 'unknown';
  try {
    const biomeData = bot.blockAt(pos.floored())?.biome;
    if (typeof biomeData === 'object' && biomeData !== null) {
      const biomeObj = biomeData as { name?: string };
      biome = biomeObj.name || 'unknown';
    } else {
      biome = String(biomeData || 'unknown');
    }
  } catch {
    // Ignore biome parsing errors
  }

  return {
    position: { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) },
    timeOfDay: bot.time.timeOfDay,
    isDay: bot.time.timeOfDay < 12000,
    biome,
    area,
    isInWater,
    isOnGround: bot.entity.onGround,
    oxygenLevel: bot.oxygenLevel ?? 20,
    isDrowning: (bot.oxygenLevel ?? 20) < 5,
  };
}

/**
 * Get complete bot status
 */
export function getBotStatus(bot: Bot): BotStatus {
  const state = getStatusState(bot);
  const env = getEnvironmentInfo(bot);
  const inventory = getInventoryStatus(bot);

  // Convert effects map to array
  const effects: EffectInfo[] = Array.from(state.effects.values());

  // One-shot events (clear after reading)
  const lastDamage = state.lastDamage;
  const lastBroken = state.lastBroken;
  const lastDefense = state.lastDefense;
  const lastDeath = state.lastDeath;
  const lastHungerWarning = state.lastHungerWarning;

  // Clear one-shot events
  state.lastDamage = null;
  state.lastBroken = null;
  state.lastDefense = null;
  state.lastDeath = null;
  state.lastHungerWarning = null;

  // Inventory full warning
  let invFullWarning: { timestamp: number } | null = null;
  if (inventory.full) {
    invFullWarning = { timestamp: Date.now() };
  }

  return {
    health: bot.health,
    food: bot.food,
    saturation: bot.foodSaturation ?? 0,
    lastDamage,
    lastBroken,
    lastDefense,
    lastDeath,
    lastHungerWarning,
    inventory,
    invFullWarning,
    effects,
    env,
  };
}

/**
 * Calculate status delta between before and after
 */
export function calculateStatusDelta(before: BotStatus, after: BotStatus): StatusDelta {
  return {
    healthDelta: after.health - before.health,
    foodDelta: after.food - before.food,
    lastDamage: after.lastDamage,
  };
}

/**
 * Status service class
 */
export class StatusService {
  /**
   * Initialize status tracking for a bot
   */
  initialize(bot: Bot): void {
    initializeStatusState(bot);
    this.attachListeners(bot);
  }

  /**
   * Attach event listeners for status tracking
   */
  private attachListeners(bot: Bot): void {
    // Health changes
    bot.on('health', () => {
      const state = getStatusState(bot);
      if (bot.food < 6 && !state.lastHungerWarning) {
        recordHungerWarning(bot, bot.food);
      }
    });

    // Effects
    interface EffectData { id: number; amplifier: number; duration: number }
    bot.on('entityEffect', (entity: unknown, effect: EffectData) => {
      if (entity === bot.entity) {
        recordEffect(bot, effect);
      }
    });

    bot.on('entityEffectEnd', (entity: unknown, effect: EffectData) => {
      if (entity === bot.entity) {
        removeEffect(bot, effect.id);
      }
    });

    // Chat
    bot.on('chat', (username: string, message: string) => {
      recordChatMessage(bot, username, message);
    });

    // Death
    bot.on('death', () => {
      // Try to determine cause from recent chat
      const chatLog = getChatLog(bot, 3);
      let cause = 'unknown';

      for (const msg of chatLog.reverse()) {
        if (msg.message.includes('slain') || msg.message.includes('killed')) {
          cause = 'slain';
          break;
        } else if (msg.message.includes('fell')) {
          cause = 'fall';
          break;
        } else if (msg.message.includes('drowned')) {
          cause = 'drowned';
          break;
        } else if (msg.message.includes('burned') || msg.message.includes('fire')) {
          cause = 'fire';
          break;
        } else if (msg.message.includes('blew up') || msg.message.includes('explosion')) {
          cause = 'explosion';
          break;
        }
      }

      recordDeath(bot, cause);
    });

    log.debug('Status listeners attached');
  }

  /**
   * Get current status
   */
  getStatus(bot: Bot): BotStatus {
    return getBotStatus(bot);
  }

  /**
   * Get chat log
   */
  getChatLog(bot: Bot, count?: number): ChatMessage[] {
    return getChatLog(bot, count);
  }

  /**
   * Get last death position
   */
  getLastDeathPosition(bot: Bot): Vec3 | null {
    return getLastDeathPosition(bot);
  }
}

/**
 * Create a status service
 */
export function createStatusService(): StatusService {
  return new StatusService();
}
