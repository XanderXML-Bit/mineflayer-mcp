/**
 * Memory Tools
 *
 * Tools for persistent memory storage and retrieval.
 */

import { RememberTool } from './remember.js';
import { RecallTool } from './recall.js';
import { ForgetTool } from './forget.js';
import { ListMemoriesTool } from './list-memories.js';
import type { ToolContext } from '../base-tool.js';

export function createMemoryTools(context: ToolContext) {
  return [
    new RememberTool(context),
    new RecallTool(context),
    new ForgetTool(context),
    new ListMemoriesTool(context),
  ];
}

export { RememberTool, RecallTool, ForgetTool, ListMemoriesTool };
