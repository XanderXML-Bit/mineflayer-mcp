/**
 * Tests for startup-check.ts
 */

import { describe, it, expect } from 'vitest';
import {
  runStartupChecks,
  validateConnectionParams,
} from '../../../src/utils/startup-check.js';

describe('Startup Check', () => {
  describe('runStartupChecks', () => {
    it('should return check results', () => {
      const result = runStartupChecks();

      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('checks');
      expect(Array.isArray(result.checks)).toBe(true);
    });

    it('should include Node.js version check', () => {
      const result = runStartupChecks();
      const nodeCheck = result.checks.find((c) => c.name === 'Node.js version');

      expect(nodeCheck).toBeDefined();
      expect(nodeCheck?.message).toContain('Node.js');
    });

    it('should include environment check', () => {
      const result = runStartupChecks();
      const envCheck = result.checks.find((c) => c.name === 'Environment');

      expect(envCheck).toBeDefined();
      expect(envCheck?.passed).toBe(true);
    });

    it('should include memory check', () => {
      const result = runStartupChecks();
      const memCheck = result.checks.find((c) => c.name === 'Memory');

      expect(memCheck).toBeDefined();
      expect(memCheck?.message).toContain('MB');
    });
  });

  describe('validateConnectionParams', () => {
    describe('valid parameters', () => {
      it('should accept valid username', () => {
        const result = validateConnectionParams({ username: 'TestBot' });
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should accept username with numbers', () => {
        const result = validateConnectionParams({ username: 'Bot123' });
        expect(result.valid).toBe(true);
      });

      it('should accept username with underscores', () => {
        const result = validateConnectionParams({ username: 'Test_Bot' });
        expect(result.valid).toBe(true);
      });

      it('should accept valid port', () => {
        const result = validateConnectionParams({ username: 'Bot', port: 25565 });
        expect(result.valid).toBe(true);
      });

      it('should accept valid host', () => {
        const result = validateConnectionParams({ username: 'Bot', host: 'localhost' });
        expect(result.valid).toBe(true);
      });
    });

    describe('invalid username', () => {
      it('should reject username shorter than 3 characters', () => {
        const result = validateConnectionParams({ username: 'AB' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Username must be at least 3 characters');
      });

      it('should reject username longer than 16 characters', () => {
        const result = validateConnectionParams({ username: 'ThisUsernameIsTooLong' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Username must be at most 16 characters');
      });

      it('should reject username with special characters', () => {
        const result = validateConnectionParams({ username: 'Bot@123' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Username can only contain letters, numbers, and underscores');
      });

      it('should reject username with spaces', () => {
        const result = validateConnectionParams({ username: 'Test Bot' });
        expect(result.valid).toBe(false);
      });

      it('should reject empty username', () => {
        const result = validateConnectionParams({ username: '' });
        expect(result.valid).toBe(false);
      });

      it('should reject undefined username', () => {
        const result = validateConnectionParams({});
        expect(result.valid).toBe(false);
      });
    });

    describe('invalid port', () => {
      it('should reject port 0', () => {
        const result = validateConnectionParams({ username: 'Bot', port: 0 });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Port must be between 1 and 65535');
      });

      it('should reject negative port', () => {
        const result = validateConnectionParams({ username: 'Bot', port: -1 });
        expect(result.valid).toBe(false);
      });

      it('should reject port above 65535', () => {
        const result = validateConnectionParams({ username: 'Bot', port: 70000 });
        expect(result.valid).toBe(false);
      });
    });

    describe('invalid host', () => {
      it('should reject empty host', () => {
        const result = validateConnectionParams({ username: 'Bot', host: '' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Host cannot be empty');
      });
    });

    describe('multiple errors', () => {
      it('should collect all errors', () => {
        const result = validateConnectionParams({
          username: 'A',
          port: 0,
          host: '',
        });
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(1);
      });
    });
  });
});
