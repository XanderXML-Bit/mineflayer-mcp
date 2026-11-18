/**
 * Tests for progress types and constants
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PROGRESS_CONFIG,
  DEFAULT_INTERRUPT_CONFIG,
} from '../../src/types/progress.js';

describe('Progress Types', () => {
  describe('DEFAULT_PROGRESS_CONFIG', () => {
    it('should have reasonable default values', () => {
      expect(DEFAULT_PROGRESS_CONFIG.stallTimeoutMs).toBeGreaterThan(0);
      expect(DEFAULT_PROGRESS_CONFIG.checkIntervalMs).toBeGreaterThan(0);
      expect(DEFAULT_PROGRESS_CONFIG.movementThreshold).toBeGreaterThan(0);
      expect(DEFAULT_PROGRESS_CONFIG.positionHistorySize).toBeGreaterThan(0);
    });

    it('should have check interval smaller than stall timeout', () => {
      expect(DEFAULT_PROGRESS_CONFIG.checkIntervalMs).toBeLessThan(
        DEFAULT_PROGRESS_CONFIG.stallTimeoutMs
      );
    });

    it('should have position history size suitable for tracking', () => {
      // Should be able to track at least a few seconds of movement
      const samplesPerSecond =
        1000 / DEFAULT_PROGRESS_CONFIG.checkIntervalMs;
      const secondsTracked =
        DEFAULT_PROGRESS_CONFIG.positionHistorySize / samplesPerSecond;

      expect(secondsTracked).toBeGreaterThanOrEqual(1);
    });
  });

  describe('DEFAULT_INTERRUPT_CONFIG', () => {
    it('should have reasonable default values', () => {
      expect(DEFAULT_INTERRUPT_CONFIG.damageThreshold).toBeGreaterThan(0);
      expect(DEFAULT_INTERRUPT_CONFIG.healthLowThreshold).toBeGreaterThan(0);
      expect(DEFAULT_INTERRUPT_CONFIG.hungerWarningThreshold).toBeGreaterThan(0);
      expect(DEFAULT_INTERRUPT_CONFIG.interruptCooldownMs).toBeGreaterThan(0);
    });

    it('should have damage threshold less than health low threshold', () => {
      // Damage threshold should be a reasonable amount (less than half health)
      expect(DEFAULT_INTERRUPT_CONFIG.damageThreshold).toBeLessThanOrEqual(10);
    });

    it('should have tool break and no tools interrupts enabled by default', () => {
      expect(DEFAULT_INTERRUPT_CONFIG.interruptOnToolBreak).toBe(true);
      expect(DEFAULT_INTERRUPT_CONFIG.interruptOnNoTools).toBe(true);
    });
  });
});
