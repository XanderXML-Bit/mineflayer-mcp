/**
 * Build Something Tool
 * Build using commands or survival placement
 */

import { z } from 'zod';
import { Vec3 } from 'vec3';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { withTask } from '../../services/task.service.js';
import { createEquipmentService } from '../../services/equipment.service.js';
import { configureMovements } from '../../services/navigation.service.js';
import { validateBuildCommand, ALLOWED_BUILD_COMMANDS } from '../../utils/chat-sanitizer.js';

import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg;

const InputSchema = BaseInputSchema.extend({
  mode: z
    .enum(['commands', 'survival'])
    .optional()
    .default('commands')
    .describe('Build mode: commands for creative, survival for manual placement'),
  commands: z
    .array(z.string())
    .optional()
    .describe('Array of commands to execute (for commands mode)'),
  x: z.number().optional().describe('X coordinate (for survival mode)'),
  y: z.number().optional().describe('Y coordinate (for survival mode)'),
  z: z.number().optional().describe('Z coordinate (for survival mode)'),
  itemName: z.string().optional().describe('Item to place (for survival mode)'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  ok: boolean;
  mode: string;
  blockedCommands?: string[];
  error?: string;
}

export class BuildSomethingTool extends BaseTool<Input, Output> {
  readonly name = 'buildSomething';
  readonly description = 'Build using commands (creative) or survival placement';
  readonly category = 'building' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { mode, commands, x, y, z, itemName } = input;
    const equipment = createEquipmentService();

    return withTask(bot, async (_signal) => {
      if (mode === 'commands') {
        if (!Array.isArray(commands) || commands.length === 0) {
          throw new Error('Provide commands array');
        }

        // Validate all commands before executing any
        const blockedCommands: string[] = [];
        const validCommands: string[] = [];

        for (const c of commands) {
          const cmd = c.trim().startsWith('/') ? c.trim() : `/${c.trim()}`;
          const validation = validateBuildCommand(cmd);

          if (!validation.valid) {
            blockedCommands.push(cmd);
          } else if (validation.message) {
            validCommands.push(validation.message);
          }
        }

        // If any commands were blocked, report them
        if (blockedCommands.length > 0) {
          const allowedList = ALLOWED_BUILD_COMMANDS.join(', ');
          return {
            ok: false,
            mode,
            blockedCommands,
            error: `Some commands are not allowed. Only building commands are permitted: ${allowedList}`,
          };
        }

        // Execute validated commands
        for (const cmd of validCommands) {
          bot.chat(cmd);
        }

        return { ok: true, mode };
      }

      // Survival build: requires coordinates and itemName in inventory
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        throw new Error('Provide x,y,z');
      }

      if (!itemName) {
        throw new Error('itemName required');
      }

      const item = bot.inventory.items().find((i) => i.name === itemName);
      if (!item) {
        throw new Error('Item not in inventory');
      }

      // x, y, z are validated as finite above, so we can safely use them
      const targetX = x as number;
      const targetY = y as number;
      const targetZ = z as number;

      const support = bot.blockAt(new Vec3(targetX, targetY - 1, targetZ));
      if (!support) {
        throw new Error('No support block below target');
      }

      equipment.pushSuspendAutoEat(bot);
      try {
        await bot.equip(item, 'hand');
      } finally {
        equipment.popSuspendAutoEat(bot);
      }

      // Navigate close
      const movements = configureMovements(bot);
      bot.pathfinder.setMovements(movements);
      bot.pathfinder.setGoal(new goals.GoalNear(targetX, targetY, targetZ, 2));

      const begin = Date.now();
      while (Date.now() - begin < 20000) {
        if (bot.entity.position.distanceTo(new Vec3(targetX, targetY, targetZ)) <= 4.5) break;
        await bot.waitForTicks(5);
      }

      equipment.pushSuspendAutoEat(bot);
      try {
        await bot.placeBlock(support, new Vec3(0, 1, 0));
      } finally {
        equipment.popSuspendAutoEat(bot);
      }

      return { ok: true, mode };
    });
  }
}
