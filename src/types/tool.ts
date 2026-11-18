/**
 * Tool type definitions for the MCP tool system
 */

import type { BotStatus, StatusDelta, BotEvent } from './bot.js';

/** JSON Schema type for tool definitions */
export interface JsonSchema {
  type: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  description?: string;
  enum?: (string | number)[];
  items?: JsonSchema;
  default?: unknown;
  minimum?: number;
  maximum?: number;
}

/** Tool definition for MCP protocol */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

/** Base result type for all tool operations */
export interface ToolResultBase {
  ok: boolean;
  bot?: string;
  error?: string;
  status?: BotStatus;
  delta?: StatusDelta;
}

/** Successful tool result */
export interface ToolSuccess<T = unknown> extends ToolResultBase {
  ok: true;
  data?: T;
  /** Chat messages separated from general events in foreground tool responses. */
  recentChat?: Array<{
    from: string;
    message: string;
    timestamp: number;
    isWhisper: boolean;
  }>;
  /** Events that occurred since last tool call */
  events?: BotEvent[];
}

/** Failed tool result */
export interface ToolError extends ToolResultBase {
  ok: false;
  error: string;
  code?: string;
  details?: unknown;
}

/** Combined tool result type */
export type ToolResult<T = unknown> = ToolSuccess<T> | ToolError;

/**
 * Tool context providing access to bot management and configuration
 *
 * NOTE: The canonical ToolContext is defined in src/tools/base-tool.ts
 * This re-export ensures type consistency across the codebase.
 */
export type { ToolContext, BotManagerContext } from '../tools/base-tool.js';

/** Tool category for organization */
export type ToolCategory =
  | 'connection'
  | 'movement'
  | 'combat'
  | 'inventory'
  | 'mining'
  | 'crafting'
  | 'cooking'
  | 'farming'
  | 'storage'
  | 'building'
  | 'observation'
  | 'communication'
  | 'utility'
  | 'enchanting'
  | 'trading'
  | 'fishing'
  | 'brewing'
  | 'animals'
  | 'anvil'
  | 'automation'
  | 'memory'
  | 'goals'
  | 'navigation'
  | 'skills';

/** Tool metadata for registration */
export interface ToolMetadata {
  name: string;
  category: ToolCategory;
  description: string;
  version: string;
}

/** Error categories for classification */
export enum ErrorCategory {
  /** Network issues, server lag - should retry */
  TRANSIENT = 'TRANSIENT',
  /** Bot stuck, task failed - can recover */
  RECOVERABLE = 'RECOVERABLE',
  /** Bot died, kicked - cannot retry */
  FATAL = 'FATAL',
  /** Exceeded time limits - may retry with adjusted timeout */
  TIMEOUT = 'TIMEOUT',
  /** Missing items, tools - need user action */
  RESOURCE = 'RESOURCE',
}

/** Classified error for retry logic */
export interface ClassifiedError {
  category: ErrorCategory;
  message: string;
  retryable: boolean;
  maxRetries: number;
  backoffMs: number;
  originalError?: Error;
}

/** Retry options for operations */
export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  exponentialBase: number;
  jitterMs: number;
  onRetry?: (attempt: number, error: ClassifiedError) => void;
}

/** Task priority levels */
export enum TaskPriority {
  /** Death recovery, emergency escape */
  CRITICAL = 0,
  /** Combat, self-defense */
  HIGH = 1,
  /** Mining, crafting, navigation */
  NORMAL = 2,
  /** Scanning, idle actions */
  LOW = 3,
  /** Auto-eat, health monitoring */
  BACKGROUND = 4,
}

/** Queued task definition */
export interface QueuedTask<T = unknown> {
  id: string;
  priority: TaskPriority;
  name: string;
  fn: (signal: AbortSignal) => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timeoutMs: number;
  enqueuedAt: number;
  dependencies?: string[];
}
