/**
 * Find Biome Tool
 * Search for a specific biome type by exploring in a direction
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import { withTask } from '../../services/task.service.js';
import mcData from 'minecraft-data';
import { Vec3 } from 'vec3';

const InputSchema = BaseInputSchema.extend({
  biomeType: z.string().describe('Biome name or category to find (e.g., "desert", "jungle", "ocean")'),
  searchRadius: z.number().optional().default(500).describe('Maximum distance to search'),
  sampleInterval: z.number().optional().default(32).describe('Distance between sample points'),
});

type Input = z.infer<typeof InputSchema>;

interface BiomeLocation {
  biome: string;
  position: { x: number; y: number; z: number };
  distance: number;
  direction: string;
}

interface Output {
  found: boolean;
  locations: BiomeLocation[];
  nearest?: BiomeLocation;
  searched: number;
  error?: string;
}

// Biome aliases for easier searching
const BIOME_ALIASES: Record<string, string[]> = {
  'forest': ['forest', 'birch_forest', 'dark_forest', 'flower_forest', 'old_growth'],
  'desert': ['desert'],
  'jungle': ['jungle', 'bamboo_jungle', 'sparse_jungle'],
  'ocean': ['ocean', 'warm_ocean', 'lukewarm_ocean', 'cold_ocean', 'frozen_ocean', 'deep_ocean'],
  'mountain': ['mountains', 'windswept', 'peaks', 'slopes', 'stony'],
  'swamp': ['swamp', 'mangrove'],
  'plains': ['plains', 'meadow', 'sunflower'],
  'taiga': ['taiga', 'grove'],
  'snow': ['snowy', 'frozen', 'ice'],
  'savanna': ['savanna'],
  'badlands': ['badlands', 'mesa'],
  'beach': ['beach', 'stony_shore'],
  'mushroom': ['mushroom_fields'],
  'nether': ['nether', 'soul_sand', 'crimson', 'warped', 'basalt'],
  'end': ['the_end', 'end_'],
  'cave': ['caves', 'deep_dark', 'lush', 'dripstone'],
};

function biomeMatchesSearch(biomeName: string, searchTerm: string): boolean {
  const lowerBiome = biomeName.toLowerCase();
  const lowerSearch = searchTerm.toLowerCase();

  // Direct match
  if (lowerBiome.includes(lowerSearch)) return true;

  // Check aliases
  const aliases = BIOME_ALIASES[lowerSearch];
  if (aliases) {
    return aliases.some(alias => lowerBiome.includes(alias.toLowerCase()));
  }

  return false;
}

function getDirection(dx: number, dz: number): string {
  const angle = Math.atan2(dz, dx) * (180 / Math.PI);
  if (angle >= -22.5 && angle < 22.5) return 'east';
  if (angle >= 22.5 && angle < 67.5) return 'southeast';
  if (angle >= 67.5 && angle < 112.5) return 'south';
  if (angle >= 112.5 && angle < 157.5) return 'southwest';
  if (angle >= 157.5 || angle < -157.5) return 'west';
  if (angle >= -157.5 && angle < -112.5) return 'northwest';
  if (angle >= -112.5 && angle < -67.5) return 'north';
  return 'northeast';
}

export class FindBiomeTool extends BaseTool<Input, Output> {
  readonly name = 'findBiome';
  readonly description = 'Search for a specific biome type in the area';
  readonly category = 'navigation' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    return withTask(bot, async (signal) => {
      let aborted = false;
      signal.onAbort(() => { aborted = true; });

      const { biomeType, searchRadius, sampleInterval } = input;
      const data = mcData(bot.version);
      const startPos = bot.entity.position;
      const locations: BiomeLocation[] = [];
      let searched = 0;

      // Calculate sample points in a spiral pattern
      const sr = searchRadius ?? 500;
      const si = sampleInterval ?? 32;
      const directions = [
        { x: 1, z: 0 },   // East
        { x: 0, z: 1 },   // South
        { x: -1, z: 0 },  // West
        { x: 0, z: -1 },  // North
        { x: 1, z: 1 },   // SE
        { x: -1, z: 1 },  // SW
        { x: -1, z: -1 }, // NW
        { x: 1, z: -1 },  // NE
      ];

      // Sample in expanding rings
      for (let distance = si; distance <= sr && !aborted; distance += si) {
        for (const dir of directions) {
          if (aborted) break;
          if (locations.length >= 10) break; // Limit results

          const sampleX = startPos.x + dir.x * distance;
          const sampleZ = startPos.z + dir.z * distance;

          // Find a valid Y position (surface)
          let sampleY = startPos.y;
          for (let y = 256; y > 0; y--) {
            const block = bot.blockAt(new Vec3(sampleX, y, sampleZ));
            if (block && block.name !== 'air' && block.name !== 'void_air') {
              sampleY = y + 1;
              break;
            }
          }

          // Get biome at this position
          try {
            const samplePos = new Vec3(sampleX, sampleY, sampleZ);
            const block = bot.blockAt(samplePos);
            if (!block) continue;

            searched++;

            // Try different methods to get biome
            // Block may have biome property in some versions
            const blockWithBiome = block as { biome?: { id?: number } };
            let biomeId: number | undefined = blockWithBiome.biome?.id;
            if (biomeId === undefined) {
              // Try world.getBiome if available (takes Vec3)
              try {
                biomeId = bot.world.getBiome(new Vec3(sampleX, sampleY, sampleZ));
              } catch {
                // Ignore if getBiome fails
              }
            }

            if (typeof biomeId !== 'number') continue;

            // Access biomes data by ID
            const biomesRecord = data.biomes as Record<number, { name?: string; id: number }> | undefined;
            const biomeData = biomesRecord?.[biomeId];
            if (!biomeData) continue;

            const biomeName = biomeData.name || `biome_${biomeId}`;

            if (biomeMatchesSearch(biomeName, biomeType)) {
              const dx = sampleX - startPos.x;
              const dz = sampleZ - startPos.z;
              const actualDistance = Math.sqrt(dx * dx + dz * dz);

              // Avoid duplicates (same biome within 64 blocks)
              const isDuplicate = locations.some(loc =>
                loc.biome === biomeName &&
                Math.abs(loc.position.x - sampleX) < 64 &&
                Math.abs(loc.position.z - sampleZ) < 64
              );

              if (!isDuplicate) {
                locations.push({
                  biome: biomeName,
                  position: {
                    x: Math.round(sampleX),
                    y: Math.round(sampleY),
                    z: Math.round(sampleZ),
                  },
                  distance: Math.round(actualDistance),
                  direction: getDirection(dx, dz),
                });
              }
            }
          } catch {
            // Skip this sample point
          }
        }

        // Also sample intermediate points on the ring
        const ringPoints = Math.ceil((2 * Math.PI * distance) / si);
        for (let i = 0; i < ringPoints && !aborted && locations.length < 10; i++) {
          const angle = (2 * Math.PI * i) / ringPoints;
          const sampleX = startPos.x + Math.cos(angle) * distance;
          const sampleZ = startPos.z + Math.sin(angle) * distance;

          let sampleY = startPos.y;
          for (let y = 256; y > 0; y--) {
            const block = bot.blockAt(new Vec3(sampleX, y, sampleZ));
            if (block && block.name !== 'air' && block.name !== 'void_air') {
              sampleY = y + 1;
              break;
            }
          }

          try {
            const block = bot.blockAt(new Vec3(sampleX, sampleY, sampleZ));
            if (!block) continue;

            searched++;

            // Try different methods to get biome
            const blockWithBiome = block as { biome?: { id?: number } };
            let biomeId: number | undefined = blockWithBiome.biome?.id;
            if (biomeId === undefined) {
              // Try world.getBiome if available (takes Vec3)
              try {
                biomeId = bot.world.getBiome(new Vec3(sampleX, sampleY, sampleZ));
              } catch {
                // Ignore if getBiome fails
              }
            }

            if (typeof biomeId !== 'number') continue;

            const biomesRecord = data.biomes as Record<number, { name?: string; id: number }> | undefined;
            const biomeData = biomesRecord?.[biomeId];
            if (!biomeData) continue;

            const biomeName = biomeData.name || `biome_${biomeId}`;

            if (biomeMatchesSearch(biomeName, biomeType)) {
              const dx = sampleX - startPos.x;
              const dz = sampleZ - startPos.z;
              const actualDistance = Math.sqrt(dx * dx + dz * dz);

              const isDuplicate = locations.some(loc =>
                loc.biome === biomeName &&
                Math.abs(loc.position.x - sampleX) < 64 &&
                Math.abs(loc.position.z - sampleZ) < 64
              );

              if (!isDuplicate) {
                locations.push({
                  biome: biomeName,
                  position: {
                    x: Math.round(sampleX),
                    y: Math.round(sampleY),
                    z: Math.round(sampleZ),
                  },
                  distance: Math.round(actualDistance),
                  direction: getDirection(dx, dz),
                });
              }
            }
          } catch {
            // Skip
          }
        }
      }

      // Sort by distance
      locations.sort((a, b) => a.distance - b.distance);

      return {
        found: locations.length > 0,
        locations,
        nearest: locations[0],
        searched,
        error: locations.length === 0 ? `No ${biomeType} biome found within ${searchRadius} blocks` : undefined,
      };
    });
  }
}
