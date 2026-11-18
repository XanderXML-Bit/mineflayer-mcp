/**
 * Interruption Manager Service
 *
 * Monitors conditions that should interrupt running tasks:
 * - Bot attacked (critical - mandatory interrupt)
 * - Health low (high - interrupt risky tasks)
 * - Tool broken (high - mandatory interrupt)
 * - No suitable tools (high - mandatory interrupt)
 * - Food low (advisory - warning only)
 */

import type { Bot } from 'mineflayer';
import type { Entity } from 'prismarine-entity';
import type { Item } from 'prismarine-item';
import type { ManagedBot } from '../types/bot.js';
import type {
  InterruptCondition,
  InterruptCheckResult,
  InterruptPriority,
  InterruptionConfig,
} from '../types/progress.js';
import { DEFAULT_INTERRUPT_CONFIG } from '../types/progress.js';
import { logger } from '../utils/logger.js';
import { EventEmitter } from 'events';

const log = logger.child('interruption-manager');

/** Interruption manager state attached to bot */
export interface InterruptionState {
  config: InterruptionConfig;
  emitter: EventEmitter;
  lastInterrupts: Map<string, number>; // condition name -> timestamp
  listeners: {
    entityHurt?: (entity: Entity) => void;
    health?: () => void;
    itemDrop?: (item: Item) => void;
  };
  lastEquippedTool: string | null;
  monitorInterval: ReturnType<typeof setInterval> | null;
}

/**
 * Get or initialize interruption state on bot
 */
function getInterruptionState(bot: Bot): InterruptionState {
  const managed = bot as ManagedBot;
  if (!managed.__interruptionManager) {
    managed.__interruptionManager = {
      config: { ...DEFAULT_INTERRUPT_CONFIG },
      emitter: new EventEmitter(),
      lastInterrupts: new Map(),
      listeners: {},
      lastEquippedTool: null,
      monitorInterval: null,
    };
  }
  return managed.__interruptionManager as InterruptionState;
}

/** Tools that can be used for mining */
const MINING_TOOLS = ['pickaxe', 'shovel', 'axe', 'hoe'];

/** Tool required for each block type (simplified) */
const BLOCK_TOOL_REQUIREMENTS: Record<string, string[]> = {
  stone: ['pickaxe'],
  cobblestone: ['pickaxe'],
  ore: ['pickaxe'],
  deepslate: ['pickaxe'],
  dirt: ['shovel'],
  sand: ['shovel'],
  gravel: ['shovel'],
  log: ['axe'],
  wood: ['axe'],
  planks: ['axe'],
  leaves: ['shears', 'axe'],
  farmland: ['hoe'],
  grass_block: ['shovel'],
};

/** Item with durability properties */
type ItemWithDurability = Item & {
  maxDurability?: number;
  durabilityUsed?: number;
};

/** Bot with damage tracking */
interface BotWithDamage extends Bot {
  lastDamageTaken?: number;
}

/**
 * Check if item is a tool
 */
function isTool(item: Item): boolean {
  const name = item.name.toLowerCase();
  return MINING_TOOLS.some((tool) => name.includes(tool)) || name.includes('sword');
}

/**
 * Get tool durability percentage (0-1)
 */
function getToolDurability(item: Item): number {
  const durableItem = item as ItemWithDurability;
  const maxDurability = durableItem.maxDurability;
  const durabilityUsed = durableItem.durabilityUsed || 0;

  if (!maxDurability) return 1;
  return (maxDurability - durabilityUsed) / maxDurability;
}

/**
 * Check if tool is about to break (< 10% durability)
 */
function isToolLow(item: Item): boolean {
  return getToolDurability(item) < 0.1;
}

/**
 * Get suitable tools for a block type from inventory
 */
