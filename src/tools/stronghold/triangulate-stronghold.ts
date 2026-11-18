/**
 * Triangulate Stronghold Tool
 * Calculate stronghold position from multiple eye of ender throws
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { getMemoryService } from '../../services/memory.service.js';

const InputSchema = BaseInputSchema.extend({
  addReading: z.object({
    x: z.number().describe('X coordinate where eye was thrown'),
    z: z.number().describe('Z coordinate where eye was thrown'),
    angle: z.number().describe('Angle the eye traveled (degrees, 0=south)'),
  }).optional().describe('Add a new reading from an eye throw'),
  clearReadings: z.boolean().optional().default(false)
    .describe('Clear all previous readings'),
});

type Input = z.infer<typeof InputSchema>;

interface Reading {
  x: number;
  z: number;
  angle: number;
}

interface Output {
  success: boolean;
  readings: Reading[];
  estimatedPosition?: { x: number; z: number };
  confidence: 'low' | 'medium' | 'high';
  distance?: number;
  suggestion?: string;
  error?: string;
}

export class TriangulateStrongholdTool extends BaseTool<Input, Output> {
  readonly name = 'triangulateStronghold';
  readonly description = 'Calculate stronghold position from multiple eye of ender throws';
  readonly category = 'navigation' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const memoryService = getMemoryService();
    const READINGS_KEY = 'stronghold_readings';

    // Get existing readings
    let readings: Reading[] = [];
    try {
      const saved = memoryService.recall(READINGS_KEY);
      if (Array.isArray(saved)) {
        readings = saved as Reading[];
      }
    } catch {
      // No saved readings
    }

    // Clear readings if requested
    if (input.clearReadings) {
      readings = [];
      memoryService.remember(READINGS_KEY, readings, 'spatial');
    }

    // Add new reading if provided
    if (input.addReading) {
      readings.push(input.addReading);
      memoryService.remember(READINGS_KEY, readings, 'spatial');
    }

    if (readings.length === 0) {
      return {
        success: false,
        readings: [],
        confidence: 'low',
        suggestion: 'Throw an eye of ender and record the position and angle',
        error: 'No readings recorded yet',
      };
    }

    if (readings.length === 1) {
      const r = readings[0];
      // Calculate a point along the direction
      const angleRad = (r.angle - 90) * (Math.PI / 180); // Convert to math angle
      const estimatedDist = 1500; // Average stronghold distance from spawn

      return {
        success: true,
        readings,
        estimatedPosition: {
          x: Math.round(r.x + Math.cos(angleRad) * estimatedDist),
          z: Math.round(r.z + Math.sin(angleRad) * estimatedDist),
        },
        confidence: 'low',
        suggestion: 'Travel at least 300 blocks in a perpendicular direction and throw another eye for better accuracy',
      };
    }

    // Triangulate from two or more readings
    let bestIntersection: { x: number; z: number } | null = null;
    let minError = Infinity;

    // Try all pairs of readings
    for (let i = 0; i < readings.length; i++) {
      for (let j = i + 1; j < readings.length; j++) {
        const intersection = this.calculateIntersection(readings[i], readings[j]);
        if (intersection) {
          // Calculate error as average distance from all lines
          let totalError = 0;
          for (const reading of readings) {
            const dist = this.distanceToLine(intersection, reading);
            totalError += dist;
          }
          const avgError = totalError / readings.length;

          if (avgError < minError) {
            minError = avgError;
            bestIntersection = intersection;
          }
        }
      }
    }

    if (!bestIntersection) {
      return {
        success: false,
        readings,
        confidence: 'low',
        suggestion: 'The readings may be parallel. Try throwing from a different location.',
        error: 'Could not calculate intersection - lines may be parallel',
      };
    }

    // Determine confidence based on error and number of readings
    let confidence: 'low' | 'medium' | 'high' = 'low';
    if (minError < 50 && readings.length >= 3) {
      confidence = 'high';
    } else if (minError < 100 && readings.length >= 2) {
      confidence = 'medium';
    }

    // Calculate distance from current position
    const pos = bot.entity.position;
    const dx = bestIntersection.x - pos.x;
    const dz = bestIntersection.z - pos.z;
    const distance = Math.round(Math.sqrt(dx * dx + dz * dz));

    let suggestion: string | undefined;
    if (confidence === 'low') {
      suggestion = 'Consider throwing from another location at least 300 blocks away for better accuracy';
    } else if (distance < 100) {
      suggestion = 'Stronghold should be nearby! Look for it underground (usually around Y=30)';
    }

    return {
      success: true,
      readings,
      estimatedPosition: {
        x: Math.round(bestIntersection.x),
        z: Math.round(bestIntersection.z),
      },
      confidence,
      distance,
      suggestion,
    };
  }

  private calculateIntersection(r1: Reading, r2: Reading): { x: number; z: number } | null {
    // Convert angles to direction vectors
    const angle1 = (r1.angle - 90) * (Math.PI / 180);
    const angle2 = (r2.angle - 90) * (Math.PI / 180);

    const dx1 = Math.cos(angle1);
    const dz1 = Math.sin(angle1);
    const dx2 = Math.cos(angle2);
    const dz2 = Math.sin(angle2);

    // Calculate intersection using parametric line equations
    // P1 + t * D1 = P2 + s * D2
    const denom = dx1 * dz2 - dz1 * dx2;

    if (Math.abs(denom) < 0.001) {
      return null; // Lines are parallel
    }

    const t = ((r2.x - r1.x) * dz2 - (r2.z - r1.z) * dx2) / denom;

    return {
      x: r1.x + t * dx1,
      z: r1.z + t * dz1,
    };
  }

  private distanceToLine(point: { x: number; z: number }, reading: Reading): number {
    // Calculate perpendicular distance from point to line defined by reading
    const angleRad = (reading.angle - 90) * (Math.PI / 180);
    const dx = Math.cos(angleRad);
    const dz = Math.sin(angleRad);

    // Vector from reading position to point
    const px = point.x - reading.x;
    const pz = point.z - reading.z;

    // Cross product magnitude gives distance
    return Math.abs(px * dz - pz * dx);
  }
}
