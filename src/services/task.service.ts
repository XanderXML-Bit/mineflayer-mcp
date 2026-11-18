/**
 * Task scheduling and management service
 *
 * Provides task mutex, cancellation, priority-based queuing,
 * progress-based timeouts, and task interruption.
 */

import type { Bot } from 'mineflayer';
import type { ManagedBot, TaskState, QueuedTask, TaskType, InterruptCondition } from '../types/index.js';
import { TaskPriority } from '../types/index.js';
import { TaskRunningError, BotDiedError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import {
  startProgressTracking,
  stopProgressTracking,
  onStalled,
} from './progress-tracker.js';
import {
  onInterrupt,
  checkForInterrupts,
} from './interruption-manager.js';

const log = logger.child('task');

/**
 * Get or create task state for a bot
 */
export function getTaskState(bot: Bot): TaskState {
  const managed = bot as ManagedBot;
  if (!managed.__task) {
    managed.__task = { running: false, abort: null };
  }
  return managed.__task;
}

/**
 * Simple task execution with mutex and death handling
 *
 * This is the backward-compatible version that matches the original implementation.
 */
export async function withTask<T>(
  bot: Bot,
  fn: (signal: { onAbort(cb: () => void): void }) => Promise<T>
): Promise<T> {
  const task = getTaskState(bot);

  if (task.running) {
    throw new TaskRunningError();
  }

  task.running = true;
  const onAbortCbs: Array<() => void> = [];

  task.abort = () => {
    try {
      bot.pathfinder?.stop?.();
      const pvpBot = bot as Bot & { pvp?: { stop(): void } };
      pvpBot.pvp?.stop?.();
    } catch {
      // Ignore abort cleanup errors
    }
    for (const cb of onAbortCbs) {
      try {
        cb();
      } catch {
        // Ignore callback errors
      }
    }
  };

  let deathListener: (() => void) | null = null;

  try {
    const deathPromise = new Promise<never>((_, reject) => {
      deathListener = () => {
        try {
          bot.pathfinder?.stop?.();
          const pvpBot = bot as Bot & { pvp?: { stop(): void } };
          pvpBot.pvp?.stop?.();
        } catch {
          // Ignore cleanup errors
        }
        // Call abort callbacks
        for (const cb of onAbortCbs) {
          try {
            cb();
          } catch {
            // Ignore callback errors
          }
        }
        reject(new BotDiedError());
      };
      try {
        bot.on('death', deathListener);
      } catch {
        // Ignore listener registration errors
      }
    });

    const run = fn({
      onAbort(cb) {
        onAbortCbs.push(cb);
      },
    });

    const result = await Promise.race([run, deathPromise]);
    return result as T;
  } finally {
    if (deathListener) {
      try {
        bot.removeListener('death', deathListener);
      } catch {
        // Ignore listener removal errors
      }
    }
    task.running = false;
    task.abort = null;
  }
}

/** Options for progress-based task execution */
export interface ProgressTaskOptions {
  /** Task type for progress tracking */
  taskType: TaskType;
  /** Stall timeout in milliseconds (default: 15000) */
  stallTimeoutMs?: number;
  /** Block name for tool validation (optional) */
  blockName?: string;
  /** Whether to interrupt on advisory conditions (default: false) */
  interruptOnAdvisory?: boolean;
}

/** Interruption error for clean task cancellation */
export class TaskInterruptedError extends Error {
  constructor(
    public condition: InterruptCondition,
    message?: string
  ) {
    super(message || `Task interrupted: ${condition.message}`);
    this.name = 'TaskInterruptedError';
  }
}

/** Stall timeout error */
export class TaskStalledError extends Error {
  constructor(
    public stallDurationMs: number,
    message?: string
  ) {
    super(message || `Task stalled: no progress for ${Math.round(stallDurationMs / 1000)}s`);
    this.name = 'TaskStalledError';
  }
}

/**
 * Execute a task with progress-based timeout and interruption handling
 *
 * This is the enhanced version of withTask that:
 * 1. Uses progress-based timeouts (timer only runs when not making progress)
 * 2. Monitors for interruption conditions (damage, low health, tool broken)
 * 3. Provides clean cancellation via abort callbacks
 */
export async function withProgressTask<T>(
  bot: Bot,
  fn: (signal: { onAbort(cb: () => void): void }) => Promise<T>,
  options: ProgressTaskOptions
): Promise<T> {
  const task = getTaskState(bot);

  if (task.running) {
    throw new TaskRunningError();
  }

  task.running = true;
  const onAbortCbs: Array<() => void> = [];
  const stallTimeoutMs = options.stallTimeoutMs ?? 15000;

  task.abort = () => {
    try {
      bot.pathfinder?.stop?.();
      const pvpBot = bot as Bot & { pvp?: { stop(): void } };
      pvpBot.pvp?.stop?.();
    } catch {
      // Ignore abort cleanup errors
    }
    for (const cb of onAbortCbs) {
      try {
        cb();
      } catch {
        // Ignore callback errors
      }
    }
  };

  let deathListener: (() => void) | null = null;

  // Check for immediate interrupt conditions before starting
  const preCheck = checkForInterrupts(bot, options.blockName);
  if (preCheck.shouldInterrupt && preCheck.condition) {
    task.running = false;
    task.abort = null;
    throw new TaskInterruptedError(preCheck.condition);
  }

  // Set up deferred rejection handlers
  let rejectStalled: ((error: Error) => void) | null = null;
  let rejectInterrupt: ((error: Error) => void) | null = null;

  // Subscribe to stalled and interrupt events BEFORE creating promises
  // This ensures proper type inference for the unsubscribe functions
  const stalledUnsubscribe = onStalled(bot, ({ stallDurationMs }) => {
    if (stallDurationMs >= stallTimeoutMs && rejectStalled) {
      for (const cb of onAbortCbs) {
        try {
          cb();
        } catch {}
      }
      rejectStalled(new TaskStalledError(stallDurationMs));
    }
  });

  const interruptUnsubscribe = onInterrupt(bot, (condition) => {
    // Skip advisory interrupts unless explicitly requested
    if (condition.priority === 'advisory' && !options.interruptOnAdvisory) {
      log.debug('Advisory interrupt (not interrupting)', { condition });
      return;
    }

    if (rejectInterrupt) {
      for (const cb of onAbortCbs) {
        try {
          cb();
        } catch {}
      }
      rejectInterrupt(new TaskInterruptedError(condition));
    }
  });

  try {
    // Start progress tracking
    startProgressTracking(bot, options.taskType, { stallTimeoutMs });

    // Create promises for various termination conditions
    const deathPromise = new Promise<never>((_, reject) => {
      deathListener = () => {
        try {
          bot.pathfinder?.stop?.();
          const pvpBot = bot as Bot & { pvp?: { stop(): void } };
          pvpBot.pvp?.stop?.();
        } catch {}
        for (const cb of onAbortCbs) {
          try {
            cb();
          } catch {}
        }
        reject(new BotDiedError());
      };
      try {
        bot.on('death', deathListener);
      } catch {}
    });

    const stalledPromise = new Promise<never>((_, reject) => {
      rejectStalled = reject;
    });

    const interruptPromise = new Promise<never>((_, reject) => {
      rejectInterrupt = reject;
    });

    const run = fn({
      onAbort(cb) {
        onAbortCbs.push(cb);
      },
    });

    const result = await Promise.race([run, deathPromise, stalledPromise, interruptPromise]);
    return result as T;
  } finally {
    // Clean up all listeners and tracking
    if (deathListener) {
      try {
        bot.removeListener('death', deathListener);
      } catch {
        // Ignore listener removal errors
      }
    }
    stalledUnsubscribe();
    interruptUnsubscribe();

    stopProgressTracking(bot);
    task.running = false;
    task.abort = null;
  }
}

/**
 * Advanced task scheduler with priority queue
 */
export class TaskScheduler {
  private queue: QueuedTask<unknown>[] = [];
  private currentTask: QueuedTask<unknown> | null = null;
  private abortController: AbortController | null = null;
  private taskHistory: Map<string, { success: boolean; duration: number }[]> = new Map();
  private processing = false;

  constructor(private bot: Bot) {}

  /**
   * Enqueue a task for execution
   */
  async enqueue<T>(
    name: string,
    fn: (signal: AbortSignal) => Promise<T>,
    options: {
      priority?: TaskPriority;
      timeoutMs?: number;
      interruptible?: boolean;
      dependencies?: string[];
    } = {}
  ): Promise<T> {
    const priority = options.priority ?? TaskPriority.NORMAL;
    const timeoutMs = options.timeoutMs ?? 60000;

    // Check if we should interrupt current task
    if (this.currentTask && priority < this.currentTask.priority) {
      log.debug(`Interrupting task ${this.currentTask.name} for higher priority ${name}`);
      this.abortController?.abort();
    }

    return new Promise<T>((resolve, reject) => {
      const task: QueuedTask<T> = {
        id: `${name}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        priority,
        name,
        fn,
        resolve,
        reject,
        timeoutMs,
        enqueuedAt: Date.now(),
        dependencies: options.dependencies,
      };

      this.insertByPriority(task as QueuedTask<unknown>);
      this.processQueue();
    });
  }

  /**
   * Insert a task into the queue maintaining priority order
   */
  private insertByPriority(task: QueuedTask<unknown>): void {
    let insertIndex = this.queue.length;

    for (let i = 0; i < this.queue.length; i++) {
      if (task.priority < this.queue[i].priority) {
        insertIndex = i;
        break;
      }
    }

    this.queue.splice(insertIndex, 0, task);
  }

  /**
   * Process the task queue
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.currentTask) return;
    if (this.queue.length === 0) return;

    this.processing = true;

    try {
      const task = this.queue.shift();
      if (!task) {
        this.processing = false;
        return;
      }

      // Check dependencies
      if (task.dependencies?.length) {
        const unmetDeps = task.dependencies.filter(
          (dep) => !this.taskHistory.get(dep)?.some((h) => h.success)
        );

        if (unmetDeps.length > 0) {
          task.reject(new Error(`Unmet dependencies: ${unmetDeps.join(', ')}`));
          this.processing = false;
          this.processQueue();
          return;
        }
      }

      this.currentTask = task;
      this.abortController = new AbortController();

      const startTime = Date.now();
      const timeoutId = setTimeout(() => {
        this.abortController?.abort();
      }, task.timeoutMs);

      try {
        const result = await task.fn(this.abortController.signal);
        clearTimeout(timeoutId);

        this.recordTaskResult(task.name, true, Date.now() - startTime);
        task.resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);

        this.recordTaskResult(task.name, false, Date.now() - startTime);
        task.reject(error as Error);
      } finally {
        this.currentTask = null;
        this.abortController = null;
      }
    } finally {
      this.processing = false;
    }

    // Process next task
    this.processQueue();
  }

  /**
   * Record task result for history
   */
  private recordTaskResult(name: string, success: boolean, duration: number): void {
    const history = this.taskHistory.get(name) || [];
    history.push({ success, duration });

    if (history.length > 20) {
      history.shift();
    }

    this.taskHistory.set(name, history);
  }

  /**
   * Cancel all pending and running tasks
   */
  cancelAll(): void {
    // Abort current task
    if (this.currentTask) {
      this.abortController?.abort();
      this.currentTask.reject(new Error('Task cancelled'));
      this.currentTask = null;
      this.abortController = null;
    }

    // Reject all queued tasks
    for (const task of this.queue) {
      task.reject(new Error('Task cancelled'));
    }

    this.queue = [];
  }

  /**
   * Get queue status
   */
  getStatus(): {
    current: string | null;
    queued: string[];
    lengths: Record<TaskPriority, number>;
  } {
    const lengths = {
      [TaskPriority.CRITICAL]: 0,
      [TaskPriority.HIGH]: 0,
      [TaskPriority.NORMAL]: 0,
      [TaskPriority.LOW]: 0,
      [TaskPriority.BACKGROUND]: 0,
    };

    for (const task of this.queue) {
      lengths[task.priority]++;
    }

    return {
      current: this.currentTask?.name ?? null,
      queued: this.queue.map((t) => t.name),
      lengths,
    };
  }

  /**
   * Check if a task is currently running
   */
  isRunning(): boolean {
    return this.currentTask !== null;
  }

  /**
   * Get the current task name
   */
  getCurrentTaskName(): string | null {
    return this.currentTask?.name ?? null;
  }
}

/**
 * Create a task scheduler for a bot
 */
export function createTaskScheduler(bot: Bot): TaskScheduler {
  return new TaskScheduler(bot);
}
