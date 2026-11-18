/**
 * Movement Tools
 * Tools for bot navigation and movement
 */

import { GoToLocationTool } from './go-to-location.js';
import { GoToPlayerTool } from './go-to-player.js';
import { LookAtTool } from './look-at.js';
import { JumpTool } from './jump.js';
import { MoveDirectionTool } from './move-direction.js';
import { FollowPlayerTool } from './follow-player.js';
import { StopFollowTool } from './stop-follow.js';
import { RunAwayTool } from './run-away.js';
import { SwimToLandTool } from './swim-to-land.js';
import type { ToolContext } from '../base-tool.js';

export function createMovementTools(context: ToolContext) {
  return [
    new GoToLocationTool(context),
    new GoToPlayerTool(context),
    new LookAtTool(context),
    new JumpTool(context),
    new MoveDirectionTool(context),
    new FollowPlayerTool(context),
    new StopFollowTool(context),
    new RunAwayTool(context),
    new SwimToLandTool(context),
  ];
}

export {
  GoToLocationTool,
  GoToPlayerTool,
  LookAtTool,
  JumpTool,
  MoveDirectionTool,
  FollowPlayerTool,
  StopFollowTool,
  RunAwayTool,
  SwimToLandTool,
};
