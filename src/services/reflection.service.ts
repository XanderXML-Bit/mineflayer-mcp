/**
 * Reflection Service
 *
 * Helps the AI learn from its outcomes by tracking successes, failures, and patterns.
 * Inspired by Voyager's self-verification and critic agent concepts.
 */

import { existsSync, readFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { logger } from '../utils/logger.js';
import { getSkillLibrary } from './skill-library.service.js';
import { atomicWriteFile } from '../utils/atomic-file.js';

const log = logger.child('reflection');

/**
 * A recorded task outcome
 */
export interface TaskOutcome {
  id: string;
  timestamp: number;
  task: string;
  goal?: string;
  success: boolean;
  duration: number; // milliseconds
  toolsUsed: string[];
  skillUsed?: string;
  failureReason?: string;
  failureCategory?: FailureCategory;
  context: Record<string, unknown>;
  lessonsLearned?: string[];
}

/**
 * Categories of failures for pattern analysis
 */
export type FailureCategory =
  | 'resource_missing'     // Didn't have required items
  | 'tool_broken'          // Tool ran out of durability
  | 'mob_attack'           // Killed by hostile mob
  | 'environmental'        // Lava, fall, drowning
  | 'navigation_failed'    // Couldn't find path
  | 'timeout'              // Took too long
  | 'inventory_full'       // No space for items
  | 'target_not_found'     // Block/entity not found
  | 'permission_denied'    // Protected area
  | 'unknown';             // Uncategorized failure

/**
 * Aggregated statistics about task outcomes
 */
export interface ReflectionStats {
  totalTasks: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  averageDuration: number;
  failuresByCategory: Record<FailureCategory, number>;
  mostUsedTools: { tool: string; count: number }[];
  mostSuccessfulTasks: { task: string; successRate: number; count: number }[];
  mostFailedTasks: { task: string; failureRate: number; count: number }[];
  recentLessons: string[];
}

/**
 * Insight from pattern analysis
 */
export interface Insight {
  type: 'warning' | 'tip' | 'pattern';
  message: string;
  relevantTo?: string[];
  confidence: number;
}

const DEFAULT_DATA_PATH = './data/reflections.json';
const MAX_OUTCOMES = 500;
const MAX_LESSONS = 50;

/**
 * Reflection Service Class
 */
export class ReflectionService {
  private outcomes: TaskOutcome[] = [];
  private lessons: string[] = [];
  private lessonsSet: Set<string> = new Set(); // O(1) deduplication lookup
  private dataPath: string;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor(dataPath: string = DEFAULT_DATA_PATH) {
    this.dataPath = dataPath;
    this.load();
    log.info('Reflection service initialized', { outcomes: this.outcomes.length });
  }

  /**
   * Load outcomes from disk
   */
  private load(): void {
    try {
      if (existsSync(this.dataPath)) {
        const data = JSON.parse(readFileSync(this.dataPath, 'utf-8'));
        this.outcomes = data.outcomes ?? [];
        this.lessons = data.lessons ?? [];
        // Rebuild Set from loaded lessons for O(1) lookup
        this.lessonsSet = new Set(this.lessons);
      }
    } catch (error) {
      log.warn('Failed to load reflections', { error });
      this.outcomes = [];
      this.lessons = [];
      this.lessonsSet = new Set();
    }
  }

  /**
   * Save outcomes to disk (debounced)
   */
  private scheduleSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.saveAsync().catch(error => {
        log.error('Failed to save reflections', { error });
      });
    }, 5000);
  }

  /**
   * Save outcomes to disk asynchronously using atomic writes
   */
  private async saveAsync(): Promise<void> {
    try {
      const dir = dirname(this.dataPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      await atomicWriteFile(
        this.dataPath,
        JSON.stringify({ outcomes: this.outcomes, lessons: this.lessons })
      );
      log.debug('Reflections saved', { outcomeCount: this.outcomes.length });
    } catch (error) {
      log.error('Failed to save reflections', { error });
    }
  }

  /**
   * Record a task outcome
   */
  recordOutcome(outcome: Omit<TaskOutcome, 'id' | 'timestamp'>): TaskOutcome {
    const recorded: TaskOutcome = {
      ...outcome,
      id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    };

    // Categorize failure if not provided
    if (!recorded.success && !recorded.failureCategory && recorded.failureReason) {
      recorded.failureCategory = this.categorizeFailure(recorded.failureReason);
    }

    this.outcomes.unshift(recorded);

    // Trim old outcomes
    if (this.outcomes.length > MAX_OUTCOMES) {
      this.outcomes = this.outcomes.slice(0, MAX_OUTCOMES);
    }

    // Update skill library if a skill was used
    if (recorded.skillUsed) {
      const skillLib = getSkillLibrary();
      skillLib.recordOutcome(recorded.skillUsed, recorded.success);
    }

    // Extract lessons from failures (O(1) deduplication with Set)
    if (!recorded.success && recorded.lessonsLearned) {
      for (const lesson of recorded.lessonsLearned) {
        if (!this.lessonsSet.has(lesson)) {
          this.lessonsSet.add(lesson);
          this.lessons.unshift(lesson);
        }
      }
      // Trim old lessons and sync Set
      if (this.lessons.length > MAX_LESSONS) {
        const removed = this.lessons.splice(MAX_LESSONS);
        for (const r of removed) {
          this.lessonsSet.delete(r);
        }
      }
    }

    this.scheduleSave();
    log.info('Task outcome recorded', {
      task: recorded.task,
      success: recorded.success,
      duration: recorded.duration,
    });

    return recorded;
  }

  /**
   * Categorize a failure based on the reason text
   */
  private categorizeFailure(reason: string): FailureCategory {
    const r = reason.toLowerCase();

    if (r.includes('inventory') && (r.includes('full') || r.includes('space'))) {
      return 'inventory_full';
    }
    if (r.includes('missing') || r.includes('need') || r.includes("don't have")) {
      return 'resource_missing';
    }
    if (r.includes('durability') || r.includes('broke') || r.includes('broken')) {
      return 'tool_broken';
    }
    if (r.includes('killed') || r.includes('mob') || r.includes('attack') || r.includes('damage')) {
      return 'mob_attack';
    }
    if (r.includes('lava') || r.includes('fall') || r.includes('drown') || r.includes('fire')) {
      return 'environmental';
    }
    if (r.includes('path') || r.includes('navigate') || r.includes('stuck') || r.includes('blocked')) {
      return 'navigation_failed';
    }
    if (r.includes('timeout') || r.includes('too long') || r.includes('timed out')) {
      return 'timeout';
    }
    if (r.includes('not found') || r.includes('couldn\'t find') || r.includes('no ')) {
      return 'target_not_found';
    }
    if (r.includes('permission') || r.includes('protected') || r.includes('spawn')) {
      return 'permission_denied';
    }

    return 'unknown';
  }

  /**
   * Get recent outcomes
   */
  getRecentOutcomes(limit = 20): TaskOutcome[] {
    return this.outcomes.slice(0, limit);
  }

  /**
   * Get outcomes for a specific task
   */
  getOutcomesForTask(task: string, limit = 10): TaskOutcome[] {
    const taskLower = task.toLowerCase();
    return this.outcomes
      .filter((o) => o.task.toLowerCase().includes(taskLower))
      .slice(0, limit);
  }

  /**
   * Get statistics about recorded outcomes
   */
  getStats(): ReflectionStats {
    const successCount = this.outcomes.filter((o) => o.success).length;
    const totalTasks = this.outcomes.length;

    // Failure categories
    const failuresByCategory: Record<FailureCategory, number> = {
      resource_missing: 0,
      tool_broken: 0,
      mob_attack: 0,
      environmental: 0,
      navigation_failed: 0,
      timeout: 0,
      inventory_full: 0,
      target_not_found: 0,
      permission_denied: 0,
      unknown: 0,
    };

    for (const outcome of this.outcomes) {
      if (!outcome.success && outcome.failureCategory) {
        failuresByCategory[outcome.failureCategory]++;
      }
    }

    // Tool usage
    const toolCounts = new Map<string, number>();
    for (const outcome of this.outcomes) {
      for (const tool of outcome.toolsUsed) {
        toolCounts.set(tool, (toolCounts.get(tool) ?? 0) + 1);
      }
    }
    const mostUsedTools = Array.from(toolCounts.entries())
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Task success rates
    const taskStats = new Map<string, { success: number; total: number }>();
    for (const outcome of this.outcomes) {
      const stats = taskStats.get(outcome.task) ?? { success: 0, total: 0 };
      stats.total++;
      if (outcome.success) stats.success++;
      taskStats.set(outcome.task, stats);
    }

    const taskRates = Array.from(taskStats.entries())
      .filter(([_, stats]) => stats.total >= 2) // At least 2 attempts
      .map(([task, stats]) => ({
        task,
        successRate: stats.success / stats.total,
        failureRate: 1 - stats.success / stats.total,
        count: stats.total,
      }));

    const mostSuccessfulTasks = taskRates
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, 5)
      .map(({ task, successRate, count }) => ({ task, successRate, count }));

    const mostFailedTasks = taskRates
      .sort((a, b) => b.failureRate - a.failureRate)
      .slice(0, 5)
      .map(({ task, failureRate, count }) => ({ task, failureRate, count }));

    // Average duration
    const totalDuration = this.outcomes.reduce((sum, o) => sum + o.duration, 0);

    return {
      totalTasks,
      successCount,
      failureCount: totalTasks - successCount,
      successRate: totalTasks > 0 ? successCount / totalTasks : 0,
      averageDuration: totalTasks > 0 ? totalDuration / totalTasks : 0,
      failuresByCategory,
      mostUsedTools,
      mostSuccessfulTasks,
      mostFailedTasks,
      recentLessons: this.lessons.slice(0, 10),
    };
  }

  /**
   * Generate insights from patterns
   */
  getInsights(): Insight[] {
    const insights: Insight[] = [];
    const stats = this.getStats();

    // High failure rate warning
    if (stats.totalTasks >= 5 && stats.successRate < 0.5) {
      insights.push({
        type: 'warning',
        message: `Overall success rate is low (${Math.round(stats.successRate * 100)}%). Consider reviewing failed tasks.`,
        confidence: 0.9,
      });
    }

    // Resource missing pattern
    if (stats.failuresByCategory.resource_missing >= 3) {
      insights.push({
        type: 'pattern',
        message: 'Multiple failures due to missing resources. Consider gathering materials before complex tasks.',
        relevantTo: ['gathering', 'crafting', 'mining'],
        confidence: 0.85,
      });
    }

    // Tool durability pattern
    if (stats.failuresByCategory.tool_broken >= 2) {
      insights.push({
        type: 'tip',
        message: 'Tools breaking during tasks. Check durability before starting and craft backups.',
        relevantTo: ['mining', 'combat', 'farming'],
        confidence: 0.8,
      });
    }

    // Mob attack pattern
    if (stats.failuresByCategory.mob_attack >= 3) {
      insights.push({
        type: 'warning',
        message: 'Frequent deaths from mobs. Consider better armor, weapons, or working during day.',
        relevantTo: ['combat', 'exploration', 'mining'],
        confidence: 0.85,
      });
    }

    // Navigation issues
    if (stats.failuresByCategory.navigation_failed >= 3) {
      insights.push({
        type: 'pattern',
        message: 'Navigation failures are common. Try smaller movements or clearing obstacles.',
        relevantTo: ['movement', 'navigation'],
        confidence: 0.75,
      });
    }

    // Timeout pattern
    if (stats.failuresByCategory.timeout >= 3) {
      insights.push({
        type: 'tip',
        message: 'Tasks timing out. Break complex goals into smaller steps.',
        confidence: 0.8,
      });
    }

    // Environmental hazards
    if (stats.failuresByCategory.environmental >= 2) {
      insights.push({
        type: 'warning',
        message: 'Deaths from environmental hazards. Be careful around lava, water, and heights.',
        relevantTo: ['mining', 'nether', 'exploration'],
        confidence: 0.9,
      });
    }

    // Specific task failure patterns
    for (const failed of stats.mostFailedTasks) {
      if (failed.count >= 3 && failed.failureRate > 0.6) {
        insights.push({
          type: 'pattern',
          message: `"${failed.task}" has ${Math.round(failed.failureRate * 100)}% failure rate. Review approach or use different strategy.`,
          relevantTo: [failed.task],
          confidence: 0.7,
        });
      }
    }

    return insights;
  }

  /**
   * Get lessons learned
   */
  getLessons(): string[] {
    return [...this.lessons];
  }

  /**
   * Add a lesson manually
   */
  addLesson(lesson: string): void {
    if (!this.lessons.includes(lesson)) {
      this.lessons.unshift(lesson);
      if (this.lessons.length > MAX_LESSONS) {
        this.lessons = this.lessons.slice(0, MAX_LESSONS);
      }
      this.scheduleSave();
    }
  }

  /**
   * Clear all recorded data
   */
  clear(): void {
    this.outcomes = [];
    this.lessons = [];
    this.saveAsync().catch(error => {
      log.error('Failed to save after clear', { error });
    });
    log.info('Reflection data cleared');
  }

  /**
   * Shutdown and save
   */
  async shutdown(): Promise<void> {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    await this.saveAsync();
    log.info('Reflection service shutdown');
  }
}

// Singleton instance
let instance: ReflectionService | null = null;

/**
 * Get the reflection service singleton
 */
export function getReflectionService(): ReflectionService {
  if (!instance) {
    instance = new ReflectionService();
  }
  return instance;
}

/**
 * Record a task outcome (convenience export)
 */
export function recordTaskOutcome(
  outcome: Omit<TaskOutcome, 'id' | 'timestamp'>
): TaskOutcome {
  return getReflectionService().recordOutcome(outcome);
}

/**
 * Get reflection stats (convenience export)
 */
export function getReflectionStats(): ReflectionStats {
  return getReflectionService().getStats();
}

/**
 * Get insights (convenience export)
 */
export function getInsights(): Insight[] {
  return getReflectionService().getInsights();
}
