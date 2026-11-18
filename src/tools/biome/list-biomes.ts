/**
 * List Biomes Tool
 * List available biome types and their characteristics
 */

import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import mcData from 'minecraft-data';

/** Biome data entry from minecraft-data */
interface BiomeDataEntry {
  name?: string;
  temperature?: number;
}

/** Biomes indexed by string ID */
interface BiomesByStringId {
  [id: string]: BiomeDataEntry | undefined;
}

const InputSchema = BaseInputSchema.extend({
  category: z.enum(['all', 'overworld', 'nether', 'end', 'ocean', 'forest', 'desert', 'mountain', 'cave']).optional().default('all')
    .describe('Filter biomes by category'),
});

type Input = z.infer<typeof InputSchema>;

interface BiomeEntry {
  name: string;
  id: number;
  category: string;
  temperature: number;
  features: string[];
}

interface Output {
  biomes: BiomeEntry[];
  count: number;
  categories: string[];
}

// Biome category mappings
const BIOME_CATEGORY_MAP: Record<string, string> = {
  'ocean': 'ocean',
  'deep_ocean': 'ocean',
  'warm_ocean': 'ocean',
  'lukewarm_ocean': 'ocean',
  'cold_ocean': 'ocean',
  'frozen_ocean': 'ocean',
  'deep_lukewarm_ocean': 'ocean',
  'deep_cold_ocean': 'ocean',
  'deep_frozen_ocean': 'ocean',

  'forest': 'forest',
  'birch_forest': 'forest',
  'dark_forest': 'forest',
  'flower_forest': 'forest',
  'old_growth_birch_forest': 'forest',
  'old_growth_pine_taiga': 'forest',
  'old_growth_spruce_taiga': 'forest',

  'desert': 'desert',

  'plains': 'overworld',
  'sunflower_plains': 'overworld',
  'meadow': 'overworld',
  'savanna': 'overworld',
  'savanna_plateau': 'overworld',
  'windswept_savanna': 'overworld',
  'swamp': 'overworld',
  'mangrove_swamp': 'overworld',
  'jungle': 'overworld',
  'sparse_jungle': 'overworld',
  'bamboo_jungle': 'overworld',
  'taiga': 'overworld',
  'snowy_taiga': 'overworld',
  'snowy_plains': 'overworld',
  'ice_spikes': 'overworld',
  'beach': 'overworld',
  'snowy_beach': 'overworld',
  'stony_shore': 'overworld',
  'river': 'overworld',
  'frozen_river': 'overworld',
  'mushroom_fields': 'overworld',
  'badlands': 'overworld',
  'eroded_badlands': 'overworld',
  'wooded_badlands': 'overworld',
  'cherry_grove': 'overworld',
  'grove': 'overworld',

  'windswept_hills': 'mountain',
  'windswept_gravelly_hills': 'mountain',
  'windswept_forest': 'mountain',
  'stony_peaks': 'mountain',
  'jagged_peaks': 'mountain',
  'frozen_peaks': 'mountain',
  'snowy_slopes': 'mountain',

  'lush_caves': 'cave',
  'dripstone_caves': 'cave',
  'deep_dark': 'cave',

  'nether_wastes': 'nether',
  'soul_sand_valley': 'nether',
  'crimson_forest': 'nether',
  'warped_forest': 'nether',
  'basalt_deltas': 'nether',

  'the_end': 'end',
  'end_barrens': 'end',
  'end_highlands': 'end',
  'end_midlands': 'end',
  'small_end_islands': 'end',
};

// Notable features for each biome
const BIOME_FEATURES: Record<string, string[]> = {
  'plains': ['villages', 'horses', 'bees', 'flat terrain'],
  'forest': ['oak trees', 'wolves', 'mushrooms'],
  'birch_forest': ['birch trees', 'flowers'],
  'dark_forest': ['dark oak trees', 'woodland mansions', 'mushrooms'],
  'flower_forest': ['many flower types', 'bees'],
  'desert': ['sand', 'cacti', 'desert temples', 'villages', 'husks'],
  'jungle': ['jungle temples', 'bamboo', 'parrots', 'ocelots', 'melons'],
  'swamp': ['witch huts', 'slimes', 'lily pads'],
  'ocean': ['fish', 'dolphins', 'shipwrecks'],
  'deep_ocean': ['ocean monuments', 'guardians'],
  'mushroom_fields': ['mooshrooms', 'huge mushrooms', 'no hostile spawns'],
  'badlands': ['gold ore common', 'terracotta', 'mineshafts'],
  'taiga': ['villages', 'foxes', 'sweet berries'],
  'snowy_plains': ['igloos', 'strays', 'polar bears'],
  'savanna': ['villages', 'llamas', 'acacia trees'],
  'mountains': ['emeralds', 'goats', 'high altitude'],
  'nether_wastes': ['nether quartz', 'ghasts', 'zombie piglins'],
  'soul_sand_valley': ['soul sand', 'skeletons', 'blue fire'],
  'crimson_forest': ['piglins', 'hoglins', 'nether wart'],
  'warped_forest': ['endermen common', 'safe from hoglins'],
  'basalt_deltas': ['basalt', 'blackstone', 'magma cubes'],
  'the_end': ['end cities', 'ender dragon', 'shulkers'],
  'lush_caves': ['axolotls', 'glow berries', 'azalea'],
  'dripstone_caves': ['dripstone', 'pointed dripstone'],
  'deep_dark': ['warden', 'sculk', 'ancient cities'],
  'cherry_grove': ['cherry trees', 'pink petals'],
  'meadow': ['flowers', 'villages possible', 'bees'],
};

function getBiomeCategory(biomeName: string): string {
  const lower = biomeName.toLowerCase();
  return BIOME_CATEGORY_MAP[lower] || 'overworld';
}

function getBiomeFeatures(biomeName: string): string[] {
  const lower = biomeName.toLowerCase();
  return BIOME_FEATURES[lower] || [];
}

export class ListBiomesTool extends BaseTool<Input, Output> {
  readonly name = 'listBiomes';
  readonly description = 'List available biome types and their characteristics';
  readonly category = 'observation' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { category } = input;
    const data = mcData(bot.version);

    const biomes: BiomeEntry[] = [];
    const categories = new Set<string>();

    // Get all biomes from minecraft-data
    if (data.biomes) {
      const biomeData = data.biomes as BiomesByStringId;
      for (const id in biomeData) {
        const biome = biomeData[id];
        if (!biome?.name) continue;

        const biomeCategory = getBiomeCategory(biome.name);
        categories.add(biomeCategory);

        // Filter by category if specified
        if (category !== 'all' && biomeCategory !== category) {
          continue;
        }

        biomes.push({
          name: biome.name,
          id: Number(id),
          category: biomeCategory,
          temperature: biome.temperature ?? 0.5,
          features: getBiomeFeatures(biome.name),
        });
      }
    }

    // Sort by category then name
    biomes.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.name.localeCompare(b.name);
    });

    return {
      biomes,
      count: biomes.length,
      categories: Array.from(categories).sort(),
    };
  }
}