function getSuitableTools(bot: Bot, blockName?: string): Item[] {
  const items = bot.inventory.items();

  if (!blockName) {
    // Return all tools
    return items.filter(isTool);
  }

  // Find required tool type for block
  const lowerBlock = blockName.toLowerCase();
  let requiredTypes: string[] = [];

  for (const [pattern, tools] of Object.entries(BLOCK_TOOL_REQUIREMENTS)) {
    if (lowerBlock.includes(pattern)) {
      requiredTypes = tools;
      break;
    }
  }

  if (requiredTypes.length === 0) {
    // No specific tool required, any tool works
    return items.filter(isTool);
  }

  // Find tools matching required types
  return items.filter((item) => {
    const name = item.name.toLowerCase();
    return requiredTypes.some((type) => name.includes(type));
  });
}

/**
 * Initialize interruption manager for a bot
 */
export function initializeInterruptionManager(
  bot: Bot,
  config: Partial<InterruptionConfig> = {}
): void {
  const state = getInterruptionState(bot);
  state.config = { ...DEFAULT_INTERRUPT_CONFIG, ...config };

  // Clean up any existing listeners
  cleanupInterruptionListeners(bot);

  log.debug('Initializing interruption manager', { config: state.config });

  // Set up damage listener
  state.listeners.entityHurt = (entity: Entity) => {
    if (entity !== bot.entity) return;

    const damage = (bot as BotWithDamage).lastDamageTaken || 0;

    if (damage >= state.config.damageThreshold) {
      emitInterrupt(bot, {
        name: 'damage_taken',
        priority: 'critical',
        message: `Bot took ${damage} damage`,
        data: { damage, health: bot.health },
      });
    }
  };
  bot.on('entityHurt', state.listeners.entityHurt);

  // Set up health listener
  state.listeners.health = () => {
    // Check low health (high priority)
    if (bot.health > 0 && bot.health < state.config.healthLowThreshold) {
      emitInterrupt(bot, {
        name: 'health_low',
        priority: 'high',
        message: `Health critically low: ${bot.health}`,
        data: { health: bot.health },
      });
    }

    // Check low food (advisory)
    if (bot.food < state.config.hungerWarningThreshold) {
      emitInterrupt(bot, {
        name: 'hunger_low',
        priority: 'advisory',
        message: `Food low: ${bot.food}`,
        data: { food: bot.food },
      });
    }
  };
  bot.on('health', state.listeners.health);

  // Set up tool monitoring interval
  state.monitorInterval = setInterval(() => {
    monitorTools(bot);
  }, 1000);

  // Clean up on bot end
  bot.once('end', () => {
    cleanupInterruptionListeners(bot);
  });

  log.info('Interruption manager initialized');
}

/**
 * Monitor tool durability and availability
 */
function monitorTools(bot: Bot): void {
  const state = getInterruptionState(bot);
  const heldItem = bot.heldItem;

  if (!heldItem || !isTool(heldItem)) {
    state.lastEquippedTool = null;
    return;
  }

  const toolName = heldItem.name;

  // Check if tool broke (was equipped but now gone or different)
  if (state.lastEquippedTool && state.lastEquippedTool !== toolName) {
    // Check if the old tool is still in inventory
    const stillHasTool = bot.inventory.items().some((i) => i.name === state.lastEquippedTool);

    if (!stillHasTool && state.config.interruptOnToolBreak) {
      emitInterrupt(bot, {
        name: 'tool_broken',
        priority: 'high',
        message: `Tool broke: ${state.lastEquippedTool}`,
        data: { brokenTool: state.lastEquippedTool },
      });
    }
  }

  state.lastEquippedTool = toolName;

  // Check if tool is about to break
  if (isToolLow(heldItem)) {
    emitInterrupt(bot, {
      name: 'tool_low_durability',
      priority: 'advisory',
      message: `Tool low durability: ${toolName}`,
      data: { tool: toolName, durability: getToolDurability(heldItem) },
    });
  }
}

/**
 * Check if there are suitable tools for a task
 */
