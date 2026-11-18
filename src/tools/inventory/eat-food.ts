/**
 * Eat Food Tool
 * Eat food using auto-eat
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';

/** Bot with auto-eat plugin */
interface BotWithAutoEat extends Bot {
  autoEat?: {
    eat(): Promise<void>;
  };
}

const InputSchema = BaseInputSchema.extend({});

type Input = z.infer<typeof InputSchema>;

interface Output {
  ok: boolean;
}

export class EatFoodTool extends BaseTool<Input, Output> {
  readonly name = 'eatFood';
  readonly description = 'Eat food to restore hunger';
  readonly category = 'inventory' as const;
  readonly inputSchema = InputSchema;

  protected async execute(_input: Input, bot: Bot): Promise<Output> {
    const autoEat = (bot as BotWithAutoEat).autoEat;

    if (!autoEat) {
      throw new Error('auto-eat plugin not available');
    }

    await autoEat.eat();

    return { ok: true };
  }
}
