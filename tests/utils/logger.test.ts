/**
 * Tests for logger utility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock console.error before importing logger
const mockConsoleError = vi.fn();
const originalConsoleError = console.error;

beforeEach(() => {
  console.error = mockConsoleError;
  mockConsoleError.mockClear();
});

afterEach(() => {
  console.error = originalConsoleError;
});

describe('Logger', () => {
  describe('Error Serialization', () => {
    it('should serialize basic Error objects', async () => {
      // Dynamic import to get fresh logger after mocking console
      const { logger } = await import('../../src/utils/logger.js');

      const error = new Error('Test error message');
      logger.error('An error occurred', { error });

      expect(mockConsoleError).toHaveBeenCalled();
      const loggedMessage = mockConsoleError.mock.calls[0][0];

      // Should contain the error name
      expect(loggedMessage).toContain('Error');
      // Should contain the message
      expect(loggedMessage).toContain('Test error message');
    });

    it('should serialize Error with custom properties', async () => {
      const { logger } = await import('../../src/utils/logger.js');

      const error = new Error('Custom error');
      (error as any).code = 'ENOENT';
      (error as any).path = '/some/path';

      logger.error('File error', { error });

      expect(mockConsoleError).toHaveBeenCalled();
      const loggedMessage = mockConsoleError.mock.calls[0][0];

      // Should contain custom properties
      expect(loggedMessage).toContain('ENOENT');
      expect(loggedMessage).toContain('/some/path');
    });

    it('should serialize nested errors', async () => {
      const { logger } = await import('../../src/utils/logger.js');

      const innerError = new Error('Inner error');
      const outerError = new Error('Outer error');
      (outerError as any).cause = innerError;

      logger.error('Nested error', { error: outerError });

      expect(mockConsoleError).toHaveBeenCalled();
      const loggedMessage = mockConsoleError.mock.calls[0][0];

      // Should contain both error messages
      expect(loggedMessage).toContain('Outer error');
      expect(loggedMessage).toContain('Inner error');
    });

    it('should handle errors in data object', async () => {
      const { logger } = await import('../../src/utils/logger.js');

      const error = new Error('Nested in object');

      logger.error('Error data', { someKey: 'someValue', nested: { error } });

      expect(mockConsoleError).toHaveBeenCalled();
      const loggedMessage = mockConsoleError.mock.calls[0][0];

      expect(loggedMessage).toContain('Nested in object');
      expect(loggedMessage).toContain('someValue');
    });

    it('should handle arrays with errors', async () => {
      const { logger } = await import('../../src/utils/logger.js');

      const errors = [new Error('First'), new Error('Second')];

      logger.error('Multiple errors', { errors });

      expect(mockConsoleError).toHaveBeenCalled();
      const loggedMessage = mockConsoleError.mock.calls[0][0];

      expect(loggedMessage).toContain('First');
      expect(loggedMessage).toContain('Second');
    });

    it('should not produce empty object {} for Error', async () => {
      const { logger } = await import('../../src/utils/logger.js');

      const error = new Error('Should not be empty');
      logger.error('Error test', { error });

      expect(mockConsoleError).toHaveBeenCalled();
      const loggedMessage = mockConsoleError.mock.calls[0][0];

      // The message should NOT contain just {}
      // It should contain actual error info
      expect(loggedMessage).toContain('Should not be empty');
      expect(loggedMessage).not.toMatch(/"error":\s*\{\s*\}/);
    });
  });
});
