/**
 * Memory Service
 *
 * Persistent key-value storage for the AI agent.
 * Stores spatial memory, resource locations, entity info, and task history.
 * Auto-saves to disk (JSON file) for persistence across sessions.
 *
 * Features:
 * - Atomic file writes to prevent corruption
 * - Mutex protection for concurrent access
 * - Key sanitization for security
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { logger } from '../utils/logger.js';
import { atomicWriteFile, AsyncMutex } from '../utils/atomic-file.js';

const log = logger.child('memory-service');

/** Keys that are dangerous due to prototype pollution */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Pattern for valid memory keys - allows alphanumeric, underscore, dash, colon, dot, comma */
const KEY_PATTERN = /^[a-zA-Z0-9_.:.@,-]+$/;

/**
 * Sanitize a memory key to prevent prototype pollution
 */
function sanitizeKey(key: string): string {
  if (DANGEROUS_KEYS.has(key.toLowerCase())) {
    throw new Error(`Invalid memory key: ${key} (reserved name)`);
  }

  if (!KEY_PATTERN.test(key)) {
    throw new Error(`Memory key contains invalid characters: ${key}`);
  }

  if (key.length > 256) {
    throw new Error('Memory key too long (max 256 characters)');
  }

  return key;
}

/** Memory categories for organization */
export type MemoryCategory = 'spatial' | 'resource' | 'entity' | 'task' | 'general';

/** A single memory entry */
export interface MemoryEntry {
  key: string;
  value: unknown;
  category: MemoryCategory;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/** The memory store structure saved to disk */
interface MemoryStore {
  version: string;
  entries: Record<string, MemoryEntry>;
  lastSaved: number;
}

/** Default memory file path */
const DEFAULT_MEMORY_PATH = './data/memory.json';

/** Auto-save interval in milliseconds */
const AUTO_SAVE_INTERVAL = 30000; // 30 seconds

/**
 * Memory Service for persistent key-value storage
 */
export class MemoryService {
  private store: MemoryStore;
  private filePath: string;
  private dirty: boolean = false;
  private saveInterval: ReturnType<typeof setInterval> | null = null;
  private saveMutex: AsyncMutex = new AsyncMutex();
  private pendingSave: boolean = false;
  private saveInProgress: boolean = false;

  constructor(dataDir?: string) {
    this.filePath = dataDir ? join(dataDir, 'memory.json') : DEFAULT_MEMORY_PATH;
    this.store = this.loadFromDisk();
    this.startAutoSave();

    log.info('Memory service initialized', {
      path: this.filePath,
      entries: Object.keys(this.store.entries).length,
    });
  }

  /**
   * Store a value in memory
   */
  remember(
    key: string,
    value: unknown,
    category: MemoryCategory = 'general',
    metadata?: Record<string, unknown>
  ): { overwritten: boolean } {
    // Sanitize key to prevent prototype pollution
    const safeKey = sanitizeKey(key);
    const overwritten = safeKey in this.store.entries;

    this.store.entries[safeKey] = {
      key: safeKey,
      value,
      category,
      timestamp: Date.now(),
      metadata,
    };

    this.dirty = true;
    log.debug('Memory stored', { key: safeKey, category, overwritten });

    return { overwritten };
  }

  /**
   * Retrieve a value from memory
   */
  recall(key: string): MemoryEntry | null {
    try {
      const safeKey = sanitizeKey(key);
      return this.store.entries[safeKey] || null;
    } catch {
      // Invalid key format
      return null;
    }
  }

  /**
   * Delete a value from memory
   */
  forget(key: string): boolean {
    try {
      const safeKey = sanitizeKey(key);
      if (safeKey in this.store.entries) {
        delete this.store.entries[safeKey];
        this.dirty = true;
        log.debug('Memory forgotten', { key: safeKey });
        return true;
      }
    } catch {
      // Invalid key format
    }
    return false;
  }

  /**
   * List all memories, optionally filtered by category
   */
  list(category?: MemoryCategory, limit: number = 100): MemoryEntry[] {
    let entries = Object.values(this.store.entries);

    if (category) {
      entries = entries.filter((e) => e.category === category);
    }

    // Sort by timestamp (newest first)
    entries.sort((a, b) => b.timestamp - a.timestamp);

    return entries.slice(0, limit);
  }

  /**
   * Search memories by key pattern or value content
   */
  search(query: string, category?: MemoryCategory): MemoryEntry[] {
    const lowerQuery = query.toLowerCase();

    return Object.values(this.store.entries).filter((entry) => {
      // Filter by category if specified
      if (category && entry.category !== category) {
        return false;
      }

      // Search in key
      if (entry.key.toLowerCase().includes(lowerQuery)) {
        return true;
      }

      // Search in value (if string)
      if (typeof entry.value === 'string' && entry.value.toLowerCase().includes(lowerQuery)) {
        return true;
      }

      // Search in metadata
      if (entry.metadata) {
        const metaStr = JSON.stringify(entry.metadata).toLowerCase();
        if (metaStr.includes(lowerQuery)) {
          return true;
        }
      }

      return false;
    });
  }

  /**
   * Get all keys
   */
  keys(): string[] {
    return Object.keys(this.store.entries);
  }

