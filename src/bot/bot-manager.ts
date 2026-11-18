/**
 * Bot manager for handling multiple bot instances
 */

import type { Bot } from 'mineflayer';
import type { CreateBotOptions } from '../types/index.js';
import type { AppConfig } from '../config/index.js';
import { createBot, destroyBot } from './bot-factory.js';
import { NoBotError, BotNotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const log = logger.child('bot-manager');

/**
 * Bot manager class
 */
export class BotManager {
  private bots: Map<string, Bot> = new Map();

  constructor(private config: AppConfig) {}

  /**
   * Create and register a new bot
   */
  async create(options: CreateBotOptions): Promise<Bot> {
    // Check if bot already exists
    if (this.bots.has(options.username)) {
      log.warn('Bot already exists, destroying old instance', { username: options.username });
      await this.destroy(options.username);
    }

    // Create new bot
    const bot = await createBot(options, this.config);

    // Register bot
    this.bots.set(options.username, bot);

    // Set up end handler to auto-remove
    bot.once('end', () => {
      this.bots.delete(options.username);
      log.debug('Bot removed from registry on disconnect', { username: options.username });
    });

    log.info('Bot created and registered', { username: options.username });

    return bot;
  }

  /**
   * Get a bot by username
   */
  get(username: string): Bot | undefined {
    return this.bots.get(username);
  }

  /**
   * Get a bot by username or throw
   */
  getOrThrow(username?: string): Bot {
    // If username provided, get specific bot
    if (username) {
      const bot = this.bots.get(username);
      if (!bot) {
        throw new BotNotFoundError(username);
      }
      return bot;
    }

    // Otherwise, get first bot
    const [first] = this.bots.values();
    if (!first) {
      throw new NoBotError();
    }
    return first;
  }

  /**
   * Check if a bot exists
   */
  has(username: string): boolean {
    return this.bots.has(username);
  }

  /**
   * Get all bots
   */
  getAll(): Map<string, Bot> {
    return new Map(this.bots);
  }

  /**
   * Get all bot usernames
   */
  getUsernames(): string[] {
    return Array.from(this.bots.keys());
  }

  /**
   * Get number of active bots
   */
  get size(): number {
    return this.bots.size;
  }

  /**
   * Destroy a bot by username
   */
  async destroy(username: string): Promise<boolean> {
    const bot = this.bots.get(username);
    if (!bot) {
      return false;
    }

    destroyBot(bot);
    this.bots.delete(username);

    log.info('Bot destroyed', { username });

    return true;
  }

  /**
   * Destroy all bots
   */
  async destroyAll(): Promise<void> {
    const usernames = Array.from(this.bots.keys());

    for (const username of usernames) {
      await this.destroy(username);
    }

    log.info('All bots destroyed', { count: usernames.length });
  }

  /**
   * Update configuration
   */
  setConfig(config: AppConfig): void {
    this.config = config;
  }

  /**
   * Get current configuration
   */
  getConfig(): AppConfig {
    return this.config;
  }
}

/**
 * Create a bot manager
 */
export function createBotManager(config: AppConfig): BotManager {
  return new BotManager(config);
}
