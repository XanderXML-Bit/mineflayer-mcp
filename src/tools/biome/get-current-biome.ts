/**
 * Get Current Biome Tool
 * Get the biome at the bot's current location
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import mcData from 'minecraft-data';

/** Block with biome property */
interface BlockWithBiome {
  biome?: { id?: number };
}

/** World with getBiome method */
interface WorldWithBiome {
  getBiome?(pos: { x: number; y: number; z: number }): number | undefined;
  getBiome?(x: number, y: number, z: number): number | undefined;
}

/** Biome data entry from minecraft-data */
interface BiomeDataEntry {
  name?: string;
  temperature?: number;
  precipitation?: string;
}

/** Biomes indexed by ID */
interface BiomesById {
  [id: number]: BiomeDataEntry | undefined;
}

/** Game state with dimension */
interface GameWithDimension {
  dimension?: string;
}

const InputSchema = BaseInputSchema.extend({});

type Input = z.infer<typeof InputSchema>;

interface BiomeInfo {
  name: string;
  id: number;
  category: string;
  temperature: number;
  precipitation: string;
  dimension: string;
  features: string[];
}

interface Output {
  success: boolean;
  biome?: BiomeInfo;
  position?: { x: number; y: number; z: number };
  error?: string;
}

// Biome categories for grouping
const BIOME_CATEGORIES: Record<string, string[]> = {
  'forest': ['forest', 'birch_forest', 'dark_forest', 'flower_forest', 'old_growth_birch_forest', 'old_growth_pine_taiga', 'old_growth_spruce_taiga', 'grove', 'cherry_grove'],
  'plains': ['plains', 'sunflower_plains', 'meadow'],
  'desert': ['desert'],
  'mountain': ['mountains', 'windswept_hills', 'windswept_gravelly_hills', 'windswept_forest', 'stony_peaks', 'jagged_peaks', 'frozen_peaks', 'snowy_slopes'],
  'ocean': ['ocean', 'deep_ocean', 'warm_ocean', 'lukewarm_ocean', 'cold_ocean', 'frozen_ocean', 'deep_lukewarm_ocean', 'deep_cold_ocean', 'deep_frozen_ocean'],
  'swamp': ['swamp', 'mangrove_swamp'],
  'jungle': ['jungle', 'sparse_jungle', 'bamboo_jungle'],
  'taiga': ['taiga', 'snowy_taiga'],
  'tundra': ['snowy_plains', 'ice_spikes', 'snowy_beach', 'frozen_river'],
  'savanna': ['savanna', 'savanna_plateau', 'windswept_savanna'],
  'badlands': ['badlands', 'eroded_badlands', 'wooded_badlands'],
  'beach': ['beach', 'stony_shore'],
  'river': ['river'],
  'cave': ['lush_caves', 'dripstone_caves', 'deep_dark'],
  'nether': ['nether_wastes', 'soul_sand_valley', 'crimson_forest', 'warped_forest', 'basalt_deltas'],
  'end': ['the_end', 'end_barrens', 'end_highlands', 'end_midlands', 'small_end_islands'],
  'mushroom': ['mushroom_fields'],
};

// Notable features by biome
const BIOME_FEATURES: Record<string, string[]> = {
  'forest': ['oak trees', 'pigs', 'sheep', 'wolves'],
  'birch_forest': ['birch trees', 'flowers'],
  'dark_forest': ['dark oak trees', 'mushrooms', 'woodland mansions possible'],
  'plains': ['villages common', 'horses', 'donkeys', 'bees'],
  'desert': ['sand', 'cacti', 'desert temples', 'villages', 'husks spawn at night'],
  'jungle': ['jungle trees', 'cocoa beans', 'parrots', 'ocelots', 'jungle temples', 'melons'],
  'swamp': ['witch huts', 'slimes', 'lily pads', 'blue orchids'],
  'ocean': ['fish', 'dolphins', 'shipwrecks', 'ocean monuments (deep)'],
  'mushroom_fields': ['mooshrooms', 'huge mushrooms', 'no hostile mobs'],
  'badlands': ['gold ore more common', 'terracotta', 'mineshafts at surface'],
  'taiga': ['spruce trees', 'foxes', 'sweet berries', 'villages'],
  'snowy_plains': ['snow', 'igloos', 'strays spawn at night', 'polar bears'],
  'savanna': ['acacia trees', 'villages', 'pillager outposts', 'llamas'],
  'nether_wastes': ['ghasts', 'zombie piglins', 'nether quartz', 'nether fortresses'],
  'soul_sand_valley': ['soul sand', 'soul soil', 'skeletons', 'ghasts', 'blue fire'],
  'crimson_forest': ['piglins', 'hoglins', 'crimson stems', 'shroomlights'],
  'warped_forest': ['endermen common', 'warped stems', 'safe from hoglins'],
  'basalt_deltas': ['basalt', 'blackstone', 'magma cubes'],
  'the_end': ['endermen', 'ender dragon', 'end cities (outer islands)', 'shulkers'],
  'lush_caves': ['glow berries', 'axolotls', 'azalea', 'dripleaf'],
  'dripstone_caves': ['dripstone', 'pointed dripstone', 'drowning hazard'],
  'deep_dark': ['sculk', 'warden', 'ancient cities', 'extremely dangerous'],
};

