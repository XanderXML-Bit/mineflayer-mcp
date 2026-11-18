/**
 * Goal Service
 *
 * Tracks what the AI is trying to accomplish across sessions.
 * Goals persist via MemoryService.
 */

import { getMemoryService } from './memory.service.js';
import { logger } from '../utils/logger.js';

const log = logger.child('goal-service');

export type GoalPriority = 'critical' | 'high' | 'normal' | 'low';
export type GoalStatus = 'active' | 'paused' | 'completed' | 'failed';

export interface Goal {
  id: string;
  description: string;
  priority: GoalPriority;
  status: GoalStatus;
  progress: number; // 0-100
  subgoals: string[];
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  failedAt?: number;
  failReason?: string;
  context: Record<string, unknown>;
}

const MEMORY_KEY = 'goals';
const MAX_GOAL_HISTORY = 50;

let goals: Goal[] = [];
let goalsById: Map<string, Goal> = new Map(); // O(1) lookup by ID
let initialized = false;

/**
 * Generate a unique goal ID
 */
function generateId(): string {
  return `g_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Initialize goal service - load from memory
 */
function ensureInitialized(): void {
  if (initialized) return;

  const memory = getMemoryService();
  const stored = memory.recall(MEMORY_KEY);
  if (stored && Array.isArray(stored.value)) {
    goals = stored.value;
    // Rebuild Map for O(1) lookup
    goalsById = new Map(goals.map(g => [g.id, g]));
  }
  initialized = true;
}

/**
 * Save goals to memory
 */
function saveToMemory(): void {
  const memory = getMemoryService();
  memory.remember(MEMORY_KEY, goals, 'task');
}

/**
 * Add a new goal
 */
export function addGoal(
  description: string,
  priority: GoalPriority = 'normal',
  context: Record<string, unknown> = {}
): Goal {
  ensureInitialized();

  const goal: Goal = {
    id: generateId(),
    description,
    priority,
    status: 'active',
    progress: 0,
    subgoals: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    context,
  };

  goals.unshift(goal);
  goalsById.set(goal.id, goal); // Add to Map for O(1) lookup

  // Trim old completed/failed goals if too many
  const activeGoals = goals.filter((g) => g.status === 'active' || g.status === 'paused');
  const historyGoals = goals.filter((g) => g.status === 'completed' || g.status === 'failed');
  if (historyGoals.length > MAX_GOAL_HISTORY) {
    const removedGoals = historyGoals.slice(MAX_GOAL_HISTORY);
    for (const g of removedGoals) {
      goalsById.delete(g.id);
    }
    goals = [...activeGoals, ...historyGoals.slice(0, MAX_GOAL_HISTORY)];
  }

  saveToMemory();
  log.info('Goal added', { id: goal.id, description, priority });

  return goal;
}

/**
 * Get a goal by ID
 */
export function getGoal(id: string): Goal | null {
  ensureInitialized();
  return goalsById.get(id) ?? null; // O(1) lookup
}

/**
 * Update a goal
 */
export function updateGoal(
  id: string,
  updates: Partial<Pick<Goal, 'description' | 'priority' | 'status' | 'progress' | 'subgoals' | 'context'>>
): Goal | null {
  ensureInitialized();

  const goal = goalsById.get(id); // O(1) lookup
  if (!goal) {
    return null;
  }

  if (updates.description !== undefined) goal.description = updates.description;
  if (updates.priority !== undefined) goal.priority = updates.priority;
  if (updates.status !== undefined) goal.status = updates.status;
  if (updates.progress !== undefined) goal.progress = Math.max(0, Math.min(100, updates.progress));
  if (updates.subgoals !== undefined) goal.subgoals = updates.subgoals;
  if (updates.context !== undefined) goal.context = { ...goal.context, ...updates.context };

  goal.updatedAt = Date.now();

  saveToMemory();
  log.debug('Goal updated', { id, updates });

  return goal;
}

/**
 * Complete a goal
 */
export function completeGoal(id: string): Goal | null {
  ensureInitialized();

  const goal = goalsById.get(id); // O(1) lookup
  if (!goal) {
    return null;
  }

  goal.status = 'completed';
  goal.progress = 100;
  goal.completedAt = Date.now();
  goal.updatedAt = Date.now();

  saveToMemory();
  log.info('Goal completed', { id, description: goal.description });

  return goal;
}

/**
 * Fail a goal
 */
export function failGoal(id: string, reason: string = 'unknown'): Goal | null {
  ensureInitialized();

  const goal = goalsById.get(id); // O(1) lookup
  if (!goal) {
    return null;
  }

  goal.status = 'failed';
  goal.failedAt = Date.now();
  goal.failReason = reason;
  goal.updatedAt = Date.now();

  saveToMemory();
  log.info('Goal failed', { id, description: goal.description, reason });

  return goal;
}

/**
 * Pause a goal
 */
export function pauseGoal(id: string): Goal | null {
  ensureInitialized();

  const goal = goalsById.get(id); // O(1) lookup
  if (!goal || goal.status !== 'active') {
    return null;
  }

  goal.status = 'paused';
  goal.updatedAt = Date.now();

  saveToMemory();
  log.debug('Goal paused', { id });

  return goal;
}

/**
 * Resume a paused goal
 */
export function resumeGoal(id: string): Goal | null {
  ensureInitialized();

  const goal = goalsById.get(id); // O(1) lookup
  if (!goal || goal.status !== 'paused') {
    return null;
  }

  goal.status = 'active';
  goal.updatedAt = Date.now();

  saveToMemory();
  log.debug('Goal resumed', { id });

  return goal;
}

/**
 * Delete a goal
 */
export function deleteGoal(id: string): boolean {
  ensureInitialized();

  const index = goals.findIndex((g) => g.id === id);
  if (index === -1) {
    return false;
  }

  goals.splice(index, 1);
  goalsById.delete(id); // Keep Map in sync
  saveToMemory();
  log.debug('Goal deleted', { id });

  return true;
}

/**
 * Get all active goals
 */
export function getActiveGoals(): Goal[] {
  ensureInitialized();
  return goals.filter((g) => g.status === 'active');
}

/**
 * Get all goals (active and paused)
 */
export function getPendingGoals(): Goal[] {
  ensureInitialized();
  return goals.filter((g) => g.status === 'active' || g.status === 'paused');
}

/**
 * Get goal history (completed and failed)
 */
export function getGoalHistory(limit: number = 20): Goal[] {
  ensureInitialized();
  return goals
    .filter((g) => g.status === 'completed' || g.status === 'failed')
    .slice(0, limit);
}

/**
 * Get all goals
 */
export function getAllGoals(): Goal[] {
  ensureInitialized();
  return [...goals];
}

/**
 * Get goals by priority
 */
export function getGoalsByPriority(priority: GoalPriority): Goal[] {
  ensureInitialized();
  return goals.filter((g) => g.priority === priority && g.status === 'active');
}

/**
 * Get goal statistics
 */
export function getGoalStats(): {
  activeCount: number;
  pausedCount: number;
  completedCount: number;
  failedCount: number;
  averageProgress: number;
} {
  ensureInitialized();

  const active = goals.filter((g) => g.status === 'active');
  const paused = goals.filter((g) => g.status === 'paused');
  const completed = goals.filter((g) => g.status === 'completed');
  const failed = goals.filter((g) => g.status === 'failed');

  const avgProgress = active.length > 0
    ? active.reduce((sum, g) => sum + g.progress, 0) / active.length
    : 0;

  return {
    activeCount: active.length,
    pausedCount: paused.length,
    completedCount: completed.length,
    failedCount: failed.length,
    averageProgress: Math.round(avgProgress),
  };
}

/**
 * Clear all goals
 */
export function clearAllGoals(): void {
  ensureInitialized();
  goals = [];
  goalsById.clear(); // Keep Map in sync
  saveToMemory();
  log.info('All goals cleared');
}

/**
 * Add a subgoal to an existing goal
 */
export function addSubgoal(goalId: string, subgoal: string): Goal | null {
  ensureInitialized();

  const goal = goalsById.get(goalId); // O(1) lookup
  if (!goal) {
    return null;
  }

  goal.subgoals.push(subgoal);
  goal.updatedAt = Date.now();

  saveToMemory();
  log.debug('Subgoal added', { goalId, subgoal });

  return goal;
}

/**
 * Remove a subgoal from an existing goal
 */
export function removeSubgoal(goalId: string, subgoalIndex: number): Goal | null {
  ensureInitialized();

  const goal = goalsById.get(goalId); // O(1) lookup
  if (!goal || subgoalIndex < 0 || subgoalIndex >= goal.subgoals.length) {
    return null;
  }

  goal.subgoals.splice(subgoalIndex, 1);
  goal.updatedAt = Date.now();

  saveToMemory();
  log.debug('Subgoal removed', { goalId, subgoalIndex });

  return goal;
}
