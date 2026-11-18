/**
 * Label Storage Tool
 *
 * Give a storage container a memorable label.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import {
  labelStorage,
  getStorageByLabel,
  getAllStorageLocations,
} from '../../services/storage-index.service.js';

const InputSchema = BaseInputSchema.extend({
  action: z
    .enum(['set', 'get', 'list'])
    .optional()
    .default('set')
    .describe('Action: set a label, get location by label, or list all labels'),
  label: z
    .string()
    .min(1)
    .max(50)
    .optional()
    .describe('Label for the storage (for set/get actions)'),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
      z: z.number(),
    })
    .optional()
    .describe('Position of storage to label (for set action)'),
});

type Input = z.infer<typeof InputSchema>;

interface LabeledLocation {
  label: string;
  position: { x: number; y: number; z: number };
  type: string;
  itemCount: number;
}

type Output =
  | { success: boolean; message: string }
  | { found: boolean; location?: LabeledLocation; message: string }
  | { labels: LabeledLocation[]; count: number };

export class LabelStorageTool extends BaseTool<Input, Output> {
  readonly name = 'labelStorage';
  readonly description =
    'Label a storage container for easy reference (e.g., "main_chest", "tool_storage"). Can also look up locations by label.';
  readonly category = 'storage' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    switch (input.action) {
      case 'get':
        return this.getByLabel(input.label);

      case 'list':
        return this.listLabels();

      case 'set':
      default:
        return this.setLabel(input, bot);
    }
  }

  private setLabel(
    input: Input,
    bot: Bot
  ): { success: boolean; message: string } {
    if (!input.label) {
      return { success: false, message: 'Label is required for set action' };
    }

    // Use provided position or try to find storage at bot's looking position
    let position = input.position;

    if (!position) {
      // Check if bot entity is ready
      if (!bot.entity?.position) {
        return {
          success: false,
          message: 'Bot entity not ready. Provide position explicitly.',
        };
      }
      // Try to get block the bot is looking at
      const block = bot.blockAtCursor(5);
      if (!block) {
        return {
          success: false,
          message: 'No position provided and not looking at a block. Provide position or look at a container.',
        };
      }
      position = {
        x: block.position.x,
        y: block.position.y,
        z: block.position.z,
      };
    }

    const dimStr = String(bot.game?.dimension ?? 'overworld');
    const dimension = dimStr.includes('nether')
      ? 'nether'
      : dimStr.includes('end')
        ? 'end'
        : 'overworld';

    const success = labelStorage(position, input.label, dimension);

    if (success) {
      return {
        success: true,
        message: `Labeled storage at (${position.x}, ${position.y}, ${position.z}) as "${input.label}"`,
      };
    } else {
      return {
        success: false,
        message: `Storage at (${position.x}, ${position.y}, ${position.z}) not indexed. Run indexNearbyStorage first.`,
      };
    }
  }

  private getByLabel(label?: string): {
    found: boolean;
    location?: LabeledLocation;
    message: string;
  } {
    if (!label) {
      return { found: false, message: 'Label is required for get action' };
    }

    const location = getStorageByLabel(label);

    if (!location) {
      return {
        found: false,
        message: `No storage found with label "${label}"`,
      };
    }

    return {
      found: true,
      location: {
        label: location.label || label,
        position: location.position,
        type: location.type,
        itemCount: location.totalItems,
      },
      message: `Found "${label}" at (${location.position.x}, ${location.position.y}, ${location.position.z})`,
    };
  }

  private listLabels(): { labels: LabeledLocation[]; count: number } {
    const locations = getAllStorageLocations();
    const labeled = locations.filter((l) => l.label);

    const labels: LabeledLocation[] = labeled
      .filter((l): l is typeof l & { label: string } => l.label !== undefined)
      .map((l) => ({
        label: l.label,
        position: l.position,
        type: l.type,
        itemCount: l.totalItems,
      }));

    return {
      labels,
      count: labels.length,
    };
  }
}
