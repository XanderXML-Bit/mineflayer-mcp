/**
 * Building Template Tools
 * Tools for building pre-defined structures
 */

import { ListTemplatesTool } from './list-templates.js';
import { CheckTemplateMaterialsTool } from './check-materials.js';
import { BuildTemplateTool } from './build-template.js';
import type { ToolContext } from '../base-tool.js';

export function createTemplateTools(context: ToolContext) {
  return [
    new ListTemplatesTool(context),
    new CheckTemplateMaterialsTool(context),
    new BuildTemplateTool(context),
  ];
}

export { ListTemplatesTool, CheckTemplateMaterialsTool, BuildTemplateTool };
