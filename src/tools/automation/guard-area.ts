/**
 * Guard Area Tool
 * Patrol and defend an area from hostile mobs
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { withTask } from '../../services/task.service.js';
import { configureMovements } from '../../services/navigation.service.js';
import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg;

const InputSchema = BaseInputSchema.extend({
  radius: z.number().optional().default(20).describe('Radius of the area to guard'),
  duration: z.number().optional().default(300).describe('How long to guard in seconds'),
  patrolPattern: z.enum(['stationary', 'circle', 'random']).optional().default('circle')
    .describe('Movement pattern while guarding'),
  targetHostiles: z.boolean().optional().default(true).describe('Attack hostile mobs'),
  targetAnimals: z.boolean().optional().default(false).describe('Attack passive animals'),
  alertPlayer: z.boolean().optional().default(true).describe('Send chat alerts about threats'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  success: boolean;
  mobsKilled: number;
  threatsDetected: number;
  patrolsCompleted: number;
  duration: number;
  error?: string;
}

// Hostile mob types
const HOSTILE_MOBS = [
  'zombie', 'skeleton', 'spider', 'creeper', 'witch', 'enderman',
  'zombie_villager', 'drowned', 'husk', 'stray', 'phantom',
  'slime', 'magma_cube', 'blaze', 'ghast', 'wither_skeleton',
  'piglin', 'piglin_brute', 'hoglin', 'zoglin',
  'pillager', 'vindicator', 'evoker', 'ravager', 'vex',
  'warden', 'guardian', 'elder_guardian', 'shulker',
];

// Animals
const ANIMALS = [
  'pig', 'cow', 'sheep', 'chicken', 'horse', 'donkey', 'mule',
  'llama', 'rabbit', 'fox', 'goat', 'mooshroom', 'bee',
];

export class GuardAreaTool extends BaseTool<Input, Output> {
  readonly name = 'guardArea';
  readonly description = 'Patrol and defend an area from hostile mobs';
  readonly category = 'automation' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    return withTask(bot, async (signal) => {
      let aborted = false;
      signal.onAbort(() => { aborted = true; });

      const { radius, duration, patrolPattern, targetHostiles, targetAnimals, alertPlayer } = input;
      const guardRadius = radius ?? 20;
      const guardDuration = duration ?? 300;
      const centerPos = bot.entity.position.clone();
      const startTime = Date.now();
      const endTime = startTime + (guardDuration * 1000);

      let mobsKilled = 0;
      let threatsDetected = 0;
      let patrolsCompleted = 0;
      let patrolAngle = 0;

      // Get weapon
      const weapons = bot.inventory.items().filter(i =>
        i.name.includes('sword') || i.name.includes('axe')
      );
      weapons.sort((a, b) => {
        // Sort by material tier
        const tierOrder = ['netherite', 'diamond', 'iron', 'golden', 'stone', 'wooden'];
        const aTier = tierOrder.findIndex(t => a.name.includes(t));
        const bTier = tierOrder.findIndex(t => b.name.includes(t));
        return aTier - bTier;
      });

      // Configure pathfinder
      const movements = configureMovements(bot);
      movements.canDig = false;
      movements.allowParkour = true;
      movements.allowSprinting = true;
      bot.pathfinder.setMovements(movements);

      while (!aborted && Date.now() < endTime) {
        // Scan for threats
        const targetMobs = Object.values(bot.entities).filter(entity => {
          if (!entity || entity === bot.entity) return false;
          const distance = entity.position.distanceTo(centerPos);
          if (distance > guardRadius) return false;

          const mobType = entity.name?.toLowerCase() || '';

          if (targetHostiles && HOSTILE_MOBS.some(h => mobType.includes(h))) {
            return true;
          }
          if (targetAnimals && ANIMALS.some(a => mobType.includes(a))) {
            return true;
          }
          return false;
        });

        if (targetMobs.length > 0) {
          threatsDetected += targetMobs.length;

          // Alert player
          if (alertPlayer) {
            const threatNames = [...new Set(targetMobs.map(m => m.name))].join(', ');
            bot.chat(`Alert: Detected ${targetMobs.length} threat(s): ${threatNames}`);
          }

          // Attack nearest threat
          const nearest = targetMobs.sort((a, b) =>
            a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position)
          )[0];

          if (nearest) {
            // Equip weapon
            if (weapons.length > 0) {
              await bot.equip(weapons[0], 'hand');
            }

            // Attack
            const { GoalFollow } = goals;
            bot.pathfinder.setGoal(new GoalFollow(nearest, 2), true);

            // Attack loop
            const attackStart = Date.now();
            while (!aborted && Date.now() - attackStart < 10000) {
              const target = bot.entities[nearest.id];
              if (!target || target.position.distanceTo(centerPos) > guardRadius + 10) {
                break; // Target gone or left area
              }

              const dist = target.position.distanceTo(bot.entity.position);
              if (dist < 4) {
                try {
                  await bot.attack(target);
                  await new Promise(resolve => setTimeout(resolve, 500));
                } catch {
                  break;
                }
              }

              // Check if entity is dead (by checking if it still exists after attack)
              await new Promise(resolve => setTimeout(resolve, 100));
              if (!bot.entities[nearest.id]) {
                mobsKilled++;
                break;
              }
            }

            bot.pathfinder.stop();
          }
        } else {
          // Patrol if no threats
          if (patrolPattern === 'circle') {
            patrolAngle += Math.PI / 8;
            if (patrolAngle >= 2 * Math.PI) {
              patrolAngle = 0;
              patrolsCompleted++;
            }

            const patrolX = centerPos.x + Math.cos(patrolAngle) * (guardRadius * 0.7);
            const patrolZ = centerPos.z + Math.sin(patrolAngle) * (guardRadius * 0.7);

            const { GoalNear } = goals;
            try {
              await bot.pathfinder.goto(new GoalNear(patrolX, centerPos.y, patrolZ, 2));
            } catch {
              // Continue patrol
            }
          } else if (patrolPattern === 'random') {
            const angle = Math.random() * 2 * Math.PI;
            const dist = Math.random() * guardRadius * 0.8;
            const patrolX = centerPos.x + Math.cos(angle) * dist;
            const patrolZ = centerPos.z + Math.sin(angle) * dist;

            const { GoalNear } = goals;
            try {
              await bot.pathfinder.goto(new GoalNear(patrolX, centerPos.y, patrolZ, 2));
              patrolsCompleted++;
            } catch {
              // Continue
            }
          } else {
            // Stationary - just scan
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }

        // Brief pause between scans
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Return to center
      const { GoalNear } = goals;
      try {
        await bot.pathfinder.goto(new GoalNear(centerPos.x, centerPos.y, centerPos.z, 2));
      } catch {
        // Continue
      }

      const actualDuration = Math.round((Date.now() - startTime) / 1000);

      return {
        success: true,
        mobsKilled,
        threatsDetected,
        patrolsCompleted,
        duration: actualDuration,
      };
    });
  }
}
