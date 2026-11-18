/**
 * Find Villager Tool
 * Finds villagers by profession or type
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';

/** Villager data from metadata */
interface VillagerData {
  profession?: number;
  level?: number;
}

/** Metadata entry with villager data */
interface VillagerMetadataEntry {
  villagerData?: VillagerData;
  key?: number;
  index?: number;
  value?: boolean;
}

const InputSchema = BaseInputSchema.extend({
  profession: z.string().optional().describe('Villager profession to find (e.g., farmer, librarian, blacksmith)'),
  maxDistance: z.number().optional().default(32).describe('Maximum search distance'),
});

type Input = z.infer<typeof InputSchema>;

interface VillagerInfo {
  entityId: number;
  profession: string;
  level: number;
  position: { x: number; y: number; z: number };
  distance: number;
  isBaby: boolean;
  canTrade: boolean;
}

interface Output {
  villagers: VillagerInfo[];
  count: number;
  closestWithTrades?: VillagerInfo;
}

// Villager profession mappings
const PROFESSION_NAMES: Record<number, string> = {
  0: 'none',
  1: 'armorer',
  2: 'butcher',
  3: 'cartographer',
  4: 'cleric',
  5: 'farmer',
  6: 'fisherman',
  7: 'fletcher',
  8: 'leatherworker',
  9: 'librarian',
  10: 'mason',
  11: 'nitwit',
  12: 'shepherd',
  13: 'toolsmith',
  14: 'weaponsmith',
};

export class FindVillagerTool extends BaseTool<Input, Output> {
  readonly name = 'findVillager';
  readonly description = 'Find villagers by profession within a radius';
  readonly category = 'trading' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { profession, maxDistance } = input;

    const villagers: VillagerInfo[] = [];
    const botPos = bot.entity.position;

    // Find all villager entities
    for (const entity of Object.values(bot.entities)) {
      if (entity.name !== 'villager') continue;

      const distance = entity.position.distanceTo(botPos);
      if (distance > (maxDistance ?? 32)) continue;

      // Get villager metadata
      const metadata = entity.metadata;
      let professionId = 0;
      let level = 1;
      let isBaby = false;

      // Parse metadata for villager data
      if (metadata) {
        for (const entry of metadata) {
          if (entry && typeof entry === 'object') {
            const entryObj = entry as VillagerMetadataEntry;
            // VillagerData in newer versions
            if (entryObj.villagerData) {
              const vData = entryObj.villagerData;
              professionId = vData.profession || 0;
              level = vData.level || 1;
            }
            // Check for baby - metadata index 16 is typically the baby flag
            if (entryObj.key === 16 || entryObj.index === 16) {
              isBaby = !!entryObj.value;
            }
          }
        }
      }

      const professionName = PROFESSION_NAMES[professionId] || 'unknown';

      // Filter by profession if specified
      if (profession) {
        const searchProf = profession.toLowerCase().replace(/[_\s]/g, '');
        const actualProf = professionName.toLowerCase().replace(/[_\s]/g, '');
        if (!actualProf.includes(searchProf) && !searchProf.includes(actualProf)) {
          continue;
        }
      }

      const canTrade = professionId !== 0 && professionId !== 11 && !isBaby;

      villagers.push({
        entityId: entity.id,
        profession: professionName,
        level,
        position: {
          x: Math.round(entity.position.x),
          y: Math.round(entity.position.y),
          z: Math.round(entity.position.z),
        },
        distance: Math.round(distance * 10) / 10,
        isBaby,
        canTrade,
      });
    }

    // Sort by distance
    villagers.sort((a, b) => a.distance - b.distance);

    // Find closest villager that can trade
    const closestWithTrades = villagers.find(v => v.canTrade);

    return {
      villagers,
      count: villagers.length,
      closestWithTrades,
    };
  }
}
