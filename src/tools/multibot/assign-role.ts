/**
 * Assign Role Tool
 * Assign a role to a bot in the team
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { getMemoryService } from '../../services/memory.service.js';

const InputSchema = BaseInputSchema.extend({
  botName: z.string().describe('Name of the bot to assign role to'),
  role: z.enum(['leader', 'miner', 'builder', 'farmer', 'guard', 'scout', 'follower'])
    .describe('Role to assign'),
  priority: z.number().optional().default(1).describe('Priority level (1-10)'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  success: boolean;
  botName: string;
  role: string;
  previousRole?: string;
  teamRoles?: Record<string, string>;
  error?: string;
}

export class AssignRoleTool extends BaseTool<Input, Output> {
  readonly name = 'assignBotRole';
  readonly description = 'Assign a specialized role to a bot in the team';
  readonly category = 'utility' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, _bot: Bot): Promise<Output> {
    const { botName, role, priority } = input;
    const memoryService = getMemoryService();
    const allBots = this.context.getAllBots();

    // Verify bot exists
    if (!allBots.has(botName)) {
      const availableBots = Array.from(allBots.keys());
      return {
        success: false,
        botName,
        role,
        error: `Bot '${botName}' not found. Available: ${availableBots.join(', ')}`,
      };
    }

    // Get current team roles
    let teamRoles: Record<string, { role: string; priority: number }> = {};
    try {
      const saved = memoryService.recall('team_roles');
      if (saved && typeof saved === 'object') {
        teamRoles = saved as unknown as Record<string, { role: string; priority: number }>;
      }
    } catch {
      // No saved roles
    }

    // Get previous role
    const previousRole = teamRoles[botName]?.role;

    // Assign new role
    teamRoles[botName] = { role, priority: priority ?? 1 };

    // Save to memory
    memoryService.remember('team_roles', teamRoles, 'task');

    // Create summary of all roles
    const roleSummary: Record<string, string> = {};
    for (const [name, info] of Object.entries(teamRoles)) {
      roleSummary[name] = info.role;
    }

    return {
      success: true,
      botName,
      role,
      previousRole,
      teamRoles: roleSummary,
    };
  }
}
