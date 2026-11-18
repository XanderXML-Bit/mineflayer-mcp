/**
 * Throw Eye Tool
 * Throw an eye of ender to locate a stronghold
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { withTask } from '../../services/task.service.js';


const InputSchema = BaseInputSchema.extend({
  trackDirection: z.boolean().optional().default(true)
    .describe('Track the direction the eye travels'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  success: boolean;
  thrownFrom: { x: number; y: number; z: number };
  direction?: { x: number; z: number };
  angle?: number;
  eyeRecovered?: boolean;
  eyesRemaining: number;
  error?: string;
}

export class ThrowEyeTool extends BaseTool<Input, Output> {
  readonly name = 'throwEyeOfEnder';
  readonly description = 'Throw an eye of ender to help locate a stronghold';
  readonly category = 'navigation' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    return withTask(bot, async (signal) => {
      let aborted = false;
      signal.onAbort(() => { aborted = true; });

      // Find eye of ender in inventory
      const eye = bot.inventory.items().find(i => i.name === 'ender_eye');
      if (!eye) {
        return {
          success: false,
          thrownFrom: { x: 0, y: 0, z: 0 },
          eyesRemaining: 0,
          error: 'No eye of ender in inventory',
        };
      }

      const startPos = bot.entity.position.clone();
      const eyesBeforeThrow = eye.count;

      // Equip and use the eye
      await bot.equip(eye, 'hand');

      // Look up slightly to throw
      await bot.look(bot.entity.yaw, -Math.PI / 6);

      // Activate the eye
      await bot.activateItem();

      // Wait a moment to track the eye
      await new Promise(resolve => setTimeout(resolve, 500));

      // Track where the eye goes
      let direction: { x: number; z: number } | undefined;
      let angle: number | undefined;

      if (input.trackDirection) {
        // Find the thrown eye entity
        const eyeEntity = Object.values(bot.entities).find(e =>
          e.name === 'eye_of_ender' || e.objectType === 'EyeOfEnder'
        );

        if (eyeEntity) {
          // Track for a few seconds
          const trackStart = Date.now();
          let lastPos = eyeEntity.position.clone();

          while (Date.now() - trackStart < 3000 && !aborted) {
            await new Promise(resolve => setTimeout(resolve, 100));

            const currentEntity = bot.entities[eyeEntity.id];
            if (!currentEntity) break;

            const currentPos = currentEntity.position;
            if (currentPos.y < lastPos.y && currentPos.y < startPos.y) {
              // Eye is descending - stronghold might be below
              break;
            }

            lastPos = currentPos.clone();
          }

          // Calculate direction from start to where eye went
          const dx = lastPos.x - startPos.x;
          const dz = lastPos.z - startPos.z;
          const length = Math.sqrt(dx * dx + dz * dz);

          if (length > 0.5) {
            direction = {
              x: dx / length,
              z: dz / length,
            };
            // Calculate angle in degrees (0 = south, 90 = west, etc.)
            angle = Math.atan2(-dx, dz) * (180 / Math.PI);
            if (angle < 0) angle += 360;
          }
        }
      }

      // Wait for eye to potentially drop
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check if we can pick up the eye
      let eyeRecovered = false;
      const nearbyItems = Object.values(bot.entities).filter(e =>
        e.objectType === 'Item' &&
        e.position.distanceTo(startPos) < 10
      );

      for (const item of nearbyItems) {
        if (aborted) break;
        try {
          // Walk to item
          const dx = item.position.x - bot.entity.position.x;
          const dz = item.position.z - bot.entity.position.z;
          const dist = Math.sqrt(dx * dx + dz * dz);

          if (dist > 0.5) {
            bot.setControlState('forward', true);
            await bot.lookAt(item.position);
            await new Promise(resolve => setTimeout(resolve, Math.min(dist * 200, 2000)));
            bot.setControlState('forward', false);
          }
        } catch {
          // Continue
        }
      }

      // Check remaining eyes
      const eyesAfter = bot.inventory.items().find(i => i.name === 'ender_eye');
      const eyesRemaining = eyesAfter?.count || 0;
      eyeRecovered = eyesRemaining >= eyesBeforeThrow;

      return {
        success: true,
        thrownFrom: {
          x: Math.round(startPos.x),
          y: Math.round(startPos.y),
          z: Math.round(startPos.z),
        },
        direction,
        angle: angle ? Math.round(angle) : undefined,
        eyeRecovered,
        eyesRemaining,
      };
    });
  }
}
