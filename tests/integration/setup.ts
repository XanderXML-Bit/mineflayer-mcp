/**
 * Integration test setup
 *
 * Provides mock bot factory and test utilities for integration testing.
 * These tests verify tool interactions without a real Minecraft server.
 */

import { vi } from 'vitest';
import { EventEmitter } from 'events';
import type { Bot } from 'mineflayer';
import type { ToolContext, BotManagerContext } from '../../src/tools/base-tool.js';
import {  createToolRegistry } from '../../src/tools/registry.js';
import { defaultConfig } from '../../src/config/defaults.js';
import type { AppConfig } from '../../src/config/schema.js';

/**
 * Create a mock Vec3 position
 */
export function createMockPosition(x = 0, y = 64, z = 0) {
  const pos = {
    x,
    y,
    z,
    floored: () => pos,
    offset: (dx: number, dy: number, dz: number) => createMockPosition(x + dx, y + dy, z + dz),
    clone: () => createMockPosition(x, y, z),
    distanceTo: (other: { x: number; y: number; z: number }) =>
      Math.sqrt((x - other.x) ** 2 + (y - other.y) ** 2 + (z - other.z) ** 2),
    equals: (other: { x: number; y: number; z: number }) =>
      x === other.x && y === other.y && z === other.z,
  };
  return pos;
}

/**
 * Create a mock inventory item
 */
export function createMockItem(name: string, count = 1, slot = 0) {
  return {
    name,
    displayName: name.replace(/_/g, ' '),
    count,
    slot,
    type: 1,
    metadata: 0,
    nbt: null,
    stackSize: 64,
  };
}

/**
 * Create a mock entity
 */
export function createMockEntity(options: {
  type?: string;
  name?: string;
  position?: ReturnType<typeof createMockPosition>;
  health?: number;
} = {}) {
  const position = options.position ?? createMockPosition();
  return {
    type: options.type ?? 'player',
    name: options.name ?? 'Player',
    username: options.name ?? 'Player',
    position,
    velocity: createMockPosition(0, 0, 0),
    health: options.health ?? 20,
    onGround: true,
    isValid: true,
    metadata: [],
  };
}

/**
 * Create a mock Mineflayer bot with all required properties
 */
export function createMockBot(username = 'TestBot'): Bot & EventEmitter {
  const bot = new EventEmitter() as Bot & EventEmitter;

  const position = createMockPosition();
  const inventory = {
    items: vi.fn().mockReturnValue([]),
    slots: {} as Record<number, any>,
    selectedSlot: 0,
  };

  // Core properties
  Object.assign(bot, {
    username,
    version: '1.20.4',
    health: 20,
    food: 20,
    foodSaturation: 5,
    oxygenLevel: 20,
    entity: createMockEntity({ name: username, position }),
    inventory,
    experience: { level: 0, points: 0, progress: 0 },
    time: { timeOfDay: 6000, day: 1, isDay: true, moonPhase: 0, age: 0 },
    game: { gameMode: 0, dimension: 'overworld', hardcore: false, difficulty: 'normal' },
    player: { gamemode: 0 },
  });

  // World methods
  Object.assign(bot, {
    blockAt: vi.fn().mockReturnValue({
      name: 'grass_block',
      displayName: 'Grass Block',
      biome: { name: 'plains' },
      position: createMockPosition(),
    }),
    findBlock: vi.fn().mockReturnValue(null),
    findBlocks: vi.fn().mockReturnValue([]),
    nearestEntity: vi.fn().mockReturnValue(null),
  });

  // Movement plugins
  Object.assign(bot, {
    pathfinder: {
      goto: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
      isMoving: vi.fn().mockReturnValue(false),
      setGoal: vi.fn(),
      setMovements: vi.fn(),
    },
    pvp: {
      attack: vi.fn(),
      stop: vi.fn(),
    },
  });

  // Actions
  Object.assign(bot, {
    chat: vi.fn(),
    look: vi.fn().mockResolvedValue(undefined),
    lookAt: vi.fn().mockResolvedValue(undefined),
    dig: vi.fn().mockResolvedValue(undefined),
    placeBlock: vi.fn().mockResolvedValue(undefined),
    equip: vi.fn().mockResolvedValue(undefined),
    unequip: vi.fn().mockResolvedValue(undefined),
    toss: vi.fn().mockResolvedValue(undefined),
    consume: vi.fn().mockResolvedValue(undefined),
    activateBlock: vi.fn().mockResolvedValue(undefined),
    activateEntity: vi.fn().mockResolvedValue(undefined),
    attack: vi.fn(),
    setControlState: vi.fn(),
    clearControlStates: vi.fn(),
    swingArm: vi.fn(),
    end: vi.fn(),
    quit: vi.fn(),
  });

  // Entity tracking
  Object.assign(bot, {
    players: new Map(),
    entities: {} as Record<number, any>,
  });

  return bot;
}

/**
 * Create a mock bot manager for connection tools
 */
export function createMockBotManager(): BotManagerContext & { bots: Map<string, Bot> } {
  const bots = new Map<string, Bot>();

  return {
    bots,
    create: vi.fn(async (options: { username: string; host?: string; port?: number }) => {
      const bot = createMockBot(options.username);
      bots.set(options.username, bot);
      return bot;
    }),
    destroy: vi.fn(async (username: string) => {
      const had = bots.has(username);
      bots.delete(username);
      return had;
    }),
    destroyAll: vi.fn(async () => {
      bots.clear();
    }),
    has: (username: string) => bots.has(username),
    getUsernames: () => Array.from(bots.keys()),
  };
}

/**
 * Create a test context with optional bot manager
 */
export function createTestContext(options: {
  bots?: Map<string, Bot>;
  botManager?: BotManagerContext;
} = {}): ToolContext {
  const bots = options.bots ?? new Map<string, Bot>();
  const config: AppConfig = defaultConfig;

  return {
    getBotOrThrow: (username?: string) => {
      if (username) {
        const bot = bots.get(username);
        if (!bot) throw new Error(`Bot '${username}' not found`);
        return bot;
      }
      if (bots.size === 0) throw new Error('No bots available');
      if (bots.size > 1 && !username) throw new Error('Multiple bots active, specify username');
      return bots.values().next().value!;
    },
    getAllBots: () => bots,
    config,
    botManager: options.botManager,
  };
}

/**
 * Create a fully configured test environment
 */
export async function createTestEnvironment() {
  const botManager = createMockBotManager();
  const context = createTestContext({
    bots: botManager.bots,
    botManager,
  });
  const registry = createToolRegistry();

  return {
    botManager,
    context,
    registry,
    createBot: async (username: string) => {
      const bot = await botManager.create({ username });
      return bot;
    },
  };
}

/**
 * Wait for a specified time (useful for async operations)
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
