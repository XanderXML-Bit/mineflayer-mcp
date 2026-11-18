/**
 * Base tool class for MCP tools
 *
 * All tools should extend this class to ensure consistent behavior.
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { Bot } from 'mineflayer';
import type { ToolDefinition, ToolResult, ToolCategory, JsonSchema } from '../types/index.js';
import type { AppConfig } from '../config/index.js';
import { withTask } from '../services/task.service.js';
import { getBotStatus, calculateStatusDelta } from '../services/status.service.js';
import { getAndClearEvents } from '../services/event.service.js';
import { backgroundTaskManager, type TaskProgress } from '../services/background-task.service.js';
import { logger } from '../utils/logger.js';

/** Bot manager interface for connection tools */
export interface BotManagerContext {
  create: (options: { username: string; host?: string; port?: number }) => Promise<Bot>;
  destroy: (username: string) => Promise<boolean>;
  destroyAll: () => Promise<void>;
  has: (username: string) => boolean;
  getUsernames: () => string[];
}

/** Tool context for dependency injection */
export interface ToolContext {
  /** Get a bot by username or get the default bot */
  getBotOrThrow: (username?: string) => Bot;
  /** Get all active bots */
  getAllBots: () => Map<string, Bot>;
  /** Application configuration */
  config: AppConfig;
  /** Bot manager for creating/destroying bots (optional, used by connection tools) */
  botManager?: BotManagerContext;
}

/** Base input schema that all tools should extend */
export const BaseInputSchema = z.object({
  username: z.string().optional().describe('Bot username (optional if only one bot is active)'),
  runInBackground: z.boolean().optional().describe('Run this task in the background and return immediately with a task ID'),
});

export type BaseInput = z.infer<typeof BaseInputSchema>;

/** Result when running a tool in background */
export interface BackgroundTaskResult {
  ok: true;
  backgroundTask: true;
  taskId: string;
  taskName: string;
  bot: string;
  message: string;
}

/** Extended input with background task context (injected when running in background) */
export interface BackgroundTaskContext {
  _abortSignal?: AbortSignal;
  _updateProgress?: (progress: Partial<TaskProgress>) => void;
}

/** Helper to extract abort signal from input */
export function getAbortSignal(input: unknown): AbortSignal | undefined {
  return (input as BackgroundTaskContext)?._abortSignal;
}

/** Helper to extract progress updater from input */
export function getProgressUpdater(input: unknown): ((progress: Partial<TaskProgress>) => void) | undefined {
  return (input as BackgroundTaskContext)?._updateProgress;
}

/** Error with optional code property */
interface ErrorWithCode extends Error {
  code?: string;
}

/**
 * Abstract base class for all MCP tools
 */
export abstract class BaseTool<TInput extends BaseInput = BaseInput, TOutput = unknown> {
  /** Tool name (must be unique) */
  abstract readonly name: string;

  /** Tool description for MCP */
  abstract readonly description: string;

  /** Tool category for organization */
  abstract readonly category: ToolCategory;

  /** Zod schema for input validation - accepts any Zod schema that outputs TInput */
  abstract readonly inputSchema: z.ZodType<TInput, z.ZodTypeDef, unknown>;

  /** Logger instance for this tool */
  protected get log() {
    return logger.child(this.name);
  }

  constructor(protected readonly context: ToolContext) {}

  /**
   * Execute the tool logic
   * Must be implemented by subclasses
   */
  protected abstract execute(input: TInput, bot: Bot): Promise<TOutput>;

