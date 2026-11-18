/**
 * Find POI Tool
 *
 * Find nearest point of interest of a given type.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import {
  findNearestPOI,
  getPointsOfInterest,
  addPointOfInterest,
  type PointOfInterest,
} from '../../services/exploration.service.js';

const InputSchema = BaseInputSchema.extend({
  action: z
    .enum(['find', 'add', 'list'])
    .optional()
    .default('find')
    .describe('Action: find nearest, add new, or list all POIs'),
  type: z
    .string()
    .optional()
    .describe('POI type to find/add (e.g., "village", "dungeon", "mineshaft")'),
  notes: z.string().optional().describe('Notes about the POI (for add action)'),
});

type Input = z.infer<typeof InputSchema>;

interface POIInfo {
  type: string;
  position: { x: number; y: number; z: number };
  dimension: string;
  distance: number;
  discoveredAgo: string;
  notes?: string;
}

type Output =
  | { found: boolean; poi?: POIInfo; message: string }
  | { success: boolean; poi: PointOfInterest; message: string }
  | { pois: POIInfo[]; byType: Record<string, number>; message: string };

export class FindPOITool extends BaseTool<Input, Output> {
  readonly name = 'findPOI';
  readonly description =
    'Find, add, or list points of interest (villages, dungeons, etc.). POIs are remembered across sessions.';
  readonly category = 'navigation' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    switch (input.action) {
      case 'add':
        return this.addPOI(input, bot);

      case 'list':
        return this.listPOIs(bot);

      case 'find':
      default:
        return this.findPOI(input, bot);
    }
  }

  private findPOI(
    input: Input,
    bot: Bot
  ): { found: boolean; poi?: POIInfo; message: string } {
    const poi = findNearestPOI(bot, input.type);

    if (!poi) {
      const typeStr = input.type ? ` of type "${input.type}"` : '';
      return {
        found: false,
        message: `No POIs${typeStr} discovered yet. Explore more or add one manually.`,
      };
    }

    // Check if bot entity is ready for distance calculation
    const pos = bot.entity?.position;
    const distance = pos
      ? Math.sqrt(
          Math.pow(poi.position.x - pos.x, 2) + Math.pow(poi.position.z - pos.z, 2)
        )
      : 0;

    const poiInfo: POIInfo = {
      type: poi.type,
      position: poi.position,
      dimension: poi.dimension,
      distance: Math.round(distance),
      discoveredAgo: this.formatTimeAgo(poi.discoveredAt),
      notes: poi.notes,
    };

    return {
      found: true,
      poi: poiInfo,
      message: `Nearest ${poi.type}: ${Math.round(distance)} blocks away at (${poi.position.x}, ${poi.position.y}, ${poi.position.z})`,
    };
  }

  private addPOI(
    input: Input,
    bot: Bot
  ): { success: boolean; poi: PointOfInterest; message: string } {
    if (!input.type) {
      return {
        success: false,
        poi: {} as PointOfInterest,
        message: 'POI type is required for add action',
      };
    }

    const pos = bot.entity.position;
    const dimension = this.getDimension(bot);

    const poi = addPointOfInterest(
      input.type,
      { x: pos.x, y: pos.y, z: pos.z },
      dimension,
      input.notes
    );

    return {
      success: true,
      poi,
      message: `Added ${input.type} at (${poi.position.x}, ${poi.position.y}, ${poi.position.z})`,
    };
  }

  private listPOIs(bot: Bot): {
    pois: POIInfo[];
    byType: Record<string, number>;
    message: string;
  } {
    const allPOIs = getPointsOfInterest();
    const pos = bot.entity.position;

    const byType: Record<string, number> = {};
    const poiInfos: POIInfo[] = allPOIs.map((poi) => {
      byType[poi.type] = (byType[poi.type] ?? 0) + 1;

      const distance = Math.sqrt(
        Math.pow(poi.position.x - pos.x, 2) + Math.pow(poi.position.z - pos.z, 2)
      );

      return {
        type: poi.type,
        position: poi.position,
        dimension: poi.dimension,
        distance: Math.round(distance),
        discoveredAgo: this.formatTimeAgo(poi.discoveredAt),
        notes: poi.notes,
      };
    });

    // Sort by distance
    poiInfos.sort((a, b) => a.distance - b.distance);

    let message: string;
    if (poiInfos.length === 0) {
      message = 'No POIs discovered yet.';
    } else {
      const typeList = Object.entries(byType)
        .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
        .join(', ');
      message = `${poiInfos.length} POIs: ${typeList}`;
    }

    return {
      pois: poiInfos.slice(0, 20), // Limit results
      byType,
      message,
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
