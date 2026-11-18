/**
 * Retrieve From Furnace Tool
 * Retrieve output items from a nearby furnace
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import type { Block } from 'prismarine-block';
import type { Item } from 'prismarine-item';
import { BaseTool, BaseInputSchema } from '../base-tool.js';

/** Bot with furnace methods */
type BotWithFurnace = Bot & {
  openFurnace(block: Block): Promise<FurnaceWindow>;
};

/** Furnace window interface */
interface FurnaceWindow {
  takeOutput(): Promise<Item | null>;
  close(): void;
}

/** Block matcher function */
type BlockMatcher = (block: Block) => boolean;

const InputSchema = BaseInputSchema.extend({});

type Input = z.infer<typeof InputSchema>;

interface Output {
  ok: boolean;
  output?: string;
}

export class RetrieveFromFurnaceTool extends BaseTool<Input, Output> {
  readonly name = 'retrieveItemsFromNearbyFurnace';
  readonly description = 'Retrieve output items from a nearby furnace';
  readonly category = 'cooking' as const;
  readonly inputSchema = InputSchema;

  protected async execute(_input: Input, bot: Bot): Promise<Output> {
    const blockMatcher: BlockMatcher = (b) =>
      b?.name === 'furnace' || b?.name === 'smoker' || b?.name === 'blast_furnace';

    const furnacePos = bot.findBlock({
      matching: blockMatcher,
      maxDistance: 16,
    });

    if (!furnacePos) {
      throw new Error('No furnace nearby');
    }

    const furnace = await (bot as unknown as BotWithFurnace).openFurnace(furnacePos);
    let out: Item | null = null;

    try {
      out = await furnace.takeOutput();
    } catch {
      // Ignore takeOutput errors
    }

    furnace.close();

    return { ok: !!out, output: out?.name };
  }
}
