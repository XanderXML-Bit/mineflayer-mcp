/**
 * Auto-Defense Tool
 *
 * Configure automatic defensive combat behavior.
 * When enabled, the bot will automatically fight back when attacked.
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import {
  setAutoDefenseEnabled,
  configureAutoDefense,
  getAutoDefenseStatus,
  type AutoDefenseConfig,
} from '../../services/auto-defense.service.js';

const InputSchema = BaseInputSchema.extend({
  action: z
    .enum(['enable', 'disable', 'configure', 'status'])
    .describe('Action to perform'),
  config: z
    .object({
      minHealthToFight: z.number().optional().describe('Minimum health to engage combat (flee below this)'),
      attackRange: z.number().optional().describe('Range to attack from'),
      chase: z.boolean().optional().describe('Whether to chase attackers'),
      maxChaseDistance: z.number().optional().describe('Maximum distance to chase'),
      proactiveDefense: z.boolean().optional().describe('Attack nearby hostiles proactively'),
      proactiveRadius: z.number().optional().describe('Radius for proactive defense'),
    })
    .optional()
    .describe('Configuration options (for configure action)'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  success: boolean;
  enabled: boolean;
  isAttacking: boolean;
  currentTarget: string | null;
  config: AutoDefenseConfig;
  message: string;
}

export class AutoDefenseTool extends BaseTool<Input, Output> {
  readonly name = 'configureAutoDefense';
  readonly description =
    'Configure automatic defensive combat. When enabled, the bot automatically fights back when attacked and can proactively defend against nearby hostile mobs.';
  readonly category = 'combat' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { action, config } = input;

    switch (action) {
      case 'enable':
        setAutoDefenseEnabled(bot, true);
        if (config) {
          configureAutoDefense(bot, config);
        }
        break;

      case 'disable':
        setAutoDefenseEnabled(bot, false);
        break;

      case 'configure':
        if (config) {
          configureAutoDefense(bot, config);
        }
        break;

      case 'status':
        // Just return status, no changes
        break;
    }

    const status = getAutoDefenseStatus(bot);

    const messages: Record<string, string> = {
      enable: 'Auto-defense enabled. Bot will automatically fight back when attacked.',
      disable: 'Auto-defense disabled. Bot will not automatically engage in combat.',
      configure: 'Auto-defense configuration updated.',
      status: status.enabled
        ? `Auto-defense is enabled${status.isAttacking ? ` and currently fighting ${status.currentTarget}` : ''}.`
        : 'Auto-defense is disabled.',
    };

    return {
      success: true,
      enabled: status.enabled,
      isAttacking: status.isAttacking,
      currentTarget: status.currentTarget,
      config: status.config,
      message: messages[action],
    };
  }
}
