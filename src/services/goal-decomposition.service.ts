/**
 * Goal Decomposition Service
 *
 * Breaks down high-level goals into actionable subgoals using Minecraft's tech tree.
 * Inspired by Voyager's automatic curriculum generation.
 */

import { logger } from '../utils/logger.js';
import { getSkillLibrary, type Skill } from './skill-library.service.js';

const log = logger.child('goal-decomposition');

/**
 * Tech tree node representing an item/goal and its dependencies
 */
export interface TechTreeNode {
  id: string;
  name: string;
  description: string;
  /** Items required before this can be achieved */
  prerequisites: string[];
  /** Tools needed (not consumed) */
  toolsRequired: string[];
  /** Items consumed to achieve this */
  materialsRequired: { item: string; count: number }[];
  /** Category for grouping */
  category: TechCategory;
  /** Difficulty estimate (1-10) */
  difficulty: number;
  /** Approximate time in minutes */
  estimatedTime: number;
  /** Related skill names from skill library */
  relatedSkills: string[];
}

export type TechCategory =
  | 'gathering'
  | 'crafting'
  | 'smelting'
  | 'mining'
  | 'combat'
  | 'farming'
  | 'building'
  | 'exploration'
  | 'enchanting'
  | 'brewing'
  | 'nether'
  | 'end';

/**
 * Decomposed goal with ordered steps
 */
export interface DecomposedGoal {
  originalGoal: string;
  steps: GoalStep[];
  totalDifficulty: number;
  estimatedTotalTime: number;
  missingPrerequisites: string[];
  suggestedSkills: Skill[];
}

/**
 * A single step in a decomposed goal
 */
export interface GoalStep {
  id: string;
  description: string;
  action: string;
  target?: string;
  count?: number;
  toolRequired?: string;
  category: TechCategory;
  difficulty: number;
  estimatedTime: number;
  relatedSkill?: Skill;
  dependencies: string[];
  completed: boolean;
}

/**
 * Minecraft Tech Tree - defines dependencies between items/goals
 */
