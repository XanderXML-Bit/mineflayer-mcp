/**
 * Tests for position-helpers.ts
 */

import { describe, it, expect } from 'vitest';
import {
  toPosition,
  toBlockPosition,
  roundPosition,
  formatPosition,
  positionKey,
  parsePositionKey,
  manhattanDistance,
  horizontalDistance,
  isWithinRange,
  getCardinalDirection,
  offsetPosition,
  isValidPosition,
} from '../../../src/utils/position-helpers.js';

describe('position-helpers', () => {
  describe('toPosition', () => {
    it('converts Vec3-like object to plain position', () => {
      const vec = { x: 1.5, y: 64.2, z: -3.7 };
      const result = toPosition(vec);
      expect(result).toEqual({ x: 1.5, y: 64.2, z: -3.7 });
    });

    it('returns null for null/undefined input', () => {
      expect(toPosition(null)).toBeNull();
      expect(toPosition(undefined)).toBeNull();
    });
  });

  describe('toBlockPosition', () => {
    it('floors coordinates to block position', () => {
      const vec = { x: 1.7, y: 64.2, z: -3.3 };
      const result = toBlockPosition(vec);
      expect(result).toEqual({ x: 1, y: 64, z: -4 });
    });

    it('handles negative coordinates correctly', () => {
      const vec = { x: -0.5, y: -0.1, z: -1.9 };
      const result = toBlockPosition(vec);
      expect(result).toEqual({ x: -1, y: -1, z: -2 });
    });

    it('returns null for null input', () => {
      expect(toBlockPosition(null)).toBeNull();
    });
  });

  describe('roundPosition', () => {
    it('rounds to 1 decimal by default', () => {
      const vec = { x: 1.234, y: 64.567, z: -3.891 };
      const result = roundPosition(vec);
      expect(result).toEqual({ x: 1.2, y: 64.6, z: -3.9 });
    });

    it('rounds to specified decimals', () => {
      const vec = { x: 1.2345, y: 64.5678, z: -3.8912 };
      expect(roundPosition(vec, 0)).toEqual({ x: 1, y: 65, z: -4 });
      expect(roundPosition(vec, 2)).toEqual({ x: 1.23, y: 64.57, z: -3.89 });
    });
  });

  describe('formatPosition', () => {
    it('formats position as readable string', () => {
      const vec = { x: 100.5, y: 64, z: -200.7 };
      expect(formatPosition(vec)).toBe('(100.5, 64, -200.7)');
    });

    it('returns unknown for null', () => {
      expect(formatPosition(null)).toBe('unknown');
      expect(formatPosition(undefined)).toBe('unknown');
    });

    it('respects decimals parameter', () => {
      const vec = { x: 100.567, y: 64.123, z: -200.789 };
      expect(formatPosition(vec, 0)).toBe('(101, 64, -201)');
    });
  });

  describe('positionKey/parsePositionKey', () => {
    it('creates key from position', () => {
      const pos = { x: 100.5, y: 64.9, z: -200.1 };
      expect(positionKey(pos)).toBe('100,64,-201');
    });

    it('parses key back to position', () => {
      expect(parsePositionKey('100,64,-200')).toEqual({ x: 100, y: 64, z: -200 });
    });

    it('returns null for invalid key', () => {
      expect(parsePositionKey('invalid')).toBeNull();
      expect(parsePositionKey('1,2')).toBeNull();
      expect(parsePositionKey('a,b,c')).toBeNull();
    });
  });

  describe('manhattanDistance', () => {
    it('calculates manhattan distance', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 3, y: 4, z: 5 };
      expect(manhattanDistance(a, b)).toBe(12);
    });

    it('handles negative coordinates', () => {
      const a = { x: -5, y: 0, z: 5 };
      const b = { x: 5, y: 0, z: -5 };
      expect(manhattanDistance(a, b)).toBe(20);
    });
  });

  describe('horizontalDistance', () => {
    it('calculates horizontal distance ignoring Y', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 3, y: 100, z: 4 };
      expect(horizontalDistance(a, b)).toBe(5); // 3-4-5 triangle
    });
  });

  describe('isWithinRange', () => {
    it('returns true when within range', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 2, y: 2, z: 2 };
      expect(isWithinRange(a, b, 5)).toBe(true);
    });

    it('returns false when outside range', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 10, y: 10, z: 10 };
      expect(isWithinRange(a, b, 5)).toBe(false);
    });

    it('ignores Y when specified', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 3, y: 100, z: 4 };
      expect(isWithinRange(a, b, 5, false)).toBe(false); // 3D distance > 5
      expect(isWithinRange(a, b, 5, true)).toBe(true); // horizontal distance = 5
    });
  });

  describe('getCardinalDirection', () => {
    it('returns correct cardinal directions', () => {
      const origin = { x: 0, y: 0, z: 0 };
      // In Minecraft: +Z is south, -Z is north, +X is east, -X is west
      expect(getCardinalDirection(origin, { x: 0, y: 0, z: 10 })).toBe('south');
      expect(getCardinalDirection(origin, { x: 0, y: 0, z: -10 })).toBe('north');
      expect(getCardinalDirection(origin, { x: -10, y: 0, z: 0 })).toBe('west');
      expect(getCardinalDirection(origin, { x: 10, y: 0, z: 0 })).toBe('east');
    });

    it('returns intercardinal directions', () => {
      const origin = { x: 0, y: 0, z: 0 };
      // -X (west) + +Z (south) = southwest
      expect(getCardinalDirection(origin, { x: -10, y: 0, z: 10 })).toBe('southwest');
      // +X (east) + +Z (south) = southeast
      expect(getCardinalDirection(origin, { x: 10, y: 0, z: 10 })).toBe('southeast');
    });
  });

  describe('offsetPosition', () => {
    it('adds offset to position', () => {
      const pos = { x: 10, y: 64, z: -20 };
      expect(offsetPosition(pos, 5, -10, 15)).toEqual({ x: 15, y: 54, z: -5 });
    });
  });

  describe('isValidPosition', () => {
    it('returns true for valid positions', () => {
      expect(isValidPosition({ x: 0, y: 0, z: 0 })).toBe(true);
      expect(isValidPosition({ x: -100.5, y: 64, z: 200 })).toBe(true);
    });

    it('returns false for invalid inputs', () => {
      expect(isValidPosition(null)).toBe(false);
      expect(isValidPosition(undefined)).toBe(false);
      expect(isValidPosition({ x: NaN, y: 0, z: 0 })).toBe(false);
      expect(isValidPosition({ x: Infinity, y: 0, z: 0 })).toBe(false);
      expect(isValidPosition({ x: 0, y: 0 })).toBe(false);
      expect(isValidPosition('not an object')).toBe(false);
    });
  });
});
