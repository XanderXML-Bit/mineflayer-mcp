/**
 * Get Storage Summary Tool
 *
 * Get overview of all indexed storage and total inventory.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { getStorageSummary } from '../../services/storage-index.service.js';

const InputSchema = BaseInputSchema.extend({
  showItems: z
    .boolean()
    .optional()
    .default(true)
    .describe('Include item totals across all storage'),
  topItems: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(15)
    .describe('Number of top items to show'),
});

type Input = z.infer<typeof InputSchema>;

interface RecentLocation {
  label?: string;
  position: { x: number; y: number; z: number };
  type: string;
  itemCount: number;
  scannedAgo: string;
}

interface Output {
  totalLocations: number;
  byType: Record<string, number>;
  topItems?: { item: string; count: number }[];
  recentlyScanned: RecentLocation[];
  summary: string;
}

export class GetStorageSummaryTool extends BaseTool<Input, Output> {
  readonly name = 'getStorageSummary';
  readonly description =
    'Get summary of all indexed storage: total locations, items across all storage, and recently scanned containers.';
  readonly category = 'storage' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, _bot: Bot): Promise<Output> {
    const summary = getStorageSummary();

    const recentlyScanned: RecentLocation[] = summary.recentlyScanned.map((l) => ({
      label: l.label,
      position: l.position,
      type: l.type,
      itemCount: l.totalItems,
      scannedAgo: this.formatTimeAgo(l.lastScanned),
    }));

    // Convert items to sorted array
    let topItems: { item: string; count: number }[] | undefined;
    if (input.showItems) {
      topItems = Object.entries(summary.totalItems)
        .map(([item, count]) => ({ item, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, input.topItems);
    }

    // Build summary text
    let summaryText: string;
    if (summary.totalLocations === 0) {
      summaryText = 'No storage indexed yet. Use indexNearbyStorage to scan containers.';
    } else {
      const typeBreakdown = Object.entries(summary.byType)
        .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
        .join(', ');

      const totalItemCount = Object.values(summary.totalItems).reduce(
        (sum, c) => sum + c,
        0
      );
      const uniqueTypes = Object.keys(summary.totalItems).length;

      summaryText = `${summary.totalLocations} storage locations (${typeBreakdown}). `;
      summaryText += `${totalItemCount} total items across ${uniqueTypes} types.`;
    }

    return {
      totalLocations: summary.totalLocations,
      byType: summary.byType,
      topItems,
      recentlyScanned,
      summary: summaryText,
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
