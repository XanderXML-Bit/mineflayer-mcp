/**
 * Goal Tools
 *
 * Tools for tracking objectives, progress, goal decomposition, and curriculum.
 */

import { AddGoalTool } from './add-goal.js';
import { UpdateGoalTool } from './update-goal.js';
import { ListGoalsTool } from './list-goals.js';
import { CompleteGoalTool } from './complete-goal.js';
import { PlanGoalTool } from './plan-goal.js';
import { SuggestNextGoalsTool } from './suggest-next-goals.js';
import { SuggestCurriculumTool } from './suggest-curriculum.js';
import type { ToolContext } from '../base-tool.js';

export function createGoalTools(context: ToolContext) {
  return [
    new AddGoalTool(context),
    new UpdateGoalTool(context),
    new ListGoalsTool(context),
    new CompleteGoalTool(context),
    new PlanGoalTool(context),
    new SuggestNextGoalsTool(context),
    new SuggestCurriculumTool(context),
  ];
}

export {
  AddGoalTool,
  UpdateGoalTool,
  ListGoalsTool,
  CompleteGoalTool,
  PlanGoalTool,
  SuggestNextGoalsTool,
  SuggestCurriculumTool,
};
