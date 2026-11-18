/**
 * Find Item In Storage Tool
 *
 * Search indexed storage for a specific item.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { findItemInStorage } from '../../services/storage-index.service.js';

const InputSchema = BaseInputSchema.extend({
  item: z
    .string()
    .min(1)
    .describe('Item name to search for (partial match supported)'),
});

type Input = z.infer<typeof InputSchema>;

interface LocationResult {
  position: { x: number; y: number; z: number };
  type: string;
  label?: string;
  itemCount: number;
  dimension: string;
  lastScanned: string;
}

interface Output {
  found: boolean;
  totalCount: number;
  locations: LocationResult[];
  summary: string;
}

export class FindItemInStorageTool extends BaseTool<Input, Output> {
  readonly name = 'findItemInStorage';
  readonly description =
    'Search indexed storage containers for an item. Returns locations where the item is stored.';
  readonly category = 'storage' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, _bot: Bot): Promise<Output> {
    const results = findItemInStorage(input.item);

    if (results.length === 0) {
      return {
        found: false,
        totalCount: 0,
        locations: [],
        summary: `"${input.item}" not found in any indexed storage. Try indexing more containers.`,
      };
    }

    const totalCount = results.reduce((sum, r) => sum + r.itemCount, 0);

    const locations: LocationResult[] = results.map((r) => ({
      position: r.location.position,
      type: r.location.type,
      label: r.location.label,
      itemCount: r.itemCount,
      dimension: r.location.dimension,
      lastScanned: this.formatTimeAgo(r.location.lastScanned),
    }));

    const topLocation = locations[0];
    const locationDesc = topLocation.label ?? `${topLocation.type} at (${topLocation.position.x}, ${topLocation.position.y}, ${topLocation.position.z})`;

    let summary = `Found ${totalCount}x "${input.item}" in ${locations.length} location(s). `;
    summary += `Most: ${topLocation.itemCount}x at ${locationDesc}`;

    return {
      found: true,
      totalCount,
      locations,
      summary,
    };
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
