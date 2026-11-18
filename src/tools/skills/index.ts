/**
 * Skills Tools Index
 *
 * Tools for managing the skill library - saving, retrieving, and tracking skills.
 */

import { SaveSkillTool } from './save-skill.js';
import { GetSkillsTool } from './get-skills.js';
import { GetSkillDetailsTool } from './get-skill-details.js';
import { RecordSkillOutcomeTool } from './record-skill-outcome.js';
import { GetSkillStatsTool } from './get-skill-stats.js';
import type { ToolContext } from '../base-tool.js';

export { SaveSkillTool } from './save-skill.js';
export { GetSkillsTool } from './get-skills.js';
export { GetSkillDetailsTool } from './get-skill-details.js';
export { RecordSkillOutcomeTool } from './record-skill-outcome.js';
export { GetSkillStatsTool } from './get-skill-stats.js';

/**
 * Create all skill tools
 */
export function createSkillsTools(context: ToolContext) {
  return [
    new SaveSkillTool(context),
    new GetSkillsTool(context),
    new GetSkillDetailsTool(context),
    new RecordSkillOutcomeTool(context),
    new GetSkillStatsTool(context),
  ];
}
