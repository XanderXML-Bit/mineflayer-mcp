/**
 * Position Helpers
 *
 * Utilities for working with Vec3 positions - formatting, rounding, distance calculations.
 * Consolidates common position patterns used throughout the codebase.
 */

import type { Vec3 } from 'vec3';

/** Plain object position (serializable) */
export interface Position {
  x: number;
  y: number;
  z: number;
}

/** Position with optional metadata */
export interface PositionWithMeta extends Position {
  dimension?: 'overworld' | 'nether' | 'end';
  timestamp?: number;
}

/**
 * Convert Vec3 to plain position object
 * Use when you need a serializable position (JSON, events, storage)
 */
export function toPosition(vec: Vec3 | Position | null | undefined): Position | null {
  if (!vec) return null;
  return { x: vec.x, y: vec.y, z: vec.z };
}

/**
 * Convert Vec3 to rounded integer position
 * Use for block coordinates
 */
export function toBlockPosition(vec: Vec3 | Position | null | undefined): Position | null {
  if (!vec) return null;
  return {
    x: Math.floor(vec.x),
    y: Math.floor(vec.y),
    z: Math.floor(vec.z),
  };
}

/**
 * Round position to specified decimal places
 */
export function roundPosition(vec: Vec3 | Position, decimals: number = 1): Position {
  const factor = Math.pow(10, decimals);
  return {
    x: Math.round(vec.x * factor) / factor,
    y: Math.round(vec.y * factor) / factor,
    z: Math.round(vec.z * factor) / factor,
  };
}

/**
 * Format position as human-readable string
 */
export function formatPosition(vec: Vec3 | Position | null | undefined, decimals: number = 1): string {
  if (!vec) return 'unknown';
  const rounded = roundPosition(vec, decimals);
  return `(${rounded.x}, ${rounded.y}, ${rounded.z})`;
}

/**
 * Format position as compact string (for storage keys)
 */
export function positionKey(vec: Vec3 | Position): string {
  const block = toBlockPosition(vec);
  if (!block) return '0,0,0';
  return `${block.x},${block.y},${block.z}`;
}

/**
 * Parse position key back to position
 */
export function parsePositionKey(key: string): Position | null {
  const parts = key.split(',');
  if (parts.length !== 3) return null;

  const [x, y, z] = parts.map(Number);
  if (isNaN(x) || isNaN(y) || isNaN(z)) return null;

  return { x, y, z };
}

/**
 * Calculate Manhattan distance (cheaper than Euclidean)
 * Use for rough proximity checks
 */
export function manhattanDistance(a: Vec3 | Position, b: Vec3 | Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
}

/**
 * Calculate horizontal distance (ignoring Y)
 */
export function horizontalDistance(a: Vec3 | Position, b: Vec3 | Position): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Check if two positions are within range
 */
export function isWithinRange(
  a: Vec3 | Position,
  b: Vec3 | Position,
  range: number,
  ignoreY: boolean = false
): boolean {
  if (ignoreY) {
    return horizontalDistance(a, b) <= range;
  }
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz <= range * range;
}

/**
 * Get direction from one position to another as cardinal direction
 */
export function getCardinalDirection(from: Vec3 | Position, to: Vec3 | Position): string {
  const dx = to.x - from.x;
  const dz = to.z - from.z;

  const angle = Math.atan2(-dx, dz) * (180 / Math.PI);
  const normalized = ((angle % 360) + 360) % 360;

  if (normalized >= 337.5 || normalized < 22.5) return 'south';
  if (normalized >= 22.5 && normalized < 67.5) return 'southwest';
  if (normalized >= 67.5 && normalized < 112.5) return 'west';
  if (normalized >= 112.5 && normalized < 157.5) return 'northwest';
  if (normalized >= 157.5 && normalized < 202.5) return 'north';
  if (normalized >= 202.5 && normalized < 247.5) return 'northeast';
  if (normalized >= 247.5 && normalized < 292.5) return 'east';
  return 'southeast';
}

/**
 * Add offset to position
 */
export function offsetPosition(pos: Vec3 | Position, dx: number, dy: number, dz: number): Position {
  return {
    x: pos.x + dx,
    y: pos.y + dy,
    z: pos.z + dz,
  };
}

/**
 * Check if position is valid (not NaN or Infinity)
 */
export function isValidPosition(pos: unknown): pos is Position {
  if (!pos || typeof pos !== 'object') return false;
  const p = pos as { x?: unknown; y?: unknown; z?: unknown };
  return (
    typeof p.x === 'number' &&
    typeof p.y === 'number' &&
    typeof p.z === 'number' &&
    isFinite(p.x) &&
    isFinite(p.y) &&
    isFinite(p.z)
  );
}
