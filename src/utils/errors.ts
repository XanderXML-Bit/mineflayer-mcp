/**
 * Error handling utilities for Minecraft MCP
 */

import { ErrorCategory, type ClassifiedError, type RetryOptions } from '../types/index.js';

/**
 * Base error class for MCP errors
 */
export class MCPError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly category: ErrorCategory = ErrorCategory.RECOVERABLE
  ) {
    super(message);
    this.name = 'MCPError';
  }
}

/**
 * Error thrown when no bot is available
 */
export class NoBotError extends MCPError {
  constructor() {
    super('No active bots. Use joinGame first.', 'NO_BOT', ErrorCategory.RESOURCE);
    this.name = 'NoBotError';
  }
}

/**
 * Error thrown when a specific bot is not found
 */
export class BotNotFoundError extends MCPError {
  constructor(username: string) {
    super(`Bot '${username}' not found`, 'BOT_NOT_FOUND', ErrorCategory.RESOURCE);
    this.name = 'BotNotFoundError';
  }
}

/**
 * Error thrown when another task is already running
 */
export class TaskRunningError extends MCPError {
  constructor() {
    super('Another task is already running', 'TASK_RUNNING', ErrorCategory.TRANSIENT);
    this.name = 'TaskRunningError';
  }
}

/**
 * Error thrown when an operation times out
 */
export class TimeoutError extends MCPError {
  constructor(operation: string, timeoutMs: number) {
    super(`Operation '${operation}' timed out after ${timeoutMs}ms`, 'TIMEOUT', ErrorCategory.TIMEOUT);
    this.name = 'TimeoutError';
  }
}

/**
 * Error thrown when navigation fails
 */
export class NavigationError extends MCPError {
  constructor(message: string) {
    super(message, 'NAVIGATION_ERROR', ErrorCategory.RECOVERABLE);
    this.name = 'NavigationError';
  }
}

/**
 * Error thrown when a required resource is missing
 */
export class ResourceError extends MCPError {
  constructor(message: string) {
    super(message, 'RESOURCE_ERROR', ErrorCategory.RESOURCE);
    this.name = 'ResourceError';
  }
}

/**
 * Error thrown when the bot dies
 */
export class BotDiedError extends MCPError {
  constructor() {
    super('Bot died during operation', 'BOT_DIED', ErrorCategory.FATAL);
    this.name = 'BotDiedError';
  }
}

/**
 * Classify an error for retry logic
 */
export function classifyError(error: Error): ClassifiedError {
  const msg = error.message.toLowerCase();

  // Check for specific error types
  if (error instanceof MCPError) {
    return {
      category: error.category,
      message: error.message,
      retryable: error.category === ErrorCategory.TRANSIENT || error.category === ErrorCategory.TIMEOUT,
      maxRetries: error.category === ErrorCategory.TRANSIENT ? 3 : error.category === ErrorCategory.TIMEOUT ? 2 : 0,
      backoffMs: error.category === ErrorCategory.TRANSIENT ? 500 : 1000,
      originalError: error,
    };
  }

  // Navigation timeout
  if (msg.includes('navigation_timeout') || msg.includes('collect_timeout')) {
    return {
      category: ErrorCategory.TIMEOUT,
      message: msg,
      retryable: true,
      maxRetries: 2,
      backoffMs: 1000,
      originalError: error,
    };
  }

  // Bot died or kicked
  if (msg.includes('bot_died') || msg.includes('kicked')) {
    return {
      category: ErrorCategory.FATAL,
      message: msg,
      retryable: false,
      maxRetries: 0,
      backoffMs: 0,
      originalError: error,
    };
  }

  // Task running
  if (msg.includes('another_task_running')) {
    return {
      category: ErrorCategory.TRANSIENT,
      message: msg,
      retryable: true,
      maxRetries: 3,
      backoffMs: 500,
      originalError: error,
    };
  }

  // Missing tool/resource
  if (msg.includes('no_pickaxe') || msg.includes('missing_tool') || msg.includes('not found')) {
    return {
      category: ErrorCategory.RESOURCE,
      message: msg,
      retryable: false,
      maxRetries: 0,
      backoffMs: 0,
      originalError: error,
    };
  }

  // Inventory full
  if (msg.includes('inventory full') || msg.includes('no space') || msg.includes('slot occupied')) {
    return {
      category: ErrorCategory.RESOURCE,
      message: msg,
      retryable: false,
      maxRetries: 0,
      backoffMs: 0,
      originalError: error,
    };
  }

  // Authentication/version errors
  if (msg.includes('authentication') || msg.includes('invalid token') || msg.includes('wrong version')) {
    return {
      category: ErrorCategory.FATAL,
      message: msg,
      retryable: false,
      maxRetries: 0,
      backoffMs: 0,
      originalError: error,
    };
  }

  // Chunk/world loading errors
  if (msg.includes('chunk') || msg.includes('not loaded') || msg.includes('unloaded')) {
    return {
      category: ErrorCategory.TRANSIENT,
      message: msg,
      retryable: true,
      maxRetries: 3,
      backoffMs: 1000,
      originalError: error,
    };
  }

  // Combat errors
  if (msg.includes('invulnerable') || msg.includes('cannot attack') || msg.includes('target lost')) {
    return {
      category: ErrorCategory.RECOVERABLE,
      message: msg,
      retryable: true,
      maxRetries: 1,
      backoffMs: 500,
      originalError: error,
    };
  }

  // Crafting/recipe errors
  if (msg.includes('recipe') || msg.includes('cannot craft') || msg.includes('missing ingredient')) {
    return {
      category: ErrorCategory.RESOURCE,
      message: msg,
      retryable: false,
      maxRetries: 0,
      backoffMs: 0,
      originalError: error,
    };
  }

  // Permission/protection errors
  if (msg.includes('permission') || msg.includes('protected') || msg.includes('spawn protection')) {
    return {
      category: ErrorCategory.RESOURCE,
      message: msg,
      retryable: false,
      maxRetries: 0,
      backoffMs: 0,
      originalError: error,
    };
  }

  // Default to recoverable
  return {
    category: ErrorCategory.RECOVERABLE,
    message: msg,
    retryable: true,
    maxRetries: 1,
    backoffMs: 2000,
    originalError: error,
  };
}

/**
 * Default retry options
 */
export const defaultRetryOptions: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  exponentialBase: 2,
  jitterMs: 500,
};

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...defaultRetryOptions, ...options };
  let lastError: ClassifiedError | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = classifyError(error as Error);

      if (!lastError.retryable || attempt === opts.maxRetries) {
        throw error;
      }

      // Calculate delay with exponential backoff and jitter
      const delay = Math.min(
        opts.baseDelayMs * Math.pow(opts.exponentialBase, attempt) + Math.random() * opts.jitterMs,
        opts.maxDelayMs
      );

      opts.onRetry?.(attempt + 1, lastError);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError?.originalError || new Error('Retry failed');
}

/**
 * Create an error result object for tool responses
 */
export function createErrorResult(error: Error | string, code?: string): {
  ok: false;
  error: string;
  code?: string;
} {
  const message = typeof error === 'string' ? error : error.message;
  const errorCode = code || (error instanceof MCPError ? error.code : undefined);

  return {
    ok: false,
    error: message,
    ...(errorCode ? { code: errorCode } : {}),
  };
}
