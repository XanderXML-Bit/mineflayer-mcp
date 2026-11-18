/**
 * Memory Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MemoryService,
  
  shutdownMemoryService,
  remember,
  recall,
  forget,
  getMemoryService,
} from '../../../src/services/memory.service.js';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('MemoryService', () => {
  // Each test owns a fresh temporary directory, so parallel suites never share files.
  let testDir: string;
  let service: MemoryService;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'mc-mcp-memory-'));
    service = new MemoryService(testDir);
    // Clear any leftover data from previous tests
    service.clear();
  });

  afterEach(() => {
    service.shutdown();
    rmSync(testDir, { recursive: true });
  });

  describe('remember and recall', () => {
    it('should store and retrieve a value', () => {
      service.remember('test-key', 'test-value', 'general');
      const entry = service.recall('test-key');

      expect(entry).not.toBeNull();
      expect(entry?.value).toBe('test-value');
      expect(entry?.category).toBe('general');
    });

    it('should return null for non-existent key', () => {
      const entry = service.recall('non-existent');
      expect(entry).toBeNull();
    });

    it('should overwrite existing value', () => {
      service.remember('key', 'value1', 'general');
      const result = service.remember('key', 'value2', 'general');

      expect(result.overwritten).toBe(true);
      expect(service.recall('key')?.value).toBe('value2');
    });

    it('should store complex objects', () => {
      const obj = { position: { x: 100, y: 64, z: -50 }, items: ['diamond', 'iron'] };
      service.remember('complex', obj, 'spatial');

      const entry = service.recall('complex');
      expect(entry?.value).toEqual(obj);
    });

    it('should store with metadata', () => {
      service.remember('with-meta', 'value', 'task', { priority: 'high' });
      const entry = service.recall('with-meta');

      expect(entry?.metadata).toEqual({ priority: 'high' });
    });
  });

  describe('forget', () => {
    it('should delete a value', () => {
      service.remember('to-delete', 'value', 'general');
      const result = service.forget('to-delete');

      expect(result).toBe(true);
      expect(service.recall('to-delete')).toBeNull();
    });

    it('should return false for non-existent key', () => {
      const result = service.forget('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('list', () => {
    it('should list all entries', () => {
      service.remember('key1', 'value1', 'general');
      service.remember('key2', 'value2', 'spatial');
      service.remember('key3', 'value3', 'task');

      const entries = service.list();
      expect(entries.length).toBe(3);
    });

    it('should filter by category', () => {
      service.remember('key1', 'value1', 'general');
      service.remember('key2', 'value2', 'spatial');
      service.remember('key3', 'value3', 'spatial');

      const entries = service.list('spatial');
      expect(entries.length).toBe(2);
      expect(entries.every((e) => e.category === 'spatial')).toBe(true);
    });

    it('should respect limit', () => {
      for (let i = 0; i < 10; i++) {
        service.remember(`key${i}`, `value${i}`, 'general');
      }

      const entries = service.list(undefined, 5);
      expect(entries.length).toBe(5);
    });
  });

  describe('search', () => {
    it('should search by key', () => {
      service.remember('home-base', 'location1', 'spatial');
      service.remember('mining-spot', 'location2', 'spatial');

      const results = service.search('home');
      expect(results.length).toBe(1);
      expect(results[0].key).toBe('home-base');
    });

    it('should search by string value', () => {
      service.remember('key1', 'diamond ore found', 'resource');
      service.remember('key2', 'iron ingots', 'resource');

      const results = service.search('diamond');
      expect(results.length).toBe(1);
    });
  });

  describe('keys and count', () => {
    it('should return all keys', () => {
      service.remember('a', 1, 'general');
      service.remember('b', 2, 'general');

      const keys = service.keys();
      expect(keys).toContain('a');
      expect(keys).toContain('b');
    });

    it('should count entries', () => {
      service.remember('a', 1, 'general');
      service.remember('b', 2, 'spatial');

      expect(service.count()).toBe(2);
      expect(service.count('general')).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear all entries', () => {
      service.remember('a', 1, 'general');
      service.remember('b', 2, 'spatial');

      const cleared = service.clear();
      expect(cleared).toBe(2);
      expect(service.count()).toBe(0);
    });

    it('should clear by category', () => {
      service.remember('a', 1, 'general');
      service.remember('b', 2, 'spatial');
      service.remember('c', 3, 'spatial');

      const cleared = service.clear('spatial');
      expect(cleared).toBe(2);
      expect(service.count()).toBe(1);
    });
  });
});

describe('Convenience functions', () => {
  // Seed the singleton with an owned temporary directory instead of the default ./data path.
  let testDir: string;

  beforeEach(() => {
    shutdownMemoryService();
    testDir = mkdtempSync(join(tmpdir(), 'mc-mcp-memory-singleton-'));
    getMemoryService(testDir);
  });

  afterEach(() => {
    shutdownMemoryService();
    rmSync(testDir, { recursive: true });
  });

  it('should remember and recall via convenience functions', () => {
    remember('conv-key', { data: 'test' }, 'general');
    const value = recall<{ data: string }>('conv-key');

    expect(value).toEqual({ data: 'test' });
  });

  it('should forget via convenience function', () => {
    remember('to-forget', 'value', 'general');
    const result = forget('to-forget');

    expect(result).toBe(true);
    expect(recall('to-forget')).toBeNull();
  });

  it('should return null for missing key', () => {
    const value = recall('missing');
    expect(value).toBeNull();
  });
});
