/**
 * Atomic File Operations
 * Provides safe file writing with crash recovery
 */

import { writeFile, rename, unlink, readFile, access, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { randomBytes } from 'crypto';
import { constants } from 'fs';
import { logger } from './logger.js';

const log = logger.child('atomic-file');

/**
 * Write a file atomically by writing to a temp file first, then renaming.
 * This prevents file corruption if the process crashes during write.
 *
 * @param filePath - The target file path
 * @param data - The data to write
 * @param options - Optional settings
 */
export async function atomicWriteFile(
  filePath: string,
  data: string,
  options: { backup?: boolean } = {}
): Promise<void> {
  const dir = dirname(filePath);
  const tempPath = join(dir, `.${randomBytes(6).toString('hex')}.tmp`);

  try {
    // Ensure directory exists
    await mkdir(dir, { recursive: true });

    // Write to temp file first
    await writeFile(tempPath, data, 'utf-8');

    // Create backup if requested and file exists
    if (options.backup) {
      try {
        await access(filePath, constants.F_OK);
        const backupPath = `${filePath}.bak`;
        try {
          await rename(filePath, backupPath);
        } catch {
          // Backup failed, continue anyway
        }
      } catch {
        // File doesn't exist, no backup needed
      }
    }

    // Atomic rename (this is atomic on most filesystems)
    await rename(tempPath, filePath);
  } catch (error) {
    // Clean up temp file on error
    try {
      await unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Read a file with fallback to backup if the main file is corrupted
 *
 * @param filePath - The file path to read
 * @param validator - Optional function to validate the content
 * @returns The file content or null if not found/invalid
 */
export async function safeReadFile(
  filePath: string,
  validator?: (content: string) => boolean
): Promise<string | null> {
  // Try main file first
  try {
    const content = await readFile(filePath, 'utf-8');
    if (!validator || validator(content)) {
      return content;
    }
    log.warn('Main file failed validation, trying backup', { filePath });
  } catch {
    // Main file not found or unreadable
  }

  // Try backup file
  const backupPath = `${filePath}.bak`;
  try {
    const content = await readFile(backupPath, 'utf-8');
    if (!validator || validator(content)) {
      log.info('Restored from backup', { filePath });
      return content;
    }
  } catch {
    // Backup also not available
  }

  return null;
}

/**
 * Simple mutex for coordinating async operations
 */
export class AsyncMutex {
  private locked = false;
  private queue: Array<() => void> = [];

  /**
   * Acquire the mutex. Returns a release function.
   */
  async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const tryAcquire = () => {
        if (!this.locked) {
          this.locked = true;
          resolve(() => this.release());
        } else {
          this.queue.push(tryAcquire);
        }
      };
      tryAcquire();
    });
  }

  private release(): void {
    this.locked = false;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }

  /**
   * Check if mutex is currently locked
   */
  isLocked(): boolean {
    return this.locked;
  }
}