const TECH_TREE: TechTreeNode[] = [
  // === GATHERING (No prerequisites) ===
  {
    id: 'wood_logs',
    name: 'Gather Wood Logs',
    description: 'Punch trees to get wood logs',
    prerequisites: [],
    toolsRequired: [],
    materialsRequired: [],
    category: 'gathering',
    difficulty: 1,
    estimatedTime: 1,
    relatedSkills: ['mine_wood'],
  },
  {
    id: 'cobblestone',
    name: 'Mine Cobblestone',
    description: 'Mine stone with a pickaxe',
    prerequisites: ['wooden_pickaxe'],
    toolsRequired: ['wooden_pickaxe'],
    materialsRequired: [],
    category: 'mining',
    difficulty: 1,
    estimatedTime: 2,
    relatedSkills: ['mine_stone'],
  },
  {
    id: 'coal',
    name: 'Mine Coal',
    description: 'Mine coal ore with a pickaxe',
    prerequisites: ['wooden_pickaxe'],
    toolsRequired: ['wooden_pickaxe'],
    materialsRequired: [],
    category: 'mining',
    difficulty: 2,
    estimatedTime: 3,
    relatedSkills: ['mine_coal'],
  },
  {
    id: 'iron_ore',
    name: 'Mine Iron Ore',
    description: 'Mine iron ore with a stone pickaxe',
    prerequisites: ['stone_pickaxe'],
    toolsRequired: ['stone_pickaxe'],
    materialsRequired: [],
    category: 'mining',
    difficulty: 3,
    estimatedTime: 5,
    relatedSkills: ['mine_iron'],
  },
  {
    id: 'gold_ore',
    name: 'Mine Gold Ore',
    description: 'Mine gold ore with an iron pickaxe',
    prerequisites: ['iron_pickaxe'],
    toolsRequired: ['iron_pickaxe'],
    materialsRequired: [],
    category: 'mining',
    difficulty: 4,
    estimatedTime: 8,
    relatedSkills: [],
  },
  {
    id: 'diamond_ore',
    name: 'Mine Diamond',
    description: 'Mine diamonds at Y level -59 to 16',
    prerequisites: ['iron_pickaxe'],
    toolsRequired: ['iron_pickaxe'],
    materialsRequired: [],
    category: 'mining',
    difficulty: 6,
    estimatedTime: 15,
    relatedSkills: ['mine_diamond'],
  },
  {
    id: 'obsidian',
    name: 'Mine Obsidian',
    description: 'Mine obsidian with a diamond pickaxe',
    prerequisites: ['diamond_pickaxe'],
    toolsRequired: ['diamond_pickaxe'],
    materialsRequired: [],
    category: 'mining',
    difficulty: 5,
    estimatedTime: 10,
    relatedSkills: [],
  },

  // === BASIC CRAFTING ===
  {
    id: 'planks',
    name: 'Craft Planks',
    description: 'Craft wood logs into planks',
    prerequisites: ['wood_logs'],
    toolsRequired: [],
    materialsRequired: [{ item: 'oak_log', count: 1 }],
    category: 'crafting',
    difficulty: 1,
    estimatedTime: 0.5,
    relatedSkills: ['craft_planks'],
  },
  {
    id: 'sticks',
    name: 'Craft Sticks',
    description: 'Craft planks into sticks',
    prerequisites: ['planks'],
    toolsRequired: [],
    materialsRequired: [{ item: 'oak_planks', count: 2 }],
    category: 'crafting',
    difficulty: 1,
    estimatedTime: 0.5,
    relatedSkills: ['craft_sticks'],
  },
  {
    id: 'crafting_table',
    name: 'Craft Crafting Table',
    description: 'Craft 4 planks into a crafting table',
    prerequisites: ['planks'],
    toolsRequired: [],
    materialsRequired: [{ item: 'oak_planks', count: 4 }],
    category: 'crafting',
    difficulty: 1,
    estimatedTime: 0.5,
    relatedSkills: ['craft_crafting_table'],
  },
  {
    id: 'furnace',
    name: 'Craft Furnace',
    description: 'Craft 8 cobblestone into a furnace',
    prerequisites: ['cobblestone', 'crafting_table'],
    toolsRequired: [],
    materialsRequired: [{ item: 'cobblestone', count: 8 }],
    category: 'crafting',
    difficulty: 2,
    estimatedTime: 1,
    relatedSkills: ['craft_furnace'],
  },
  {
    id: 'chest',
    name: 'Craft Chest',
    description: 'Craft 8 planks into a chest',
    prerequisites: ['planks', 'crafting_table'],
    toolsRequired: [],
    materialsRequired: [{ item: 'oak_planks', count: 8 }],
    category: 'crafting',
    difficulty: 1,
    estimatedTime: 1,
    relatedSkills: [],
  },
  {
    id: 'torch',
    name: 'Craft Torches',
    description: 'Craft coal and sticks into torches',
    prerequisites: ['coal', 'sticks'],
    toolsRequired: [],
    materialsRequired: [{ item: 'coal', count: 1 }, { item: 'stick', count: 1 }],
    category: 'crafting',
    difficulty: 1,
    estimatedTime: 0.5,
    relatedSkills: [],
  },

  // === WOODEN TOOLS ===
  {
    id: 'wooden_pickaxe',
    name: 'Craft Wooden Pickaxe',
    description: 'Craft planks and sticks into a wooden pickaxe',
    prerequisites: ['planks', 'sticks', 'crafting_table'],
    toolsRequired: [],
    materialsRequired: [{ item: 'oak_planks', count: 3 }, { item: 'stick', count: 2 }],
    category: 'crafting',
    difficulty: 1,
    estimatedTime: 1,
    relatedSkills: ['craft_wooden_pickaxe'],
  },
  {
    id: 'wooden_axe',
    name: 'Craft Wooden Axe',
    description: 'Craft planks and sticks into a wooden axe',
    prerequisites: ['planks', 'sticks', 'crafting_table'],
    toolsRequired: [],
    materialsRequired: [{ item: 'oak_planks', count: 3 }, { item: 'stick', count: 2 }],
    category: 'crafting',
    difficulty: 1,
    estimatedTime: 1,
    relatedSkills: [],
  },
  {
    id: 'wooden_sword',
    name: 'Craft Wooden Sword',
    description: 'Craft planks and sticks into a wooden sword',
    prerequisites: ['planks', 'sticks', 'crafting_table'],
    toolsRequired: [],
    materialsRequired: [{ item: 'oak_planks', count: 2 }, { item: 'stick', count: 1 }],
    category: 'crafting',
    difficulty: 1,
    estimatedTime: 1,
    relatedSkills: [],
  },

  // === STONE TOOLS ===
  {
    id: 'stone_pickaxe',
    name: 'Craft Stone Pickaxe',
    description: 'Craft cobblestone and sticks into a stone pickaxe',
    prerequisites: ['cobblestone', 'sticks', 'crafting_table'],
    toolsRequired: [],
    materialsRequired: [{ item: 'cobblestone', count: 3 }, { item: 'stick', count: 2 }],
    category: 'crafting',
    difficulty: 2,
    estimatedTime: 1,
    relatedSkills: ['craft_stone_pickaxe'],
  },
  {
    id: 'stone_axe',
    name: 'Craft Stone Axe',
    description: 'Craft cobblestone and sticks into a stone axe',
    prerequisites: ['cobblestone', 'sticks', 'crafting_table'],
    toolsRequired: [],
    materialsRequired: [{ item: 'cobblestone', count: 3 }, { item: 'stick', count: 2 }],
    category: 'crafting',
    difficulty: 2,
    estimatedTime: 1,
    relatedSkills: [],
  },
  {
    id: 'stone_sword',
    name: 'Craft Stone Sword',
    description: 'Craft cobblestone and sticks into a stone sword',
    prerequisites: ['cobblestone', 'sticks', 'crafting_table'],
    toolsRequired: [],
    materialsRequired: [{ item: 'cobblestone', count: 2 }, { item: 'stick', count: 1 }],
    category: 'crafting',
    difficulty: 2,
    estimatedTime: 1,
    relatedSkills: [],
  },

  // === SMELTING ===
  {
    id: 'iron_ingot',
    name: 'Smelt Iron',
    description: 'Smelt iron ore in a furnace',
    prerequisites: ['iron_ore', 'furnace', 'coal'],
    toolsRequired: ['furnace'],
    materialsRequired: [{ item: 'raw_iron', count: 1 }, { item: 'coal', count: 1 }],
    category: 'smelting',
    difficulty: 3,
    estimatedTime: 2,
    relatedSkills: ['smelt_iron'],
  },
  {
    id: 'gold_ingot',
    name: 'Smelt Gold',
    description: 'Smelt gold ore in a furnace',
    prerequisites: ['gold_ore', 'furnace', 'coal'],
    toolsRequired: ['furnace'],
    materialsRequired: [{ item: 'raw_gold', count: 1 }, { item: 'coal', count: 1 }],
    category: 'smelting',
    difficulty: 4,
    estimatedTime: 2,
    relatedSkills: [],
  },

  // === IRON TOOLS ===
  {
    id: 'iron_pickaxe',
    name: 'Craft Iron Pickaxe',
    description: 'Craft iron ingots and sticks into an iron pickaxe',
    prerequisites: ['iron_ingot', 'sticks', 'crafting_table'],
    toolsRequired: [],
    materialsRequired: [{ item: 'iron_ingot', count: 3 }, { item: 'stick', count: 2 }],
    category: 'crafting',
    difficulty: 3,
    estimatedTime: 1,
    relatedSkills: ['craft_iron_pickaxe'],
  },
  {
    id: 'iron_axe',
    name: 'Craft Iron Axe',
    description: 'Craft iron ingots and sticks into an iron axe',
    prerequisites: ['iron_ingot', 'sticks', 'crafting_table'],
    toolsRequired: [],
    materialsRequired: [{ item: 'iron_ingot', count: 3 }, { item: 'stick', count: 2 }],
    category: 'crafting',
    difficulty: 3,
    estimatedTime: 1,
    relatedSkills: [],
  },
  {
    id: 'iron_sword',
    name: 'Craft Iron Sword',
    description: 'Craft iron ingots and sticks into an iron sword',
    prerequisites: ['iron_ingot', 'sticks', 'crafting_table'],
    toolsRequired: [],
    materialsRequired: [{ item: 'iron_ingot', count: 2 }, { item: 'stick', count: 1 }],
    category: 'crafting',
    difficulty: 3,
    estimatedTime: 1,
    relatedSkills: [],
  },
  {
    id: 'bucket',
    name: 'Craft Bucket',
    description: 'Craft 3 iron ingots into a bucket',
    prerequisites: ['iron_ingot', 'crafting_table'],
    toolsRequired: [],
    materialsRequired: [{ item: 'iron_ingot', count: 3 }],
    category: 'crafting',
    difficulty: 3,
    estimatedTime: 1,
    relatedSkills: [],
  },
  {
    id: 'shield',
    name: 'Craft Shield',
    description: 'Craft iron ingot and planks into a shield',
    prerequisites: ['iron_ingot', 'planks', 'crafting_table'],
    toolsRequired: [],
    materialsRequired: [{ item: 'iron_ingot', count: 1 }, { item: 'oak_planks', count: 6 }],
    category: 'crafting',
    difficulty: 3,
    estimatedTime: 1,
    relatedSkills: [],
  },

  // === IRON ARMOR ===
  {
    id: 'iron_helmet',
    name: 'Craft Iron Helmet',
    description: 'Craft 5 iron ingots into a helmet',
    prerequisites: ['iron_ingot', 'crafting_table'],
    toolsRequired: [],
    materialsRequired: [{ item: 'iron_ingot', count: 5 }],
    category: 'crafting',
    difficulty: 3,
    estimatedTime: 1,
    relatedSkills: [],
  },
  {
    id: 'iron_chestplate',
    name: 'Craft Iron Chestplate',
    description: 'Craft 8 iron ingots into a chestplate',
    prerequisites: ['iron_ingot', 'crafting_table'],
    toolsRequired: [],
    materialsRequired: [{ item: 'iron_ingot', count: 8 }],
    category: 'crafting',
    difficulty: 3,
    estimatedTime: 1,
    relatedSkills: [],
  },
  {
    id: 'iron_leggings',
    name: 'Craft Iron Leggings',
    description: 'Craft 7 iron ingots into leggings',
    prerequisites: ['iron_ingot', 'crafting_table'],
    toolsRequired: [],
    materialsRequired: [{ item: 'iron_ingot', count: 7 }],
    category: 'crafting',
    difficulty: 3,
    estimatedTime: 1,
    relatedSkills: [],
  },
  {
    id: 'iron_boots',
    name: 'Craft Iron Boots',
    description: 'Craft 4 iron ingots into boots',
    prerequisites: ['iron_ingot', 'crafting_table'],
    toolsRequired: [],
    materialsRequired: [{ item: 'iron_ingot', count: 4 }],
    category: 'crafting',
    difficulty: 3,
    estimatedTime: 1,
    relatedSkills: [],
  },

  // === DIAMOND TOOLS ===
  {
    id: 'diamond_pickaxe',
    name: 'Craft Diamond Pickaxe',
    description: 'Craft diamonds and sticks into a diamond pickaxe',
    prerequisites: ['diamond_ore', 'sticks', 'crafting_table'],
    toolsRequired: [],
    materialsRequired: [{ item: 'diamond', count: 3 }, { item: 'stick', count: 2 }],
    category: 'crafting',
    difficulty: 6,
    estimatedTime: 1,
    relatedSkills: ['craft_diamond_pickaxe'],
  },
  {
    id: 'diamond_sword',
    name: 'Craft Diamond Sword',
    description: 'Craft diamonds and sticks into a diamond sword',
    prerequisites: ['diamond_ore', 'sticks', 'crafting_table'],
    toolsRequired: [],
    materialsRequired: [{ item: 'diamond', count: 2 }, { item: 'stick', count: 1 }],
    category: 'crafting',
    difficulty: 6,
    estimatedTime: 1,
    relatedSkills: [],
  },

  // === FARMING ===
  {
    id: 'wheat_seeds',
    name: 'Gather Wheat Seeds',
    description: 'Break grass to get wheat seeds',
    prerequisites: [],
    toolsRequired: [],
    materialsRequired: [],
    category: 'farming',
    difficulty: 1,
    estimatedTime: 2,
    relatedSkills: ['gather_seeds'],
  },
  {
    id: 'wheat',
    name: 'Grow Wheat',
    description: 'Plant and harvest wheat',
    prerequisites: ['wheat_seeds', 'wooden_hoe'],
    toolsRequired: ['wooden_hoe'],
    materialsRequired: [{ item: 'wheat_seeds', count: 1 }],
    category: 'farming',
    difficulty: 2,
    estimatedTime: 10,
    relatedSkills: ['plant_seeds', 'harvest_crops'],
  },
  {
    id: 'bread',
    name: 'Craft Bread',
    description: 'Craft 3 wheat into bread',
    prerequisites: ['wheat', 'crafting_table'],
    toolsRequired: [],
    materialsRequired: [{ item: 'wheat', count: 3 }],
    category: 'crafting',
    difficulty: 2,
    estimatedTime: 1,
    relatedSkills: [],
  },
  {
    id: 'wooden_hoe',
    name: 'Craft Wooden Hoe',
    description: 'Craft planks and sticks into a wooden hoe',
    prerequisites: ['planks', 'sticks', 'crafting_table'],
    toolsRequired: [],
    materialsRequired: [{ item: 'oak_planks', count: 2 }, { item: 'stick', count: 2 }],
    category: 'crafting',
    difficulty: 1,
    estimatedTime: 1,
    relatedSkills: [],
  },

  // === COMBAT PREPARATION ===
  {
    id: 'combat_ready_basic',
    name: 'Basic Combat Readiness',
    description: 'Have a stone sword and some food',
    prerequisites: ['stone_sword', 'bread'],
    toolsRequired: ['stone_sword'],
    materialsRequired: [],
    category: 'combat',
    difficulty: 3,
    estimatedTime: 0,
    relatedSkills: [],
  },
  {
    id: 'combat_ready_iron',
    name: 'Iron Combat Readiness',
    description: 'Have iron armor and iron sword',
    prerequisites: ['iron_sword', 'iron_chestplate', 'shield'],
    toolsRequired: ['iron_sword', 'shield'],
    materialsRequired: [],
    category: 'combat',
    difficulty: 5,
    estimatedTime: 0,
    relatedSkills: [],
  },

  // === NETHER ===
  {
    id: 'nether_portal',
    name: 'Build Nether Portal',
    description: 'Build a nether portal from obsidian',
    prerequisites: ['obsidian', 'flint_and_steel'],
    toolsRequired: [],
    materialsRequired: [{ item: 'obsidian', count: 10 }],
    category: 'nether',
    difficulty: 7,
    estimatedTime: 15,
    relatedSkills: [],
  },
  {
    id: 'flint_and_steel',
    name: 'Craft Flint and Steel',
    description: 'Craft iron ingot and flint into flint and steel',
    prerequisites: ['iron_ingot', 'flint'],
    toolsRequired: [],
    materialsRequired: [{ item: 'iron_ingot', count: 1 }, { item: 'flint', count: 1 }],
    category: 'crafting',
    difficulty: 3,
    estimatedTime: 1,
    relatedSkills: [],
  },
  {
    id: 'flint',
    name: 'Gather Flint',
    description: 'Mine gravel until flint drops',
    prerequisites: [],
    toolsRequired: [],
    materialsRequired: [],
    category: 'gathering',
    difficulty: 1,
    estimatedTime: 3,
    relatedSkills: [],
  },

  // === ENCHANTING ===
  {
    id: 'enchanting_table',
    name: 'Craft Enchanting Table',
    description: 'Craft diamonds, obsidian, and book into enchanting table',
    prerequisites: ['diamond_ore', 'obsidian', 'book'],
    toolsRequired: [],
    materialsRequired: [
      { item: 'diamond', count: 2 },
      { item: 'obsidian', count: 4 },
      { item: 'book', count: 1 },
    ],
    category: 'enchanting',
    difficulty: 7,
    estimatedTime: 2,
    relatedSkills: [],
  },
  {
    id: 'book',
    name: 'Craft Book',
    description: 'Craft paper and leather into a book',
    prerequisites: ['paper', 'leather'],
    toolsRequired: [],
    materialsRequired: [{ item: 'paper', count: 3 }, { item: 'leather', count: 1 }],
    category: 'crafting',
    difficulty: 3,
    estimatedTime: 1,
    relatedSkills: [],
  },
  {
    id: 'paper',
    name: 'Craft Paper',
    description: 'Craft sugar cane into paper',
    prerequisites: ['sugar_cane'],
    toolsRequired: [],
    materialsRequired: [{ item: 'sugar_cane', count: 3 }],
    category: 'crafting',
    difficulty: 2,
    estimatedTime: 1,
    relatedSkills: [],
  },
  {
    id: 'sugar_cane',
    name: 'Gather Sugar Cane',
    description: 'Find and harvest sugar cane near water',
    prerequisites: [],
    toolsRequired: [],
    materialsRequired: [],
    category: 'gathering',
    difficulty: 2,
    estimatedTime: 5,
    relatedSkills: [],
  },
  {
    id: 'leather',
    name: 'Get Leather',
    description: 'Hunt cows for leather',
    prerequisites: [],
    toolsRequired: [],
    materialsRequired: [],
    category: 'combat',
    difficulty: 2,
    estimatedTime: 5,
    relatedSkills: ['hunt'],
  },

  // === ADVANCED ENCHANTING ===
  {
    id: 'bookshelf',
    name: 'Craft Bookshelf',
    description: 'Craft planks and books into a bookshelf for enchanting power',
    prerequisites: ['book', 'planks', 'crafting_table'],
    toolsRequired: [],
    materialsRequired: [{ item: 'oak_planks', count: 6 }, { item: 'book', count: 3 }],
    category: 'enchanting',
    difficulty: 4,
    estimatedTime: 2,
    relatedSkills: [],
  },
  {
    id: 'lapis_lazuli',
    name: 'Mine Lapis Lazuli',
    description: 'Mine lapis lazuli ore for enchanting',
    prerequisites: ['stone_pickaxe'],
    toolsRequired: ['stone_pickaxe'],
    materialsRequired: [],
    category: 'mining',
    difficulty: 3,
    estimatedTime: 8,
    relatedSkills: ['mine_lapis'],
  },
  {
    id: 'enchanting_setup',
    name: 'Full Enchanting Setup',
    description: 'Enchanting table surrounded by 15 bookshelves for max level enchants',
    prerequisites: ['enchanting_table', 'bookshelf', 'lapis_lazuli'],
    toolsRequired: ['enchanting_table'],
    materialsRequired: [{ item: 'bookshelf', count: 15 }, { item: 'lapis_lazuli', count: 3 }],
    category: 'enchanting',
    difficulty: 8,
    estimatedTime: 30,
    relatedSkills: [],
  },
  {
    id: 'anvil',
    name: 'Craft Anvil',
    description: 'Craft iron blocks and ingots into an anvil for combining enchantments',
    prerequisites: ['iron_ingot', 'crafting_table'],
    toolsRequired: [],
    materialsRequired: [{ item: 'iron_block', count: 3 }, { item: 'iron_ingot', count: 4 }],
    category: 'enchanting',
    difficulty: 5,
    estimatedTime: 3,
    relatedSkills: [],
  },
  {
    id: 'iron_block',
    name: 'Craft Iron Block',
    description: 'Craft 9 iron ingots into an iron block',
    prerequisites: ['iron_ingot', 'crafting_table'],
    toolsRequired: [],
    materialsRequired: [{ item: 'iron_ingot', count: 9 }],
    category: 'crafting',
    difficulty: 4,
    estimatedTime: 1,
    relatedSkills: [],
  },
  {
    id: 'grindstone',
    name: 'Craft Grindstone',
    description: 'Craft sticks, planks, and stone into a grindstone for removing enchantments',
    prerequisites: ['sticks', 'planks', 'cobblestone', 'crafting_table'],
    toolsRequired: [],
    materialsRequired: [{ item: 'stick', count: 2 }, { item: 'oak_planks', count: 2 }, { item: 'stone_slab', count: 1 }],
    category: 'enchanting',
    difficulty: 3,
    estimatedTime: 2,
    relatedSkills: [],
  },

  // === BREWING ===
  {
    id: 'blaze_rod',
    name: 'Get Blaze Rod',
    description: 'Kill blazes in the Nether to get blaze rods',
    prerequisites: ['nether_portal', 'combat_ready_iron'],
    toolsRequired: ['iron_sword'],
    materialsRequired: [],
    category: 'nether',
    difficulty: 7,
    estimatedTime: 20,
    relatedSkills: [],
  },
  {
    id: 'blaze_powder',
    name: 'Craft Blaze Powder',
    description: 'Craft blaze rod into blaze powder',
    prerequisites: ['blaze_rod'],
    toolsRequired: [],
    materialsRequired: [{ item: 'blaze_rod', count: 1 }],
    category: 'crafting',
    difficulty: 5,
    estimatedTime: 0.5,
    relatedSkills: [],
  },
  {
    id: 'brewing_stand',
    name: 'Craft Brewing Stand',
    description: 'Craft blaze rod and cobblestone into a brewing stand',
    prerequisites: ['blaze_rod', 'cobblestone', 'crafting_table'],
    toolsRequired: [],
    materialsRequired: [{ item: 'blaze_rod', count: 1 }, { item: 'cobblestone', count: 3 }],
    category: 'brewing',
    difficulty: 6,
    estimatedTime: 1,
    relatedSkills: [],
  },
  {
    id: 'nether_wart',
    name: 'Gather Nether Wart',
    description: 'Find and harvest nether wart in Nether fortresses',
    prerequisites: ['nether_portal'],
    toolsRequired: [],
    materialsRequired: [],
    category: 'nether',
    difficulty: 6,
    estimatedTime: 15,
    relatedSkills: [],
  },
  {
    id: 'glass_bottle',
    name: 'Craft Glass Bottle',
    description: 'Craft glass into bottles for potions',
    prerequisites: ['glass', 'crafting_table'],
    toolsRequired: [],
    materialsRequired: [{ item: 'glass', count: 3 }],
    category: 'crafting',
    difficulty: 2,
    estimatedTime: 1,
    relatedSkills: [],
  },
  {
    id: 'glass',
    name: 'Smelt Glass',
    description: 'Smelt sand into glass',
    prerequisites: ['sand', 'furnace', 'coal'],
    toolsRequired: ['furnace'],
    materialsRequired: [{ item: 'sand', count: 1 }, { item: 'coal', count: 1 }],
    category: 'smelting',
    difficulty: 2,
    estimatedTime: 2,
    relatedSkills: [],
  },
  {
    id: 'sand',
    name: 'Gather Sand',
    description: 'Dig sand from beaches or deserts',
    prerequisites: [],
    toolsRequired: [],
    materialsRequired: [],
    category: 'gathering',
    difficulty: 1,
    estimatedTime: 2,
    relatedSkills: [],
  },
  {
    id: 'awkward_potion',
    name: 'Brew Awkward Potion',
    description: 'Base potion for all other potions',
    prerequisites: ['brewing_stand', 'nether_wart', 'glass_bottle', 'blaze_powder'],
    toolsRequired: ['brewing_stand'],
    materialsRequired: [{ item: 'nether_wart', count: 1 }, { item: 'glass_bottle', count: 1 }, { item: 'blaze_powder', count: 1 }],
    category: 'brewing',
    difficulty: 6,
    estimatedTime: 3,
    relatedSkills: [],
  },
  {
    id: 'healing_potion',
    name: 'Brew Healing Potion',
    description: 'Brew glistering melon with awkward potion',
    prerequisites: ['awkward_potion', 'glistering_melon'],
    toolsRequired: ['brewing_stand'],
    materialsRequired: [{ item: 'glistering_melon_slice', count: 1 }],
    category: 'brewing',
    difficulty: 7,
    estimatedTime: 3,
    relatedSkills: [],
  },
  {
    id: 'glistering_melon',
    name: 'Craft Glistering Melon',
    description: 'Craft gold nuggets and melon slice',
    prerequisites: ['gold_ingot', 'melon_slice'],
    toolsRequired: [],
    materialsRequired: [{ item: 'gold_nugget', count: 8 }, { item: 'melon_slice', count: 1 }],
    category: 'crafting',
    difficulty: 4,
    estimatedTime: 1,
    relatedSkills: [],
  },
  {
    id: 'gold_nugget',
    name: 'Craft Gold Nugget',
    description: 'Craft gold ingot into gold nuggets',
    prerequisites: ['gold_ingot'],
    toolsRequired: [],
    materialsRequired: [{ item: 'gold_ingot', count: 1 }],
    category: 'crafting',
    difficulty: 4,
    estimatedTime: 0.5,
    relatedSkills: [],
  },
  {
    id: 'melon_slice',
    name: 'Grow Melon',
    description: 'Plant and harvest melons',
    prerequisites: ['melon_seeds'],
    toolsRequired: ['wooden_hoe'],
    materialsRequired: [{ item: 'melon_seeds', count: 1 }],
    category: 'farming',
    difficulty: 3,
    estimatedTime: 15,
    relatedSkills: [],
  },
  {
    id: 'melon_seeds',
    name: 'Find Melon Seeds',
    description: 'Find melon seeds in dungeon chests or mineshafts',
    prerequisites: [],
    toolsRequired: [],
    materialsRequired: [],
    category: 'exploration',
    difficulty: 4,
    estimatedTime: 20,
    relatedSkills: [],
  },
  {
    id: 'strength_potion',
    name: 'Brew Strength Potion',
    description: 'Brew blaze powder with awkward potion',
    prerequisites: ['awkward_potion', 'blaze_powder'],
    toolsRequired: ['brewing_stand'],
    materialsRequired: [{ item: 'blaze_powder', count: 1 }],
    category: 'brewing',
    difficulty: 7,
    estimatedTime: 3,
    relatedSkills: [],
  },
  {
    id: 'speed_potion',
    name: 'Brew Speed Potion',
    description: 'Brew sugar with awkward potion',
    prerequisites: ['awkward_potion', 'sugar'],
    toolsRequired: ['brewing_stand'],
    materialsRequired: [{ item: 'sugar', count: 1 }],
    category: 'brewing',
    difficulty: 6,
    estimatedTime: 3,
    relatedSkills: [],
  },
  {
    id: 'sugar',
    name: 'Craft Sugar',
    description: 'Craft sugar cane into sugar',
    prerequisites: ['sugar_cane'],
    toolsRequired: [],
    materialsRequired: [{ item: 'sugar_cane', count: 1 }],
    category: 'crafting',
    difficulty: 1,
    estimatedTime: 0.5,
    relatedSkills: [],
  },
  {
    id: 'fire_resistance_potion',
    name: 'Brew Fire Resistance Potion',
    description: 'Brew magma cream with awkward potion',
    prerequisites: ['awkward_potion', 'magma_cream'],
    toolsRequired: ['brewing_stand'],
    materialsRequired: [{ item: 'magma_cream', count: 1 }],
    category: 'brewing',
    difficulty: 8,
    estimatedTime: 3,
    relatedSkills: [],
  },
  {
    id: 'magma_cream',
    name: 'Get Magma Cream',
    description: 'Craft from blaze powder and slimeball, or kill magma cubes',
    prerequisites: ['blaze_powder'],
    toolsRequired: [],
    materialsRequired: [{ item: 'blaze_powder', count: 1 }, { item: 'slimeball', count: 1 }],
    category: 'crafting',
    difficulty: 6,
    estimatedTime: 5,
    relatedSkills: [],
  },
  {
    id: 'slimeball',
    name: 'Get Slimeball',
    description: 'Kill slimes in slime chunks or swamps',
    prerequisites: [],
    toolsRequired: [],
    materialsRequired: [],
    category: 'combat',
    difficulty: 4,
    estimatedTime: 15,
    relatedSkills: ['hunt'],
  },

  // === COMBAT PROGRESSION ===
  {
    id: 'bow',
    name: 'Craft Bow',
    description: 'Craft sticks and string into a bow',
    prerequisites: ['sticks', 'string'],
    toolsRequired: [],
    materialsRequired: [{ item: 'stick', count: 3 }, { item: 'string', count: 3 }],
    category: 'combat',
    difficulty: 2,
    estimatedTime: 1,
    relatedSkills: [],
  },
  {
    id: 'string',
    name: 'Get String',
    description: 'Kill spiders for string',
    prerequisites: [],
    toolsRequired: [],
    materialsRequired: [],
    category: 'combat',
    difficulty: 2,
    estimatedTime: 5,
    relatedSkills: ['hunt'],
  },
  {
    id: 'arrow',
    name: 'Craft Arrows',
    description: 'Craft flint, sticks, and feathers into arrows',
    prerequisites: ['flint', 'sticks', 'feather'],
    toolsRequired: [],
    materialsRequired: [{ item: 'flint', count: 1 }, { item: 'stick', count: 1 }, { item: 'feather', count: 1 }],
    category: 'combat',
    difficulty: 2,
    estimatedTime: 1,
    relatedSkills: [],
  },
  {
    id: 'feather',
    name: 'Get Feathers',
    description: 'Kill chickens for feathers',
    prerequisites: [],
    toolsRequired: [],
    materialsRequired: [],
    category: 'combat',
    difficulty: 1,
    estimatedTime: 3,
    relatedSkills: ['hunt'],
  },
  {
    id: 'crossbow',
    name: 'Craft Crossbow',
    description: 'Craft sticks, string, iron, and tripwire hook into a crossbow',
    prerequisites: ['sticks', 'string', 'iron_ingot', 'tripwire_hook'],
    toolsRequired: [],
    materialsRequired: [
      { item: 'stick', count: 3 },
      { item: 'string', count: 2 },
      { item: 'iron_ingot', count: 1 },
      { item: 'tripwire_hook', count: 1 },
    ],
    category: 'combat',
    difficulty: 4,
    estimatedTime: 2,
    relatedSkills: [],
  },
  {
    id: 'tripwire_hook',
    name: 'Craft Tripwire Hook',
    description: 'Craft iron, stick, and plank into tripwire hook',
    prerequisites: ['iron_ingot', 'sticks', 'planks'],
    toolsRequired: [],
    materialsRequired: [{ item: 'iron_ingot', count: 1 }, { item: 'stick', count: 1 }, { item: 'oak_planks', count: 1 }],
    category: 'crafting',
    difficulty: 3,
    estimatedTime: 1,
    relatedSkills: [],
  },
  {
    id: 'ranged_combat_ready',
    name: 'Ranged Combat Readiness',
    description: 'Have a bow and arrows for ranged combat',
    prerequisites: ['bow', 'arrow'],
    toolsRequired: ['bow'],
    materialsRequired: [{ item: 'arrow', count: 16 }],
    category: 'combat',
    difficulty: 3,
    estimatedTime: 0,
    relatedSkills: [],
  },
  {
    id: 'diamond_armor_full',
    name: 'Full Diamond Armor',
    description: 'Complete set of diamond armor',
    prerequisites: ['diamond_helmet', 'diamond_chestplate', 'diamond_leggings', 'diamond_boots'],
    toolsRequired: [],
    materialsRequired: [],
    category: 'combat',
    difficulty: 8,
    estimatedTime: 0,
    relatedSkills: [],
  },
  {
    id: 'diamond_helmet',
    name: 'Craft Diamond Helmet',
    description: 'Craft 5 diamonds into a helmet',
    prerequisites: ['diamond_ore', 'crafting_table'],
    toolsRequired: [],
    materialsRequired: [{ item: 'diamond', count: 5 }],
    category: 'crafting',
    difficulty: 6,
    estimatedTime: 1,
    relatedSkills: [],
  },
  {
    id: 'diamond_chestplate',
    name: 'Craft Diamond Chestplate',
    description: 'Craft 8 diamonds into a chestplate',
    prerequisites: ['diamond_ore', 'crafting_table'],
    toolsRequired: [],
    materialsRequired: [{ item: 'diamond', count: 8 }],
    category: 'crafting',
    difficulty: 7,
    estimatedTime: 1,
    relatedSkills: [],
  },
  {
    id: 'diamond_leggings',
    name: 'Craft Diamond Leggings',
    description: 'Craft 7 diamonds into leggings',
    prerequisites: ['diamond_ore', 'crafting_table'],
    toolsRequired: [],
    materialsRequired: [{ item: 'diamond', count: 7 }],
    category: 'crafting',
    difficulty: 7,
    estimatedTime: 1,
    relatedSkills: [],
  },
  {
    id: 'diamond_boots',
    name: 'Craft Diamond Boots',
    description: 'Craft 4 diamonds into boots',
    prerequisites: ['diamond_ore', 'crafting_table'],
    toolsRequired: [],
    materialsRequired: [{ item: 'diamond', count: 4 }],
    category: 'crafting',
    difficulty: 6,
    estimatedTime: 1,
    relatedSkills: [],
  },
  {
    id: 'combat_ready_diamond',
    name: 'Diamond Combat Readiness',
    description: 'Full diamond armor, diamond sword, and bow',
    prerequisites: ['diamond_armor_full', 'diamond_sword', 'ranged_combat_ready'],
    toolsRequired: ['diamond_sword', 'bow'],
    materialsRequired: [],
    category: 'combat',
    difficulty: 9,
    estimatedTime: 0,
    relatedSkills: [],
  },

  // === EXPLORATION ===
  {
    id: 'compass',
    name: 'Craft Compass',
    description: 'Craft iron and redstone into a compass',
    prerequisites: ['iron_ingot', 'redstone'],
    toolsRequired: [],
    materialsRequired: [{ item: 'iron_ingot', count: 4 }, { item: 'redstone', count: 1 }],
    category: 'exploration',
    difficulty: 4,
    estimatedTime: 1,
    relatedSkills: [],
  },
  {
    id: 'redstone',
    name: 'Mine Redstone',
    description: 'Mine redstone ore with iron pickaxe',
    prerequisites: ['iron_pickaxe'],
    toolsRequired: ['iron_pickaxe'],
    materialsRequired: [],
    category: 'mining',
    difficulty: 4,
    estimatedTime: 8,
    relatedSkills: ['mine_redstone'],
  },
  {
    id: 'map',
    name: 'Craft Map',
    description: 'Craft paper and compass into a map',
    prerequisites: ['paper', 'compass'],
    toolsRequired: [],
    materialsRequired: [{ item: 'paper', count: 8 }, { item: 'compass', count: 1 }],
    category: 'exploration',
    difficulty: 4,
    estimatedTime: 1,
    relatedSkills: [],
  },
  {
    id: 'clock',
    name: 'Craft Clock',
    description: 'Craft gold and redstone into a clock',
    prerequisites: ['gold_ingot', 'redstone'],
    toolsRequired: [],
    materialsRequired: [{ item: 'gold_ingot', count: 4 }, { item: 'redstone', count: 1 }],
    category: 'exploration',
    difficulty: 5,
    estimatedTime: 1,
    relatedSkills: [],
  },
  {
    id: 'spyglass',
    name: 'Craft Spyglass',
    description: 'Craft copper and amethyst into a spyglass',
    prerequisites: ['copper_ingot', 'amethyst_shard'],
    toolsRequired: [],
    materialsRequired: [{ item: 'copper_ingot', count: 2 }, { item: 'amethyst_shard', count: 1 }],
    category: 'exploration',
    difficulty: 5,
    estimatedTime: 1,
    relatedSkills: [],
  },
  {
    id: 'copper_ingot',
    name: 'Smelt Copper',
    description: 'Smelt copper ore in a furnace',
    prerequisites: ['copper_ore', 'furnace', 'coal'],
    toolsRequired: ['furnace'],
    materialsRequired: [{ item: 'raw_copper', count: 1 }, { item: 'coal', count: 1 }],
    category: 'smelting',
    difficulty: 2,
    estimatedTime: 2,
    relatedSkills: [],
  },
  {
    id: 'copper_ore',
    name: 'Mine Copper Ore',
    description: 'Mine copper ore with stone pickaxe',
    prerequisites: ['stone_pickaxe'],
    toolsRequired: ['stone_pickaxe'],
    materialsRequired: [],
    category: 'mining',
    difficulty: 2,
    estimatedTime: 3,
    relatedSkills: [],
  },
  {
    id: 'amethyst_shard',
    name: 'Gather Amethyst',
    description: 'Find amethyst geodes underground and mine amethyst clusters',
    prerequisites: ['iron_pickaxe'],
    toolsRequired: ['iron_pickaxe'],
    materialsRequired: [],
    category: 'mining',
    difficulty: 5,
    estimatedTime: 15,
    relatedSkills: [],
  },
];

