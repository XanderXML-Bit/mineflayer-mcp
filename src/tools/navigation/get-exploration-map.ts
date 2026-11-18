/**
 * Get Exploration Map Tool
 *
 * Get a visual map of explored vs unexplored chunks.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import {
  getExplorationMap,
  getExplorationStats,
} from '../../services/exploration.service.js';

const InputSchema = BaseInputSchema.extend({
  radius: z
    .number()
    .int()
    .min(2)
    .max(10)
    .optional()
    .default(5)
    .describe('Radius in chunks to show (5 = 11x11 grid)'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  map: string;
  legend: string;
  center: { chunkX: number; chunkZ: number };
  stats: {
    chunksExplored: number;
    poisDiscovered: number;
    byDimension: Record<string, number>;
  };
  summary: string;
}

export class GetExplorationMapTool extends BaseTool<Input, Output> {
  readonly name = 'getExplorationMap';
  readonly description =
    'Get a visual map of explored vs unexplored areas around you. Shows chunks as a grid.';
  readonly category = 'navigation' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { explored, center } = getExplorationMap(bot, input.radius);
    const stats = getExplorationStats();

    // Convert to visual string
    const mapLines = explored.map((row) => row.join(' '));
    const map = mapLines.join('\n');

    const legend = 'X=you  .=explored  P=POI  ?=unexplored';

    // Count unexplored in view
    const unexploredCount = explored.flat().filter((c) => c === '?').length;
    const exploredCount = explored.flat().filter((c) => c === '.' || c === 'P').length;
    const totalInView = (input.radius * 2 + 1) ** 2;

    let summary = `Viewing ${totalInView} chunks (${input.radius * 2 + 1}x${input.radius * 2 + 1} grid). `;
    summary += `${exploredCount} explored, ${unexploredCount} unexplored in view. `;
    summary += `Total explored ever: ${stats.chunksExplored} chunks, ${stats.poisDiscovered} POIs.`;

    return {
      map,
      legend,
      center: { chunkX: center.x, chunkZ: center.z },
      stats: {
        chunksExplored: stats.chunksExplored,
        poisDiscovered: stats.poisDiscovered,
        byDimension: stats.byDimension,
      },
      summary,
    };
  }
}