  /**
   * Get count of entries
   */
  count(category?: MemoryCategory): number {
    if (category) {
      return Object.values(this.store.entries).filter((e) => e.category === category).length;
    }
    return Object.keys(this.store.entries).length;
  }

  /**
   * Clear all memories (optionally by category)
   */
  clear(category?: MemoryCategory): number {
    let cleared = 0;

    if (category) {
      for (const key of Object.keys(this.store.entries)) {
        if (this.store.entries[key].category === category) {
          delete this.store.entries[key];
          cleared++;
        }
      }
    } else {
      cleared = Object.keys(this.store.entries).length;
      this.store.entries = {};
    }

    if (cleared > 0) {
      this.dirty = true;
    }

    log.info('Memory cleared', { category, cleared });
    return cleared;
  }

  /**
   * Load memory from disk
   */
  private loadFromDisk(): MemoryStore {
    try {
      if (existsSync(this.filePath)) {
        const content = readFileSync(this.filePath, 'utf-8');
        const store = JSON.parse(content) as MemoryStore;

        // Validate structure
        if (store.entries && typeof store.entries === 'object') {
          log.debug('Loaded memory from disk', { entries: Object.keys(store.entries).length });
          return store;
        }
      }
    } catch (error) {
      log.warn('Failed to load memory from disk, starting fresh', { error });
    }

    // Return empty store
    return {
      version: '1.0',
      entries: {},
      lastSaved: Date.now(),
    };
  }

  /**
   * Save memory to disk (sync version for backwards compatibility)
   * Delegates to async version
   */
  saveToDisk(): void {
    // Queue an async save
    this.saveToDiskAsync().catch(error => {
      log.error('Failed to save memory to disk', { error });
    });
  }

  /**
   * Save memory to disk asynchronously with mutex protection
   * Uses atomic file writes to prevent corruption
   */
  async saveToDiskAsync(): Promise<void> {
    if (!this.dirty) {
      return;
    }

    // If a save is already in progress, mark that we need another save
    if (this.saveInProgress) {
      this.pendingSave = true;
      return;
    }

    // Acquire mutex for exclusive write access
    const release = await this.saveMutex.acquire();
    this.saveInProgress = true;

    try {
      // Ensure directory exists
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // Snapshot the data before async write (compact JSON for performance)
      this.store.lastSaved = Date.now();
      const snapshot = JSON.stringify(this.store);

      // Clear dirty flag before write (new changes will set it again)
      this.dirty = false;

      // Use atomic file write
      await atomicWriteFile(this.filePath, snapshot, { backup: true });

      log.debug('Memory saved to disk', { entries: Object.keys(this.store.entries).length });
    } catch (error) {
      // Restore dirty flag on failure
      this.dirty = true;
      log.error('Failed to save memory to disk', { error });
    } finally {
      this.saveInProgress = false;
      release();

      // If another save was requested while we were saving, do it now
      if (this.pendingSave) {
        this.pendingSave = false;
        await this.saveToDiskAsync();
      }
    }
  }

  /**
   * Start auto-save interval
   */
  private startAutoSave(): void {
    this.saveInterval = setInterval(() => {
      this.saveToDiskAsync().catch(error => {
        log.error('Auto-save failed', { error });
      });
    }, AUTO_SAVE_INTERVAL);
  }

  /**
   * Shutdown the memory service
   */
  shutdown(): void {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }

    // Final synchronous save for shutdown
    // Use sync version to ensure data is saved before process exits
    if (this.dirty) {
      try {
        const dir = dirname(this.filePath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        this.store.lastSaved = Date.now();
        writeFileSync(this.filePath, JSON.stringify(this.store), 'utf-8');
        this.dirty = false;
      } catch (error) {
        log.error('Failed to save on shutdown', { error });
      }
    }
    log.info('Memory service shutdown');
  }
}

// Singleton instance
let memoryServiceInstance: MemoryService | null = null;

/**
 * Get or create the memory service instance
 */
export function getMemoryService(dataDir?: string): MemoryService {
  if (!memoryServiceInstance) {
    memoryServiceInstance = new MemoryService(dataDir);
  }
  return memoryServiceInstance;
}

/**
 * Shutdown and clear the singleton instance
 */
export function shutdownMemoryService(): void {
  if (memoryServiceInstance) {
    memoryServiceInstance.shutdown();
    memoryServiceInstance = null;
  }
}

// Convenience functions for direct access

/**
 * Store a value in memory (convenience wrapper)
 */
export function remember(
  key: string,
  value: unknown,
  category: MemoryCategory = 'general',
  metadata?: Record<string, unknown>
): { overwritten: boolean } {
  return getMemoryService().remember(key, value, category, metadata);
}

/**
 * Retrieve a value from memory (convenience wrapper)
 * Returns the value directly, with type parameter support
 */
export function recall<T = unknown>(key: string, _category?: MemoryCategory): T | null {
  const entry = getMemoryService().recall(key);
  return entry ? (entry.value as T) : null;
}

/**
 * Delete a value from memory (convenience wrapper)
 */
export function forget(key: string, _category?: MemoryCategory): boolean {
  return getMemoryService().forget(key);
}
