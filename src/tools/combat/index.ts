/**
 * Combat tools index
 */

import type { ToolContext, BaseTool } from '../base-tool.js';
import { AutoDefenseTool } from './auto-defense.js';

export { AutoDefenseTool };

/** Generic tool input type */
interface ToolInput {
  username?: string;
}

/** Generic tool output type */
interface ToolOutput {
  success?: boolean;
  ok?: boolean;
  error?: string;
}

/**
 * Create all combat tools
 */
export function createCombatTools(context: ToolContext): BaseTool<ToolInput, ToolOutput>[] {
  return [
    new AutoDefenseTool(context),
  ];
}
