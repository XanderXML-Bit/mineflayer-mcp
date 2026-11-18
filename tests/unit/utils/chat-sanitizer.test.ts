/**
 * Tests for chat sanitizer utility
 */

import { describe, it, expect } from 'vitest';
import {
  sanitizeMessage,
  validateBuildCommand,
  isBlockedCommand,
  isValidBuildCommand,
  BLOCKED_COMMANDS,
  ALLOWED_BUILD_COMMANDS,
} from '../../../src/utils/chat-sanitizer.js';

describe('Chat Sanitizer', () => {
  describe('isBlockedCommand', () => {
    it('should block dangerous admin commands', () => {
      expect(isBlockedCommand('/op player')).toBe(true);
      expect(isBlockedCommand('/deop player')).toBe(true);
      expect(isBlockedCommand('/ban player')).toBe(true);
      expect(isBlockedCommand('/kick player')).toBe(true);
      expect(isBlockedCommand('/stop')).toBe(true);
      expect(isBlockedCommand('/execute as @a run say hi')).toBe(true);
    });

    it('should not block regular messages', () => {
      expect(isBlockedCommand('hello world')).toBe(false);
      expect(isBlockedCommand('/say hello everyone')).toBe(false);
      expect(isBlockedCommand('/msg player hi')).toBe(false);
    });

    it('should block player manipulation commands', () => {
      expect(isBlockedCommand('/tp 100 64 100')).toBe(true);
      expect(isBlockedCommand('/give player diamond')).toBe(true);
      expect(isBlockedCommand('/kill player')).toBe(true);
      expect(isBlockedCommand('/gamemode creative')).toBe(true);
    });

    it('should handle case insensitivity', () => {
      expect(isBlockedCommand('/OP player')).toBe(true);
      expect(isBlockedCommand('/STOP')).toBe(true);
      expect(isBlockedCommand('/Ban player')).toBe(true);
    });

    it('should match command prefix not substring', () => {
      expect(isBlockedCommand('/operate machine')).toBe(false); // starts with /op but not the command
      expect(isBlockedCommand('/stopwatch')).toBe(false); // starts with /stop but not the command
    });
  });

  describe('isValidBuildCommand', () => {
    it('should allow building commands', () => {
      expect(isValidBuildCommand('/fill 0 0 0 10 10 10 stone')).toBe(true);
      expect(isValidBuildCommand('/setblock 0 64 0 diamond_block')).toBe(true);
      expect(isValidBuildCommand('/clone 0 0 0 10 10 10 100 100 100')).toBe(true);
      expect(isValidBuildCommand('/place block stone 0 64 0')).toBe(true);
    });

    it('should block summon command for security', () => {
      // /summon removed from allowed build commands - can spawn dangerous entities
      expect(isValidBuildCommand('/summon armor_stand 0 64 0')).toBe(false);
      expect(isValidBuildCommand('/summon tnt 0 64 0')).toBe(false);
    });

    it('should reject non-building commands', () => {
      expect(isValidBuildCommand('/tp 100 64 100')).toBe(false);
      expect(isValidBuildCommand('/give player diamond')).toBe(false);
      expect(isValidBuildCommand('/gamemode creative')).toBe(false);
    });

    it('should require command prefix', () => {
      expect(isValidBuildCommand('fill 0 0 0 10 10 10 stone')).toBe(false);
    });
  });

  describe('sanitizeMessage', () => {
    it('should pass valid messages', () => {
      const result = sanitizeMessage('Hello world!');
      expect(result.valid).toBe(true);
      expect(result.message).toBe('Hello world!');
    });

    it('should reject empty messages', () => {
      expect(sanitizeMessage('').valid).toBe(false);
      expect(sanitizeMessage('   ').valid).toBe(false);
    });

    it('should reject blocked commands', () => {
      const result = sanitizeMessage('/op badplayer');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('blocked');
    });

    it('should enforce length limits', () => {
      const longMessage = 'a'.repeat(300);
      const result = sanitizeMessage(longMessage);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too long');
    });

    it('should allow custom length limits', () => {
      const message = 'a'.repeat(50);
      const result = sanitizeMessage(message, { maxLength: 30 });
      expect(result.valid).toBe(false);
    });

    it('should strip control characters', () => {
      const result = sanitizeMessage('Hello\x00World');
      expect(result.valid).toBe(true);
      expect(result.message).toBe('HelloWorld');
    });

    it('should optionally disallow commands', () => {
      // Use /say which is not blocked but tests the allowCommands: false option
      const result = sanitizeMessage('/say hello', { allowCommands: false });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not allowed');
    });

    it('should reject blocked commands regardless of allowCommands setting', () => {
      const result = sanitizeMessage('/tp 100 64 100');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('blocked');
    });
  });

  describe('validateBuildCommand', () => {
    it('should accept valid build commands', () => {
      const result = validateBuildCommand('/fill 0 0 0 10 10 10 stone');
      expect(result.valid).toBe(true);
      expect(result.message).toBe('/fill 0 0 0 10 10 10 stone');
    });

    it('should reject non-build commands', () => {
      const result = validateBuildCommand('/op player');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Only these commands are allowed');
    });

    it('should reject non-commands', () => {
      const result = validateBuildCommand('fill 0 0 0 10 10 10 stone');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must start with /');
    });

    it('should trim whitespace', () => {
      const result = validateBuildCommand('  /fill 0 0 0 10 10 10 stone  ');
      expect(result.valid).toBe(true);
      expect(result.message).toBe('/fill 0 0 0 10 10 10 stone');
    });
  });

  describe('command lists', () => {
    it('should have all expected blocked commands', () => {
      expect(BLOCKED_COMMANDS).toContain('/op');
      expect(BLOCKED_COMMANDS).toContain('/ban');
      expect(BLOCKED_COMMANDS).toContain('/stop');
      expect(BLOCKED_COMMANDS).toContain('/execute');
    });

    it('should have building commands in allowed list', () => {
      expect(ALLOWED_BUILD_COMMANDS).toContain('/fill');
      expect(ALLOWED_BUILD_COMMANDS).toContain('/setblock');
      expect(ALLOWED_BUILD_COMMANDS).toContain('/clone');
    });
  });
});
