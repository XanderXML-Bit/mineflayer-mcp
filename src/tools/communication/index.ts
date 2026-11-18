/**
 * Communication tools module
 * Tools for interacting via chat
 */

export { SendChatTool } from './send-chat.js';
export { ReadChatTool } from './read-chat.js';

import { SendChatTool } from './send-chat.js';
import { ReadChatTool } from './read-chat.js';
import type { ToolContext } from '../base-tool.js';

/**
 * Create all communication tools
 */
export function createCommunicationTools(context: ToolContext) {
  return [new SendChatTool(context), new ReadChatTool(context)];
}
