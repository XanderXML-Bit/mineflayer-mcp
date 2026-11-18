/**
 * Background Task Management Tools
 *
 * Tools for listing, monitoring, and cancelling background tasks
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { backgroundTaskManager, TaskStatus } from '../../services/background-task.service.js';

// ============================================================================
// List Tasks Tool
// ============================================================================

const ListTasksInputSchema = BaseInputSchema.extend({
  status: z.enum(['all', 'running', 'pending', 'completed', 'failed', 'cancelled'])
    .optional()
    .default('all')
    .describe('Filter tasks by status'),
  allBots: z.boolean()
    .optional()
    .default(false)
    .describe('Show tasks for all bots, not just this one'),
});

type ListTasksInput = z.infer<typeof ListTasksInputSchema>;

interface TaskInfo {
  id: string;
  name: string;
  botUsername: string;
  status: TaskStatus;
  progress: number;
  progressMessage?: string;
  startedAt: number;
  duration?: number;
  error?: string;
}

interface ListTasksOutput {
  ok: boolean;
  tasks: TaskInfo[];
  summary: {
    total: number;
    running: number;
    pending: number;
    completed: number;
    failed: number;
    cancelled: number;
  };
}

export class ListBackgroundTasksTool extends BaseTool<ListTasksInput, ListTasksOutput> {
  readonly name = 'listBackgroundTasks';
  readonly description = 'List all background tasks with their status and progress';
  readonly category = 'utility' as const;
  readonly inputSchema = ListTasksInputSchema;

  protected async execute(input: ListTasksInput, bot: Bot): Promise<ListTasksOutput> {
    const { status, allBots } = input;
    const botUsername = allBots ? undefined : bot.username;

    let tasks = botUsername
      ? backgroundTaskManager.getTasksForBot(botUsername)
      : backgroundTaskManager.getAllTasks();

    // Filter by status if not 'all'
    if (status !== 'all') {
      tasks = tasks.filter(t => t.status === status);
    }

    const taskInfos: TaskInfo[] = tasks.map(t => ({
      id: t.id,
      name: t.name,
      botUsername: t.botUsername,
      status: t.status,
      progress: t.progress.percent,
      progressMessage: t.progress.message,
      startedAt: t.startedAt,
      duration: t.completedAt ? t.completedAt - t.startedAt : Date.now() - t.startedAt,
      error: t.error,
    }));

    // Sort by startedAt descending (most recent first)
    taskInfos.sort((a, b) => b.startedAt - a.startedAt);

    return {
      ok: true,
      tasks: taskInfos,
      summary: backgroundTaskManager.getTaskSummary(botUsername),
    };
  }
}

// ============================================================================
// Get Task Status Tool
// ============================================================================

const GetTaskStatusInputSchema = BaseInputSchema.extend({
  taskId: z.string().describe('The task ID to get status for'),
});

type GetTaskStatusInput = z.infer<typeof GetTaskStatusInputSchema>;

interface GetTaskStatusOutput {
  ok: boolean;
  found: boolean;
  task?: TaskInfo & { result?: unknown };
}

export class GetTaskStatusTool extends BaseTool<GetTaskStatusInput, GetTaskStatusOutput> {
  readonly name = 'getTaskStatus';
  readonly description = 'Get detailed status of a specific background task';
  readonly category = 'utility' as const;
  readonly inputSchema = GetTaskStatusInputSchema;

  protected async execute(input: GetTaskStatusInput, _bot: Bot): Promise<GetTaskStatusOutput> {
    const { taskId } = input;
    const task = backgroundTaskManager.getTask(taskId);

    if (!task) {
      return { ok: true, found: false };
    }

    return {
      ok: true,
      found: true,
      task: {
        id: task.id,
        name: task.name,
        botUsername: task.botUsername,
        status: task.status,
        progress: task.progress.percent,
        progressMessage: task.progress.message,
        startedAt: task.startedAt,
        duration: task.completedAt ? task.completedAt - task.startedAt : Date.now() - task.startedAt,
        error: task.error,
        result: task.result,
      },
    };
  }
}

// ============================================================================
// Cancel Task Tool
// ============================================================================

const CancelTaskInputSchema = BaseInputSchema.extend({
  taskId: z.string().optional().describe('Specific task ID to cancel'),
  cancelAll: z.boolean().optional().default(false).describe('Cancel all running tasks for this bot'),
});

type CancelTaskInput = z.infer<typeof CancelTaskInputSchema>;

interface CancelTaskOutput {
  ok: boolean;
  cancelled: number;
  message: string;
}

export class CancelTaskTool extends BaseTool<CancelTaskInput, CancelTaskOutput> {
  readonly name = 'cancelTask';
  readonly description = 'Cancel a running background task or all tasks for this bot';
  readonly category = 'utility' as const;
  readonly inputSchema = CancelTaskInputSchema;

  protected async execute(input: CancelTaskInput, bot: Bot): Promise<CancelTaskOutput> {
    const { taskId, cancelAll } = input;

    if (cancelAll) {
      const cancelled = backgroundTaskManager.cancelAllTasksForBot(bot.username);
      return {
        ok: true,
        cancelled,
        message: cancelled > 0
          ? `Cancelled ${cancelled} task(s)`
          : 'No running tasks to cancel',
      };
    }

    if (!taskId) {
      return {
        ok: false,
        cancelled: 0,
        message: 'Provide either taskId or set cancelAll to true',
      };
    }

    const success = backgroundTaskManager.cancelTask(taskId);
    return {
      ok: success,
      cancelled: success ? 1 : 0,
      message: success ? `Task ${taskId} cancelled` : `Task ${taskId} not found or already completed`,
    };
  }
}
