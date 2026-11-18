/**
 * Reflection Tools Index
 *
 * Tools for learning from task outcomes and extracting insights.
 */

import { RecordOutcomeTool } from './record-outcome.js';
import { GetInsightsTool } from './get-insights.js';
import { GetLessonsTool } from './get-lessons.js';
import type { ToolContext } from '../base-tool.js';

export { RecordOutcomeTool } from './record-outcome.js';
export { GetInsightsTool } from './get-insights.js';
export { GetLessonsTool } from './get-lessons.js';

/**
 * Create all reflection tools
 */
export function createReflectionTools(context: ToolContext) {
  return [
    new RecordOutcomeTool(context),
    new GetInsightsTool(context),
    new GetLessonsTool(context),
  ];
}
