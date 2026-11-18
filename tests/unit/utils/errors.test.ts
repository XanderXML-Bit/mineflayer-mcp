/**
 * Tests for error handling utilities
 */

import { describe, it, expect, vi } from 'vitest';
import {
  MCPError,
  NoBotError,
  BotNotFoundError,
  TaskRunningError,
  TimeoutError,
  
  
  BotDiedError,
  classifyError,
  withRetry,
  createErrorResult,
} from '../../../src/utils/errors.js';
import { ErrorCategory } from '../../../src/types/index.js';

describe('Error Classes', () => {
  describe('MCPError', () => {
    it('should create error with code and category', () => {
      const error = new MCPError('Test error', 'TEST_CODE', ErrorCategory.TRANSIENT);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.category).toBe(ErrorCategory.TRANSIENT);
      expect(error.name).toBe('MCPError');
    });
  });

  describe('NoBotError', () => {
    it('should have correct message and category', () => {
      const error = new NoBotError();
      expect(error.message).toBe('No active bots. Use joinGame first.');
      expect(error.code).toBe('NO_BOT');
      expect(error.category).toBe(ErrorCategory.RESOURCE);
    });
  });

  describe('BotNotFoundError', () => {
    it('should include username in message', () => {
      const error = new BotNotFoundError('TestBot');
      expect(error.message).toBe("Bot 'TestBot' not found");
      expect(error.code).toBe('BOT_NOT_FOUND');
    });
  });

  describe('TaskRunningError', () => {
    it('should have correct category for retry', () => {
      const error = new TaskRunningError();
      expect(error.category).toBe(ErrorCategory.TRANSIENT);
    });
  });

  describe('TimeoutError', () => {
    it('should include operation and duration', () => {
      const error = new TimeoutError('navigation', 5000);
      expect(error.message).toBe("Operation 'navigation' timed out after 5000ms");
      expect(error.category).toBe(ErrorCategory.TIMEOUT);
    });
  });

  describe('BotDiedError', () => {
    it('should be fatal category', () => {
      const error = new BotDiedError();
      expect(error.category).toBe(ErrorCategory.FATAL);
    });
  });
});

describe('classifyError', () => {
  it('should classify MCPError correctly', () => {
    const error = new TaskRunningError();
    const classified = classifyError(error);
    expect(classified.category).toBe(ErrorCategory.TRANSIENT);
    expect(classified.retryable).toBe(true);
  });

  it('should classify navigation timeout as retryable', () => {
    const error = new Error('navigation_timeout');
    const classified = classifyError(error);
    expect(classified.category).toBe(ErrorCategory.TIMEOUT);
    expect(classified.retryable).toBe(true);
    expect(classified.maxRetries).toBe(2);
  });

  it('should classify bot_died as fatal', () => {
    const error = new Error('bot_died');
    const classified = classifyError(error);
    expect(classified.category).toBe(ErrorCategory.FATAL);
    expect(classified.retryable).toBe(false);
  });

  it('should classify another_task_running as transient', () => {
    const error = new Error('another_task_running');
    const classified = classifyError(error);
    expect(classified.category).toBe(ErrorCategory.TRANSIENT);
    expect(classified.retryable).toBe(true);
    expect(classified.maxRetries).toBe(3);
  });

  it('should classify missing tool as resource error', () => {
    const error = new Error('no_pickaxe available');
    const classified = classifyError(error);
    expect(classified.category).toBe(ErrorCategory.RESOURCE);
    expect(classified.retryable).toBe(false);
  });

  it('should classify unknown errors as recoverable', () => {
    const error = new Error('some random error');
    const classified = classifyError(error);
    expect(classified.category).toBe(ErrorCategory.RECOVERABLE);
    expect(classified.retryable).toBe(true);
  });
});

describe('withRetry', () => {
  it('should succeed on first try', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on transient failure', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('another_task_running'))
      .mockResolvedValueOnce('success');

    const result = await withRetry(fn, { baseDelayMs: 10, maxRetries: 3 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should not retry fatal errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('bot_died'));

    await expect(withRetry(fn, { baseDelayMs: 10 })).rejects.toThrow('bot_died');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should call onRetry callback', async () => {
    const onRetry = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('another_task_running'))
      .mockResolvedValueOnce('success');

    await withRetry(fn, { baseDelayMs: 10, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Object));
  });

  it('should throw after max retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('another_task_running'));

    await expect(withRetry(fn, { baseDelayMs: 10, maxRetries: 2 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
  });
});

describe('createErrorResult', () => {
  it('should create error result from string', () => {
    const result = createErrorResult('Something went wrong');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Something went wrong');
  });

  it('should create error result from Error', () => {
    const error = new Error('Test error');
    const result = createErrorResult(error);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Test error');
  });

  it('should include code from MCPError', () => {
    const error = new NoBotError();
    const result = createErrorResult(error);
    expect(result.code).toBe('NO_BOT');
  });

  it('should use provided code', () => {
    const result = createErrorResult('Error', 'CUSTOM_CODE');
    expect(result.code).toBe('CUSTOM_CODE');
  });
});