function getCategoryForBiome(biomeName: string): string {
  for (const [category, biomes] of Object.entries(BIOME_CATEGORIES)) {
    if (biomes.some(b => biomeName.toLowerCase().includes(b.toLowerCase()))) {
      return category;
    }
  }
  return 'unknown';
}

function getFeaturesForBiome(biomeName: string): string[] {
  const lowerName = biomeName.toLowerCase();
  for (const [biomeKey, features] of Object.entries(BIOME_FEATURES)) {
    if (lowerName.includes(biomeKey.toLowerCase())) {
      return features;
    }
  }
  return [];
}

export class GetCurrentBiomeTool extends BaseTool<Input, Output> {
  readonly name = 'getCurrentBiome';
  readonly description = 'Get information about the biome at current location';
  readonly category = 'observation' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const data = mcData(bot.version);
    const pos = bot.entity.position;

    // Get biome at current position
    const block = bot.blockAt(pos);
    if (!block) {
      return { success: false, error: 'Could not get block at current position' };
    }

    // Try to get biome info
    const blockWithBiome = block as unknown as BlockWithBiome;
    const worldWithBiome = bot.world as unknown as WorldWithBiome;
    const biomeId = blockWithBiome.biome?.id ?? worldWithBiome.getBiome?.(pos);

    let biomeName = 'unknown';
    let biomeData: BiomeDataEntry | undefined = undefined;

    if (typeof biomeId === 'number' && data.biomes) {
      const biomesById = data.biomes as BiomesById;
      biomeData = biomesById[biomeId];
      if (biomeData) {
        biomeName = biomeData.name || `biome_${biomeId}`;
      }
    }

    // Try alternative method
    if (biomeName === 'unknown') {
      try {
        const worldBiome = worldWithBiome.getBiome?.(pos.x, pos.y, pos.z);
        if (typeof worldBiome === 'number' && data.biomes) {
          const biomesById = data.biomes as BiomesById;
          biomeData = biomesById[worldBiome];
          if (biomeData) {
            biomeName = biomeData.name || `biome_${worldBiome}`;
          }
        }
      } catch {
        // Biome lookup not available
      }
    }

    const gameWithDimension = bot.game as GameWithDimension;
    const dimension = gameWithDimension.dimension || 'overworld';
    const category = getCategoryForBiome(biomeName);
    const features = getFeaturesForBiome(biomeName);

    // Infer precipitation and temperature from biome name if not available
    let precipitation = 'none';
    let temperature = 0.5;

    if (biomeData) {
      temperature = biomeData.temperature ?? 0.5;
      precipitation = biomeData.precipitation ?? (
        biomeName.includes('snow') || biomeName.includes('frozen') || biomeName.includes('ice') ? 'snow' :
        biomeName.includes('desert') || biomeName.includes('badlands') ? 'none' :
        dimension === 'nether' || dimension === 'the_end' ? 'none' : 'rain'
      );
    } else {
      // Infer from name
      if (biomeName.includes('snow') || biomeName.includes('frozen') || biomeName.includes('ice')) {
        precipitation = 'snow';
        temperature = 0;
      } else if (biomeName.includes('desert') || biomeName.includes('badlands')) {
        precipitation = 'none';
        temperature = 2.0;
      } else if (dimension === 'nether') {
        precipitation = 'none';
        temperature = 2.0;
      } else if (dimension === 'the_end') {
        precipitation = 'none';
        temperature = 0.5;
      } else {
        precipitation = 'rain';
      }
    }

    return {
      success: true,
      biome: {
        name: biomeName,
        id: biomeId ?? -1,
        category,
        temperature,
        precipitation,
        dimension,
        features,
      },
      position: {
        x: Math.floor(pos.x),
        y: Math.floor(pos.y),
        z: Math.floor(pos.z),
      },
    };
  }
}
