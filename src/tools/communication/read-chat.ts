/**
 * Read Chat Tool
 * Reads recent chat messages from the server
 *
 * Uses the centralized chat log from status.service.ts to avoid
 * listener duplication and ensure proper cleanup on bot disconnect.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { getChatLog } from '../../services/status.service.js';
import type { ChatMessage } from '../../types/bot.js';

const InputSchema = BaseInputSchema.extend({
  count: z.number().optional().default(20).describe('Number of recent messages to retrieve'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  messages: ChatMessage[];
}

export class ReadChatTool extends BaseTool<Input, Output> {
  readonly name = 'readChat';
  readonly description = 'Read recent chat messages from the server';
  readonly category = 'communication' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { count } = input;

    // Use centralized chat log from status service
    // This avoids listener duplication and ensures proper cleanup
    const messages = getChatLog(bot, count ?? 20);

    return { messages };
  }
}