export function checkToolsAvailable(bot: Bot, blockName?: string): InterruptCheckResult {
  const state = getInterruptionState(bot);
  const suitableTools = getSuitableTools(bot, blockName);

  // Filter out tools that are about to break
  const usableTools = suitableTools.filter((t) => !isToolLow(t));

  if (usableTools.length === 0 && state.config.interruptOnNoTools) {
    const condition: InterruptCondition = {
      name: 'no_suitable_tools',
      priority: 'high',
      message: blockName
        ? `No suitable tools for mining ${blockName}`
        : 'No usable tools in inventory',
      data: { blockName, availableTools: suitableTools.map((t) => t.name) },
    };

    return { shouldInterrupt: true, condition };
  }

  return { shouldInterrupt: false };
}

/**
 * Emit an interrupt event with cooldown
 */
function emitInterrupt(bot: Bot, condition: InterruptCondition): void {
  const state = getInterruptionState(bot);
  const now = Date.now();

  // Check cooldown (except for critical interrupts)
  if (condition.priority !== 'critical') {
    const lastInterrupt = state.lastInterrupts.get(condition.name);
    if (lastInterrupt && now - lastInterrupt < state.config.interruptCooldownMs) {
      return; // Still in cooldown
    }
  }

  state.lastInterrupts.set(condition.name, now);

  log.debug('Emitting interrupt', {
    name: condition.name,
    priority: condition.priority,
    message: condition.message,
  });

  state.emitter.emit('interrupt', condition);
}

/**
 * Subscribe to interrupt events
 */
export function onInterrupt(
  bot: Bot,
  callback: (condition: InterruptCondition) => void,
  filter?: { priority?: InterruptPriority; names?: string[] }
): () => void {
  const state = getInterruptionState(bot);

  const handler = (condition: InterruptCondition) => {
    // Apply filters
    if (filter?.priority && condition.priority !== filter.priority) {
      return;
    }
    if (filter?.names && !filter.names.includes(condition.name)) {
      return;
    }

    callback(condition);
  };

  state.emitter.on('interrupt', handler);

  return () => {
    state.emitter.removeListener('interrupt', handler);
  };
}

/**
 * Subscribe to mandatory (non-advisory) interrupts
 */
export function onMandatoryInterrupt(
  bot: Bot,
  callback: (condition: InterruptCondition) => void
): () => void {
  return onInterrupt(
    bot,
    callback,
    // Filter out advisory interrupts
    { priority: undefined, names: undefined }
  );
}

/**
 * Check for immediate interrupt conditions
 */
export function checkForInterrupts(bot: Bot, blockName?: string): InterruptCheckResult {
  const state = getInterruptionState(bot);

  // Check health
  if (bot.health > 0 && bot.health < state.config.healthLowThreshold) {
    return {
      shouldInterrupt: true,
      condition: {
        name: 'health_low',
        priority: 'high',
        message: `Health critically low: ${bot.health}`,
        data: { health: bot.health },
      },
    };
  }

  // Check tools if block specified
  if (blockName) {
    const toolCheck = checkToolsAvailable(bot, blockName);
    if (toolCheck.shouldInterrupt) {
      return toolCheck;
    }
  }

  return { shouldInterrupt: false };
}

/**
 * Clean up interruption listeners
 */
export function cleanupInterruptionListeners(bot: Bot): void {
  const managed = bot as ManagedBot;
  const state = managed.__interruptionManager as InterruptionState | undefined;

  if (!state) return;

  if (state.listeners.entityHurt) {
    bot.removeListener('entityHurt', state.listeners.entityHurt);
  }
  if (state.listeners.health) {
    bot.removeListener('health', state.listeners.health);
  }

  if (state.monitorInterval) {
    clearInterval(state.monitorInterval);
    state.monitorInterval = null;
  }

  state.listeners = {};

  log.debug('Interruption listeners cleaned up');
}

/**
 * Get current interrupt configuration
 */
export function getInterruptConfig(bot: Bot): InterruptionConfig {
  const state = getInterruptionState(bot);
  return { ...state.config };
}

/**
 * Update interrupt configuration
 */
export function setInterruptConfig(bot: Bot, config: Partial<InterruptionConfig>): void {
  const state = getInterruptionState(bot);
  state.config = { ...state.config, ...config };
}
