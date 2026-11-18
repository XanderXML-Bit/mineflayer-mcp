/**
 * Background Task Service
 *
 * Manages asynchronous task execution with progress tracking,
 * cancellation, and status updates.
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';

const log = logger.child('background-task');

/** Task status */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/** Task progress update */
export interface TaskProgress {
  percent: number;
  message?: string;
  data?: Record<string, unknown>;
}

/** Task definition */
export interface BackgroundTask<T = unknown> {
  id: string;
  name: string;
  botUsername: string;
  status: TaskStatus;
  progress: TaskProgress;
  startedAt: number;
  completedAt?: number;
  result?: T;
  error?: string;
  abortController: AbortController;
}

/** Task execution function type */
export type TaskExecutor<T> = (
  signal: AbortSignal,
  updateProgress: (progress: Partial<TaskProgress>) => void
) => Promise<T>;

/** Events emitted by the task manager */
export interface TaskManagerEvents {
  'task:started': (task: BackgroundTask) => void;
  'task:progress': (task: BackgroundTask) => void;
  'task:completed': (task: BackgroundTask) => void;
  'task:failed': (task: BackgroundTask) => void;
  'task:cancelled': (task: BackgroundTask) => void;
}

/**
 * Background Task Manager
 * Singleton that manages all background tasks across bots
 */
class BackgroundTaskManager extends EventEmitter {
  private tasks: Map<string, BackgroundTask> = new Map();
  private taskCounter = 0;

  constructor() {
    super();
    this.setMaxListeners(100);
  }

  /**
   * Generate a unique task ID
   */
  private generateTaskId(): string {
    this.taskCounter++;
    return `task_${Date.now()}_${this.taskCounter}`;
  }

  /**
   * Start a new background task
   */
  async startTask<T>(
    name: string,
    botUsername: string,
    executor: TaskExecutor<T>
  ): Promise<string> {
    const taskId = this.generateTaskId();
    const abortController = new AbortController();

    const task: BackgroundTask<T> = {
      id: taskId,
      name,
      botUsername,
      status: 'pending',
      progress: { percent: 0 },
      startedAt: Date.now(),
      abortController,
    };

    this.tasks.set(taskId, task);

    // Update progress callback
    const updateProgress = (progress: Partial<TaskProgress>) => {
      const currentTask = this.tasks.get(taskId);
      if (currentTask && currentTask.status === 'running') {
        currentTask.progress = { ...currentTask.progress, ...progress };
        this.emit('task:progress', currentTask);
      }
    };

    // Start execution in background
    setImmediate(async () => {
      task.status = 'running';
      this.emit('task:started', task);
      log.info(`Task started: ${name}`, { taskId, botUsername });

      try {
        const result = await executor(abortController.signal, updateProgress);

        task.status = 'completed';
        task.result = result;
        task.completedAt = Date.now();
        task.progress = { percent: 100, message: 'Completed' };

        this.emit('task:completed', task);
        log.info(`Task completed: ${name}`, { taskId, duration: task.completedAt - task.startedAt });
      } catch (err) {
        if (abortController.signal.aborted) {
          task.status = 'cancelled';
          task.completedAt = Date.now();
          this.emit('task:cancelled', task);
          log.info(`Task cancelled: ${name}`, { taskId });
        } else {
          task.status = 'failed';
          task.error = err instanceof Error ? err.message : String(err);
          task.completedAt = Date.now();
          this.emit('task:failed', task);
          log.error(`Task failed: ${name}`, { taskId, error: task.error });
        }
      }
    });

    return taskId;
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): BackgroundTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get all tasks for a bot
   */
  getTasksForBot(botUsername: string): BackgroundTask[] {
    return Array.from(this.tasks.values()).filter(t => t.botUsername === botUsername);
  }

  /**
   * Get all running tasks
   */
  getRunningTasks(): BackgroundTask[] {
    return Array.from(this.tasks.values()).filter(
      t => t.status === 'running' || t.status === 'pending'
    );
  }

  /**
   * Get all tasks (optionally filtered by status)
   */
  getAllTasks(status?: TaskStatus): BackgroundTask[] {
    if (status) {
      return Array.from(this.tasks.values()).filter(t => t.status === status);
    }
    return Array.from(this.tasks.values());
  }

  /**
   * Cancel a task
   */
  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    if (task.status !== 'running' && task.status !== 'pending') {
      return false;
    }

    task.abortController.abort();
    return true;
  }

  /**
   * Cancel all tasks for a bot
   */
  cancelAllTasksForBot(botUsername: string): number {
    let cancelled = 0;
    for (const task of this.tasks.values()) {
      if (task.botUsername === botUsername &&
          (task.status === 'running' || task.status === 'pending')) {
        task.abortController.abort();
        cancelled++;
      }
    }
    return cancelled;
  }

  /**
   * Clean up old completed tasks (older than maxAge ms)
   */
  cleanup(maxAgeMs: number = 3600000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [taskId, task] of this.tasks.entries()) {
      if (task.completedAt && now - task.completedAt > maxAgeMs) {
        this.tasks.delete(taskId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get task summary for a bot
   */
  getTaskSummary(botUsername?: string): {
    total: number;
    running: number;
    pending: number;
    completed: number;
    failed: number;
    cancelled: number;
  } {
    const tasks = botUsername
      ? this.getTasksForBot(botUsername)
      : Array.from(this.tasks.values());

    return {
      total: tasks.length,
      running: tasks.filter(t => t.status === 'running').length,
      pending: tasks.filter(t => t.status === 'pending').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
      cancelled: tasks.filter(t => t.status === 'cancelled').length,
    };
  }
}

// Singleton instance
export const backgroundTaskManager = new BackgroundTaskManager();

/**
 * Helper to run a tool as a background task
 */
export function runAsBackgroundTask<T>(
  name: string,
  botUsername: string,
  executor: TaskExecutor<T>
): Promise<string> {
  return backgroundTaskManager.startTask(name, botUsername, executor);
}
