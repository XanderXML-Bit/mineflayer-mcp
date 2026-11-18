/**
 * Event Service
 *
 * Tracks and buffers bot events for push notifications in tool responses.
 * Events are accumulated between tool calls and cleared after being returned.
 */

import type { Bot } from 'mineflayer';
import type { Block } from 'prismarine-block';
import type { Entity } from 'prismarine-entity';
import type { ManagedBot, BotEventType, BotEvent, EventBufferState } from '../types/bot.js';
import type { AppConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';

/** Entity with optional username (for players) */
type EntityWithUsername = Entity & { username?: string };

/** Item entity with metadata */
type ItemEntity = Entity & {
  metadata?: Array<{ itemId?: string }>;
};

const log = logger.child('event-service');

// Re-export types from canonical location for convenience
export type { BotEventType, BotEvent, EventBufferState };

/** Maximum events to buffer (prevent memory issues) */
const MAX_EVENT_BUFFER = 100;

/** Hostile mob names for nearby detection */
const HOSTILE_MOBS_LIST = [
  'zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch',
  'slime', 'phantom', 'drowned', 'husk', 'stray', 'blaze',
  'ghast', 'magma_cube', 'wither_skeleton', 'pillager', 'vindicator',
  'ravager', 'vex', 'evoker', 'hoglin', 'piglin_brute', 'warden',
];
/** Set for O(1) exact match lookup */
const HOSTILE_MOBS_SET = new Set(HOSTILE_MOBS_LIST);

/**
 * Initialize event buffer on bot
 */
export function initializeEventBuffer(bot: Bot): void {
  const managed = bot as ManagedBot;
  if (!managed.__eventBuffer) {
    managed.__eventBuffer = {
      buffer: [],
      lastFlushedAt: Date.now(),
      lastTimePhase: 'day',
    };
  }
}

/**
 * Get event buffer state, initializing if needed
 */
function getEventBuffer(bot: Bot): EventBufferState {
  const managed = bot as ManagedBot;
  if (!managed.__eventBuffer) {
    initializeEventBuffer(bot);
  }
  // After initialization, __eventBuffer is guaranteed to exist
  return managed.__eventBuffer as EventBufferState;
}

/**
 * Push an event to the bot's event buffer
 */
export function pushEvent(
  bot: Bot,
  type: BotEventType,
  data: Record<string, unknown> = {}
): void {
  const state = getEventBuffer(bot);

  const event: BotEvent = {
    type,
    timestamp: Date.now(),
    data,
  };

  state.buffer.push(event);

  // Trim buffer if too large
  if (state.buffer.length > MAX_EVENT_BUFFER) {
    state.buffer = state.buffer.slice(-MAX_EVENT_BUFFER);
  }

  log.debug('Event pushed', { type, data });
}

/**
 * Get and clear all events since last flush
 */
export function getAndClearEvents(bot: Bot): BotEvent[] {
  const state = getEventBuffer(bot);
  const events = [...state.buffer];
  state.buffer = [];
  state.lastFlushedAt = Date.now();
  return events;
}

/**
 * Peek at events without clearing (for getEvents tool with clear=false)
 */
export function peekEvents(bot: Bot, since?: number): BotEvent[] {
  const state = getEventBuffer(bot);
  if (since) {
    return state.buffer.filter((e) => e.timestamp >= since);
  }
  return [...state.buffer];
}

/**
 * Check if entity is a hostile mob
 */
function isHostileMob(entity: Entity): boolean {
  if (!entity?.name) return false;
  const name = entity.name.toLowerCase();
  // O(1) exact match first
  if (HOSTILE_MOBS_SET.has(name)) return true;
  // Fall back to partial match for variants (e.g., "zombie_villager" contains "zombie")
  return HOSTILE_MOBS_LIST.some((hostile) => name.includes(hostile));
}

/**
 * Attach event listeners to track bot events
 * Stores listener references for proper cleanup
 */
export function attachEventListeners(bot: Bot, _config: AppConfig): void {
  const managed = bot as ManagedBot;
  initializeEventBuffer(bot);
  const state = getEventBuffer(bot);

  // Check if already attached to prevent duplicates
  if (state.listeners) {
    log.debug('Event listeners already attached', { username: bot.username });
    return;
  }

  log.debug('Attaching event listeners', { username: bot.username });

  // Create and store listener references for cleanup
  state.listeners = {};

  // Spawned event (one-time, no need to store)
  bot.once('spawn', () => {
    pushEvent(bot, 'spawned', {
      position: bot.entity?.position
        ? { x: bot.entity.position.x, y: bot.entity.position.y, z: bot.entity.position.z }
        : null,
    });
  });

  // Damage taken
  state.listeners.entityHurt = (entity: Entity) => {
    if (entity === bot.entity) {
      const nearbyEntities = Object.values(bot.entities)
        .filter((e) => e && e !== bot.entity && e.position)
        .filter((e) => e.position.distanceTo(bot.entity.position) < 6);

      const attacker = nearbyEntities.find((e) => isHostileMob(e) || e.type === 'player');

      const attackerWithUser = attacker as EntityWithUsername | undefined;
      pushEvent(bot, 'damage_taken', {
        health: bot.health,
        from: attacker?.name || attackerWithUser?.username || 'unknown',
      });

      if (bot.health < 8) {
        pushEvent(bot, 'health_low', { health: bot.health });
      }
    }
  };
  bot.on('entityHurt', state.listeners.entityHurt);

  // Player chat
  state.listeners.chat = (username: string, message: string) => {
    if (username !== bot.username) {
      pushEvent(bot, 'player_chat', { username, message });
    }
  };
  bot.on('chat', state.listeners.chat);

  // Player whisper (private message). Mineflayer emits 'whisper' separately
  // from 'chat'; surfaced to agents as recentChat entries with isWhisper: true.
  state.listeners.whisper = (username: string, message: string) => {
    if (username !== bot.username) {
      pushEvent(bot, 'player_whisper', { username, message });
    }
  };
  bot.on('whisper', state.listeners.whisper);

  // Death
  state.listeners.death = () => {
    const pos = managed.__lastDeathPos || bot.entity?.position;
    pushEvent(bot, 'death', {
      position: pos ? { x: pos.x, y: pos.y, z: pos.z } : null,
    });
  };
  bot.on('death', state.listeners.death);

  // Item pickup
  state.listeners.playerCollect = (collector: Entity, collected: Entity) => {
    if (collector === bot.entity) {
      const itemEntity = collected as ItemEntity;
      pushEvent(bot, 'item_pickup', {
        item: itemEntity?.metadata?.[8]?.itemId || itemEntity?.name || 'unknown',
      });
    }
  };
  bot.on('playerCollect', state.listeners.playerCollect);

  // Day/night change
  state.listeners.time = () => {
    const isDay = bot.time.timeOfDay < 12000;
    const phase = isDay ? 'day' : 'night';

    if (phase !== state.lastTimePhase) {
      state.lastTimePhase = phase;
      pushEvent(bot, 'day_night', {
        phase,
        timeOfDay: bot.time.timeOfDay,
      });
    }
  };
  bot.on('time', state.listeners.time);

  // Health changes
  state.listeners.health = () => {
    if (bot.health < 8 && bot.health > 0) {
      const recentHealthLow = state.buffer
        .filter((e) => e.type === 'health_low')
        .some((e) => Date.now() - e.timestamp < 5000);

      if (!recentHealthLow) {
        pushEvent(bot, 'health_low', { health: bot.health });
      }
    }

    if (bot.food < 8) {
      const recentHungerLow = state.buffer
        .filter((e) => e.type === 'hunger_low')
        .some((e) => Date.now() - e.timestamp < 10000);

      if (!recentHungerLow) {
        pushEvent(bot, 'hunger_low', { food: bot.food });
      }
    }
  };
  bot.on('health', state.listeners.health);

  // Block broken
  state.listeners.diggingCompleted = (block: Block) => {
    pushEvent(bot, 'block_broken', {
      block: block.name,
      position: { x: block.position.x, y: block.position.y, z: block.position.z },
    });
  };
  bot.on('diggingCompleted', state.listeners.diggingCompleted);

  // Periodic mob scan (every 5 seconds) - optimized single-pass
  state.mobScanInterval = setInterval(() => {
    if (!bot.entity?.position) return;

    const botPos = bot.entity.position;
    const nearbyHostiles: Array<{ name: string; distance: number }> = [];

    for (const e of Object.values(bot.entities)) {
      if (!e || !e.position || !isHostileMob(e)) continue;

      const dist = e.position.distanceTo(botPos);
      if (dist < 16) {
        nearbyHostiles.push({
          name: e.name || 'unknown',
          distance: Math.round(dist),
        });
      }
    }

    if (nearbyHostiles.length > 0) {
      const recentMobNearby = state.buffer
        .filter((e) => e.type === 'mob_nearby')
        .some((e) => Date.now() - e.timestamp < 10000);

      if (!recentMobNearby) {
        pushEvent(bot, 'mob_nearby', {
          count: nearbyHostiles.length,
          mobs: nearbyHostiles.slice(0, 5),
        });
      }
    }
  }, 5000);

  // Note: Auto-eat and armor events are now handled by our own services:
  // - smart-eat.service.ts pushes auto_eat_started/auto_eat_finished events
  // - auto-armor.service.ts pushes armor_equipped events

  // Cleanup on bot end
  state.listeners.end = () => {
    detachEventListeners(bot);
  };
  bot.on('end', state.listeners.end);

  log.info('Event listeners attached', { username: bot.username });
}

/**
 * Detach event listeners and cleanup
 * Properly removes all stored listener references
 */
export function detachEventListeners(bot: Bot): void {
  const managed = bot as ManagedBot;
  const state = managed.__eventBuffer;

  if (!state) return;

  // Clear mob scan interval
  if (state.mobScanInterval) {
    clearInterval(state.mobScanInterval);
    state.mobScanInterval = undefined;
  }

  // Remove all stored listeners
  if (state.listeners) {
    const { listeners } = state;

    if (listeners.entityHurt) {
      bot.removeListener('entityHurt', listeners.entityHurt);
    }
    if (listeners.chat) {
      bot.removeListener('chat', listeners.chat);
    }
    if (listeners.whisper) {
      bot.removeListener('whisper', listeners.whisper);
    }
    if (listeners.death) {
      bot.removeListener('death', listeners.death);
    }
    if (listeners.playerCollect) {
      bot.removeListener('playerCollect', listeners.playerCollect as (collector: Entity, collected: Entity) => void);
    }
    if (listeners.time) {
      bot.removeListener('time', listeners.time);
    }
    if (listeners.health) {
      bot.removeListener('health', listeners.health);
    }
    if (listeners.diggingCompleted) {
      bot.removeListener('diggingCompleted', listeners.diggingCompleted);
    }
    if (listeners.end) {
      bot.removeListener('end', listeners.end);
    }

    // Note: Auto-eat and armor listeners are cleaned up by their respective services

    // Clear listeners reference
    state.listeners = undefined;
  }

  // Clear buffer
  state.buffer = [];

  log.debug('Event listeners detached', { username: bot.username });
}
