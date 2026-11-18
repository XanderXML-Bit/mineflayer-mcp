/**
 * Get Home Info Tool
 *
 * Get information about saved home locations.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { recall } from '../../services/memory.service.js';

const InputSchema = BaseInputSchema.extend({
  name: z
    .string()
    .optional()
    .describe('Specific home name to get info for. If not provided, lists all homes.'),
});

type Input = z.infer<typeof InputSchema>;

interface HomeLocation {
  name: string;
  position: { x: number; y: number; z: number };
  dimension: string;
  setAt: number;
}

interface HomeInfo {
  name: string;
  position: { x: number; y: number; z: number };
  dimension: string;
  distance: number;
  setAgo: string;
  reachable: boolean; // Same dimension
}

interface Output {
  homes: HomeInfo[];
  primary?: string;
  summary: string;
}

export class GetHomeInfoTool extends BaseTool<Input, Output> {
  readonly name = 'getHomeInfo';
  readonly description =
    'Get information about saved home locations including distance and reachability.';
  readonly category = 'navigation' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const homes = recall<Record<string, HomeLocation>>('home:locations', 'spatial') ?? {};
    const primary = recall<string>('home:primary', 'spatial');
    const currentDim = this.getDimension(bot);
    const pos = bot.entity.position;

    if (Object.keys(homes).length === 0) {
      return {
        homes: [],
        summary: 'No home locations saved. Use setHome to save a location.',
      };
    }

    // Filter if specific name requested
    const homeEntries: [string, HomeLocation][] = input.name
      ? Object.entries(homes).filter(([name]) => name === input.name)
      : Object.entries(homes);

    if (input.name && homeEntries.length === 0) {
      return {
        homes: [],
        summary: `Home "${input.name}" not found. Available: ${Object.keys(homes).join(', ')}`,
      };
    }

    const homeInfos: HomeInfo[] = homeEntries.map(([name, home]) => {
      const distance = Math.sqrt(
        Math.pow(home.position.x - pos.x, 2) +
          Math.pow(home.position.y - pos.y, 2) +
          Math.pow(home.position.z - pos.z, 2)
      );

      return {
        name,
        position: home.position,
        dimension: home.dimension,
        distance: Math.round(distance),
        setAgo: this.formatTimeAgo(home.setAt),
        reachable: home.dimension === currentDim,
      };
    });

    // Sort by distance
    homeInfos.sort((a, b) => a.distance - b.distance);

    const reachableCount = homeInfos.filter((h) => h.reachable).length;
    let summary: string;

    if (input.name) {
      const h = homeInfos[0];
      summary = h.reachable
        ? `"${h.name}" is ${h.distance} blocks away`
        : `"${h.name}" is in ${h.dimension} (you're in ${currentDim})`;
    } else {
      summary = `${homeInfos.length} home location(s). ${reachableCount} reachable from current dimension.`;
      if (homeInfos.length > 0 && homeInfos[0].reachable) {
        summary += ` Nearest: "${homeInfos[0].name}" (${homeInfos[0].distance} blocks)`;
      }
    }

    return {
      homes: homeInfos,
      primary: primary ?? undefined,
      summary,
    };
  }

  private getDimension(bot: Bot): string {
    const dim = String(bot.game?.dimension ?? 'overworld');
    if (dim.includes('nether')) return 'nether';
    if (dim.includes('end')) return 'end';
    return 'overworld';
  }

  private formatTimeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
}
