import type { BotEventType, ToolSuccess } from '../../src/types/index.js';

const whisper: BotEventType = 'player_whisper';
const result: ToolSuccess = {
  ok: true,
  recentChat: [{ from: 'Player', message: 'hello', timestamp: 1, isWhisper: true }],
  events: [{ type: whisper, timestamp: 1, data: {} }],
};
const messages: Array<{ from: string; message: string; timestamp: number; isWhisper: boolean }> | undefined = result.recentChat;
void messages;
