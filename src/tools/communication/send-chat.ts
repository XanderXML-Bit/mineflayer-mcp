/**
 * Send Chat Tool
 * Sends a chat message or command to the server
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { sanitizeMessage, isBlockedCommand } from '../../utils/chat-sanitizer.js';

const InputSchema = BaseInputSchema.extend({
  message: z.string().describe('Message to send (some admin commands are blocked for security)'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  sent: boolean;
  blocked?: boolean;
  error?: string;
}

export class SendChatTool extends BaseTool<Input, Output> {
  readonly name = 'sendChat';
  readonly description = 'Send a chat message or command to the Minecraft server';
  readonly category = 'communication' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { message } = input;

    if (!message) {
      throw new Error('Message is required');
    }

    // Sanitize the message
    const result = sanitizeMessage(message);

    if (!result.valid) {
      return {
        sent: false,
        blocked: isBlockedCommand(message),
        error: result.error,
      };
    }

    if (result.message) {
      bot.chat(result.message);
    }

    return {
      sent: true,
    };
  }
}
