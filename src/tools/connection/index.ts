/**
 * Connection Tools
 * Tools for connecting and disconnecting bots from Minecraft servers
 */

import { JoinGameTool } from './join-game.js';
import { LeaveGameTool } from './leave-game.js';
import type { ToolContext } from '../base-tool.js';

/**
 * Create connection tools using factory pattern (consistent with other categories)
 */
export function createConnectionTools(context: ToolContext) {
  return [
    new JoinGameTool(context),
    new LeaveGameTool(context),
  ];
}

// Export tool classes
export { JoinGameTool } from './join-game.js';
export { LeaveGameTool } from './leave-game.js';