// Build index for O(1) lookups
const techTreeIndex = new Map<string, TechTreeNode>();
for (const node of TECH_TREE) {
  techTreeIndex.set(node.id, node);
}

/**
 * Goal Decomposition Service
 */
export class GoalDecompositionService {
  private techTree: Map<string, TechTreeNode>;

  constructor() {
    this.techTree = new Map(techTreeIndex);
  }

  /**
   * Get a tech tree node by ID
   */
  getNode(id: string): TechTreeNode | null {
    return this.techTree.get(id) ?? null;
  }

  /**
   * Get all nodes in a category
   */
  getNodesByCategory(category: TechCategory): TechTreeNode[] {
    return Array.from(this.techTree.values()).filter(n => n.category === category);
  }

  /**
   * Get all available categories
   */
  getCategories(): TechCategory[] {
    const categories = new Set<TechCategory>();
    for (const node of this.techTree.values()) {
      categories.add(node.category);
    }
    return Array.from(categories);
  }

  /**
   * Find all prerequisites for a goal (recursive)
   */
  getAllPrerequisites(goalId: string, visited = new Set<string>()): string[] {
    if (visited.has(goalId)) return [];
    visited.add(goalId);

    const node = this.techTree.get(goalId);
    if (!node) return [];

    const allPrereqs: string[] = [];
    for (const prereq of node.prerequisites) {
      // Add this prereq
      if (!allPrereqs.includes(prereq)) {
        allPrereqs.push(prereq);
      }
      // Recursively get its prerequisites
      const subPrereqs = this.getAllPrerequisites(prereq, visited);
      for (const sub of subPrereqs) {
        if (!allPrereqs.includes(sub)) {
          allPrereqs.push(sub);
        }
      }
    }

    return allPrereqs;
  }