  /**
   * Run the tool with validation, status tracking, and error handling
   */
  async run(rawInput: unknown): Promise<ToolResult<TOutput> | BackgroundTaskResult> {
    // Validate input
    const parseResult = this.inputSchema.safeParse(rawInput);
    if (!parseResult.success) {
      return {
        ok: false,
        error: `Invalid input: ${parseResult.error.message}`,
        code: 'INVALID_INPUT',
      };
    }

    const input = parseResult.data;

    // Check for background execution
    if (input.runInBackground) {
      return this.startAsBackgroundTask(input);
    }

    try {
      // Get bot
      const bot = this.context.getBotOrThrow(input.username);

      // Capture status before
      const statusBefore = getBotStatus(bot);

      // Execute tool
      const result = await this.execute(input, bot);

      // Capture status after
      const statusAfter = getBotStatus(bot);
      const delta = calculateStatusDelta(statusBefore, statusAfter);

      // Get and clear events
      const events = getAndClearEvents(bot);

      // Extract chat and whisper messages for prominent display
      const chatEvents = events.filter((e) => e.type === 'player_chat' || e.type === 'player_whisper');
      const recentChat =
        chatEvents.length > 0
          ? chatEvents.map((e) => ({
              from: e.data.username as string,
              message: e.data.message as string,
              timestamp: e.timestamp,
              isWhisper: e.type === 'player_whisper',
            }))
          : undefined;

      // Filter out chat/whisper events from general events list to avoid duplication
      const otherEvents = events.filter((e) => e.type !== 'player_chat' && e.type !== 'player_whisper');

      return {
        ok: true,
        data: result,
        bot: bot.username,
        status: statusAfter,
        delta,
        recentChat, // Chat/whisper messages displayed prominently
        events: otherEvents.length > 0 ? otherEvents : undefined,
      };
    } catch (error) {
      this.log.error('Tool execution failed', { error });

      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        code: (error as ErrorWithCode)?.code,
      };
    }
  }

  /**
   * Start this tool as a background task
   */
  protected async startAsBackgroundTask(input: TInput): Promise<BackgroundTaskResult> {
    const bot = this.context.getBotOrThrow(input.username);
    const taskName = `${this.name}`;

    const taskId = await backgroundTaskManager.startTask(
      taskName,
      bot.username,
      async (signal, updateProgress) => {
        // Inject signal into context if tool supports it
        const inputWithSignal = { ...input, _abortSignal: signal, _updateProgress: updateProgress };

        // Execute the tool
        const result = await this.execute(inputWithSignal, bot);
        return result;
      }
    );

    return {
      ok: true,
      backgroundTask: true,
      taskId,
      taskName,
      bot: bot.username,
      message: `Task "${taskName}" started in background. Use getTaskStatus or listBackgroundTasks to check progress.`,
    };
  }

  /**
   * Run the tool within a task mutex
   */
  async runWithTask(rawInput: unknown): Promise<ToolResult<TOutput> | BackgroundTaskResult> {
    // Validate input
    const parseResult = this.inputSchema.safeParse(rawInput);
    if (!parseResult.success) {
      return {
        ok: false,
        error: `Invalid input: ${parseResult.error.message}`,
        code: 'INVALID_INPUT',
      };
    }

    const input = parseResult.data;

    // Check for background execution
    if (input.runInBackground) {
      return this.startAsBackgroundTaskWithMutex(input);
    }

    try {
      // Get bot
      const bot = this.context.getBotOrThrow(input.username);

      // Capture status before
      const statusBefore = getBotStatus(bot);

      // Execute within task
      const result = await withTask(bot, async () => {
        return this.execute(input, bot);
      });

      // Capture status after
      const statusAfter = getBotStatus(bot);
      const delta = calculateStatusDelta(statusBefore, statusAfter);

      // Get and clear events
      const events = getAndClearEvents(bot);

      // Extract chat and whisper messages for prominent display
      const chatEvents = events.filter((e) => e.type === 'player_chat' || e.type === 'player_whisper');
      const recentChat =
        chatEvents.length > 0
          ? chatEvents.map((e) => ({
              from: e.data.username as string,
              message: e.data.message as string,
              timestamp: e.timestamp,
              isWhisper: e.type === 'player_whisper',
            }))
          : undefined;

      // Filter out chat/whisper events from general events list to avoid duplication
      const otherEvents = events.filter((e) => e.type !== 'player_chat' && e.type !== 'player_whisper');

      return {
        ok: true,
        data: result,
        bot: bot.username,
        status: statusAfter,
        delta,
        recentChat, // Chat messages displayed prominently
        events: otherEvents.length > 0 ? otherEvents : undefined,
      };
    } catch (error) {
      this.log.error('Tool execution failed', { error });

      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        code: (error as ErrorWithCode)?.code,
      };
    }
  }

  /**
   * Start this tool as a background task with mutex
   */
  protected async startAsBackgroundTaskWithMutex(input: TInput): Promise<BackgroundTaskResult> {
    const bot = this.context.getBotOrThrow(input.username);
    const taskName = `${this.name}`;

    const taskId = await backgroundTaskManager.startTask(
      taskName,
      bot.username,
      async (signal, updateProgress) => {
        // Execute within task mutex
        return withTask(bot, async () => {
          // Inject signal into context if tool supports it
          const inputWithSignal = { ...input, _abortSignal: signal, _updateProgress: updateProgress };
          return this.execute(inputWithSignal, bot);
        });
      }
    );

    return {
      ok: true,
      backgroundTask: true,
      taskId,
      taskName,
      bot: bot.username,
      message: `Task "${taskName}" started in background. Use getTaskStatus or listBackgroundTasks to check progress.`,
    };
  }

  /**
   * Get the MCP tool definition
   */
  getDefinition(): ToolDefinition {
    const jsonSchema = zodToJsonSchema(this.inputSchema, { target: 'openApi3' });

    return {
      name: this.name,
      description: this.description,
      inputSchema: jsonSchema as JsonSchema,
    };
  }

  /**
   * Helper to get a bot instance
   */
  protected getBot(username?: string): Bot {
    return this.context.getBotOrThrow(username);
  }

  /**
   * Helper to get configuration
   */
  protected getConfig(): AppConfig {
    return this.context.config;
  }
}

/**
 * Decorator-style function to create a simple tool
 */
export function createTool<TInput extends BaseInput, TOutput>(options: {
  name: string;
  description: string;
  category: ToolCategory;
  inputSchema: z.ZodSchema<TInput>;
  execute: (input: TInput, bot: Bot, context: ToolContext) => Promise<TOutput>;
  requiresTask?: boolean;
}): new (context: ToolContext) => BaseTool<TInput, TOutput> {
  return class extends BaseTool<TInput, TOutput> {
    readonly name = options.name;
    readonly description = options.description;
    readonly category = options.category;
    readonly inputSchema = options.inputSchema;

    protected async execute(input: TInput, bot: Bot): Promise<TOutput> {
      return options.execute(input, bot, this.context);
    }

    async run(rawInput: unknown): Promise<ToolResult<TOutput> | BackgroundTaskResult> {
      if (options.requiresTask) {
        return this.runWithTask(rawInput);
      }
      return super.run(rawInput);
    }
  };
}
