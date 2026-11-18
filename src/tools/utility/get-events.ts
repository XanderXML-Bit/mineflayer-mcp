/**
 * GetEvents Tool
 *
 * Explicitly fetch events from the event buffer.
 * Useful when the AI wants to check for events without calling another tool.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import type { BotEvent } from '../../types/index.js';
import { getAndClearEvents, peekEvents } from '../../services/event.service.js';

const InputSchema = BaseInputSchema.extend({
  since: z
    .number()
    .optional()
    .describe('Get events since this timestamp (milliseconds since epoch)'),
  types: z
    .array(z.string())
    .optional()
    .describe('Filter by event types (e.g., ["damage_taken", "player_chat"])'),
  clear: z
    .boolean()
    .optional()
    .default(true)
    .describe('Clear events after reading (default: true)'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  events: BotEvent[];
  count: number;
  oldestTimestamp: number | null;
  newestTimestamp: number | null;
}

export class GetEventsTool extends BaseTool<Input, Output> {
  readonly name = 'getEvents';
  readonly description =
    'Get recent events that occurred (damage, chat, pickups, etc.). Events are automatically included in other tool responses, but this tool lets you explicitly check for events.';
  readonly category = 'utility' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    let events: BotEvent[];

    if (input.clear) {
      events = getAndClearEvents(bot);
    } else {
      events = peekEvents(bot, input.since);
    }

    // Filter by types if specified
    if (input.types && input.types.length > 0) {
      const typeSet = new Set(input.types);
      events = events.filter((e) => typeSet.has(e.type));
    }

    // Filter by timestamp if specified
    if (input.since) {
      const since = input.since;
      events = events.filter((e) => e.timestamp >= since);
    }

    const timestamps = events.map((e) => e.timestamp);

    return {
      events,
      count: events.length,
      oldestTimestamp: timestamps.length > 0 ? Math.min(...timestamps) : null,
      newestTimestamp: timestamps.length > 0 ? Math.max(...timestamps) : null,
    };
  }

  /**
   * Override run to not include events in response (we're returning them explicitly)
   */
  async run(rawInput: unknown) {
    // Validate input
    const parseResult = this.inputSchema.safeParse(rawInput);
    if (!parseResult.success) {
      return {
        ok: false as const,
        error: `Invalid input: ${parseResult.error.message}`,
        code: 'INVALID_INPUT',
      };
    }

    const input = parseResult.data;

    try {
      const bot = this.context.getBotOrThrow(input.username);
      const result = await this.execute(input, bot);

      return {
        ok: true as const,
        data: result,
        bot: bot.username,
        // Don't include events here since we're returning them in data
      };
    } catch (error) {
      this.log.error('Tool execution failed', { error });

      const errorCode = error instanceof Error && 'code' in error ? (error as Error & { code?: string }).code : undefined;
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : String(error),
        code: errorCode,
      };
    }
  }
}