  /**
   * Topologically sort goals to get execution order
   */
  private topologicalSort(goalIds: string[]): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);

      const node = this.techTree.get(id);
      if (!node) return;

      // Visit prerequisites first
      for (const prereq of node.prerequisites) {
        if (goalIds.includes(prereq)) {
          visit(prereq);
        }
      }

      result.push(id);
    };

    for (const id of goalIds) {
      visit(id);
    }

    return result;
  }

  /**
   * Decompose a high-level goal into ordered steps
   */
  decomposeGoal(goalId: string, currentInventory: string[] = []): DecomposedGoal {
    const node = this.techTree.get(goalId);
    if (!node) {
      log.warn('Unknown goal', { goalId });
      return {
        originalGoal: goalId,
        steps: [],
        totalDifficulty: 0,
        estimatedTotalTime: 0,
        missingPrerequisites: [goalId],
        suggestedSkills: [],
      };
    }

    // Get all prerequisites
    const allPrereqs = this.getAllPrerequisites(goalId);

    // Filter out what we already have
    const inventorySet = new Set(currentInventory.map(i => i.toLowerCase().replace(/ /g, '_')));
    const neededGoals = [goalId, ...allPrereqs].filter(g => !inventorySet.has(g));

    // Topologically sort
    const orderedGoals = this.topologicalSort(neededGoals);

    // Build steps
    const steps: GoalStep[] = [];
    const skillLibrary = getSkillLibrary();
    const suggestedSkills: Skill[] = [];

    for (const gid of orderedGoals) {
      const gnode = this.techTree.get(gid);
      if (!gnode) continue;

      // Find related skill
      let relatedSkill: Skill | undefined;
      for (const skillName of gnode.relatedSkills) {
        const skill = skillLibrary.getSkill(skillName);
        if (skill) {
          relatedSkill = skill;
          if (!suggestedSkills.find(s => s.name === skill.name)) {
            suggestedSkills.push(skill);
          }
          break;
        }
      }

      steps.push({
        id: gnode.id,
        description: gnode.description,
        action: gnode.name,
        target: gnode.materialsRequired.length > 0 ? gnode.materialsRequired[0].item : undefined,
        count: gnode.materialsRequired.length > 0 ? gnode.materialsRequired[0].count : undefined,
        toolRequired: gnode.toolsRequired.length > 0 ? gnode.toolsRequired[0] : undefined,
        category: gnode.category,
        difficulty: gnode.difficulty,
        estimatedTime: gnode.estimatedTime,
        relatedSkill,
        dependencies: gnode.prerequisites,
        completed: false,
      });
    }

    // Calculate totals
    const totalDifficulty = steps.reduce((sum, s) => sum + s.difficulty, 0);
    const estimatedTotalTime = steps.reduce((sum, s) => sum + s.estimatedTime, 0);

    log.info('Goal decomposed', {
      goalId,
      stepCount: steps.length,
      totalDifficulty,
      estimatedTotalTime,
    });

    return {
      originalGoal: goalId,
      steps,
      totalDifficulty,
      estimatedTotalTime,
      missingPrerequisites: [],
      suggestedSkills,
    };
  }

  /**
   * Find matching goal IDs from a text query
   */
  findGoals(query: string): TechTreeNode[] {
    const q = query.toLowerCase();
    const results: TechTreeNode[] = [];

    for (const node of this.techTree.values()) {
      if (
        node.id.includes(q) ||
        node.name.toLowerCase().includes(q) ||
        node.description.toLowerCase().includes(q)
      ) {
        results.push(node);
      }
    }

    // Sort by difficulty (easier first)
    return results.sort((a, b) => a.difficulty - b.difficulty);
  }

  /**
   * Suggest next goals based on current inventory
   */
  suggestNextGoals(currentInventory: string[], limit = 5): TechTreeNode[] {
    const inventorySet = new Set(currentInventory.map(i => i.toLowerCase().replace(/ /g, '_')));
    const suggestions: TechTreeNode[] = [];

    for (const node of this.techTree.values()) {
      // Skip if we already have it
      if (inventorySet.has(node.id)) continue;

      // Check if all prerequisites are met
      const allPrereqsMet = node.prerequisites.every(p => inventorySet.has(p));
      if (allPrereqsMet) {
        suggestions.push(node);
      }
    }

    // Sort by difficulty, then estimated time
    return suggestions
      .sort((a, b) => a.difficulty - b.difficulty || a.estimatedTime - b.estimatedTime)
      .slice(0, limit);
  }

  /**
   * Get the full tech tree
   */
  getTechTree(): TechTreeNode[] {
    return Array.from(this.techTree.values());
  }

  /**
   * Add a custom node to the tech tree
   */
  addNode(node: TechTreeNode): void {
    this.techTree.set(node.id, node);
    log.info('Custom node added to tech tree', { id: node.id });
  }
}

// Singleton instance
let instance: GoalDecompositionService | null = null;

/**
 * Get the goal decomposition service singleton
 */
export function getGoalDecomposition(): GoalDecompositionService {
  if (!instance) {
    instance = new GoalDecompositionService();
  }
  return instance;
}

/**
 * Get tech tree nodes (convenience export)
 */
export function getTechTree(): TechTreeNode[] {
  return getGoalDecomposition().getTechTree();
}

/**
 * Decompose a goal (convenience export)
 */
export function decomposeGoal(goalId: string, currentInventory: string[] = []): DecomposedGoal {
  return getGoalDecomposition().decomposeGoal(goalId, currentInventory);
}

/**
 * Suggest next goals (convenience export)
 */
export function suggestNextGoals(currentInventory: string[], limit = 5): TechTreeNode[] {
  return getGoalDecomposition().suggestNextGoals(currentInventory, limit);
}
