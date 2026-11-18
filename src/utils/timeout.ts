/**
 * Timeout and timing utilities for Minecraft MCP
 */

import type { TimeoutsConfig } from '../types/index.js';
import { TimeoutError } from './errors.js';

/** Default timeout configuration */
const DEFAULT_TIMEOUTS: TimeoutsConfig = {
  navigation: 60000,
  navigationStall: 15000,
  mining: 120000,
  combat: 60000,
  crafting: 30000,
  smelting: 90000,
  collect: 30000,
  stallDetection: 20000,
};

/**
 * Adaptive timeout manager that adjusts timeouts based on server responsiveness
 */
export class AdaptiveTimeoutManager {
  private lagSamples: number[] = [];
  private successHistory: Map<string, number[]> = new Map();
  private config: TimeoutsConfig;
  private lastTickTime: number = Date.now();
  private readonly maxSamples = 50;
  private readonly maxHistorySamples = 10;
  private readonly maxHistoryKeys = 100; // LRU eviction limit

  constructor(config?: Partial<TimeoutsConfig>) {
    this.config = { ...DEFAULT_TIMEOUTS, ...config };
  }

  /**
   * Record a tick for lag monitoring
   */
  recordTick(): void {
    const now = Date.now();
    const delta = now - this.lastTickTime;
    this.lastTickTime = now;

    // Expected tick is ~50ms (20 TPS)
    const lag = Math.max(0, delta - 50);
    this.lagSamples.push(lag);

    if (this.lagSamples.length > this.maxSamples) {
      this.lagSamples.shift();
    }
  }

  /**
   * Get the average lag in milliseconds
   */
  getAverageLag(): number {
    if (this.lagSamples.length === 0) return 0;
    return this.lagSamples.reduce((a, b) => a + b, 0) / this.lagSamples.length;
  }

  /**
   * Get the lag multiplier for timeout adjustment
   */
  getLagMultiplier(): number {
    const avgLag = this.getAverageLag();

    // 0-50ms = 1.0x, 50-100ms = 1.5x, 100-200ms = 2.0x, 200+ = 3.0x
    if (avgLag < 50) return 1.0;
    if (avgLag < 100) return 1.5;
    if (avgLag < 200) return 2.0;
    return 3.0;
  }

  /**
   * Get an adaptive timeout for a specific operation
   */
  getTimeout(key: keyof TimeoutsConfig, explicitMs?: number): number {
    const baseValue = explicitMs ?? this.config[key] ?? DEFAULT_TIMEOUTS.navigation;

    // Apply lag multiplier
    const lagMultiplier = this.getLagMultiplier();

    // Apply success history adjustment
    const historyMultiplier = this.getHistoryMultiplier(key);

    const adjusted = baseValue * lagMultiplier * historyMultiplier;

    // Clamp to reasonable bounds
    const min = baseValue * 0.5;
    const max = baseValue * 4;

    return Math.max(min, Math.min(max, adjusted));
  }

  /**
   * Record a successful operation for history tracking
   */
  recordSuccess(key: string, durationMs: number): void {
    // LRU eviction: if map is full and key is new, remove oldest entry
    if (!this.successHistory.has(key) && this.successHistory.size >= this.maxHistoryKeys) {
      const firstKey = this.successHistory.keys().next().value;
      if (firstKey !== undefined) {
        this.successHistory.delete(firstKey);
      }
    }

    const history = this.successHistory.get(key) || [];
    history.push(durationMs);

    if (history.length > this.maxHistorySamples) {
      history.shift();
    }

    this.successHistory.set(key, history);
  }

  /**
   * Get the history multiplier for a specific operation
   */
  private getHistoryMultiplier(key: string): number {
    const history = this.successHistory.get(key);
    if (!history || history.length < 3) return 1.0;

    const avg = history.reduce((a, b) => a + b, 0) / history.length;
    const configKey = key as keyof TimeoutsConfig;
    const baseTimeout = (configKey in this.config ? this.config[configKey] : null) || DEFAULT_TIMEOUTS.navigation;

    // If operations consistently complete in less than 50% of base time, reduce timeout
    if (avg < baseTimeout * 0.5) return 0.8;
    return 1.0;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<TimeoutsConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): TimeoutsConfig {
    return { ...this.config };
  }
}

/**
 * Execute a function with a timeout
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  operationName: string = 'operation'
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new TimeoutError(operationName, timeoutMs));
    }, timeoutMs);

    fn()
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * Create a timeout promise that rejects after the specified duration
 */
export function createTimeout(ms: number, message?: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new TimeoutError(message || 'timeout', ms));
    }, ms);
  });
}

/**
 * Race a promise against a timeout
 */
export async function raceWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName?: string
): Promise<T> {
  return Promise.race([promise, createTimeout(timeoutMs, operationName)]);
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a deadline checker
 */
export function createDeadline(timeoutMs: number): {
  isExpired: () => boolean;
  remaining: () => number;
} {
  const deadline = Date.now() + timeoutMs;

  return {
    isExpired: () => Date.now() >= deadline,
    remaining: () => Math.max(0, deadline - Date.now()),
  };
}
