/**
 * Skill Library Service
 *
 * Stores and retrieves reusable tool sequences ("skills") that the AI has learned.
 * Inspired by Voyager's skill library but adapted for MCP protocol.
 *
 * Skills are stored as tool call sequences - the LLM still makes all decisions,
 * skills just provide guidance/templates for common tasks.
 */

import { readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { logger } from '../utils/logger.js';
import { atomicWriteFile, AsyncMutex } from '../utils/atomic-file.js';
import { searchAndRank } from '../utils/text-search.js';

const log = logger.child('skill-library');

/** A single tool call within a skill */
export interface SkillStep {
  /** Tool name to call */
  tool: string;
  /** Parameters for the tool */
  parameters: Record<string, unknown>;
  /** Optional: reference another skill instead of a tool */
  skill?: string;
  /** How many times to execute (for skill references) */
  times?: number;
  /** Expected outcome description */
  expectedOutcome?: string;
  /** Notes for the LLM */
  notes?: string;
}

/** A complete skill definition */
export interface Skill {
  /** Unique skill identifier (snake_case) */
  name: string;
  /** Human-readable description */
  description: string;
  /** Searchable tags */
  tags: string[];
  /** The tool call sequence */
  steps: SkillStep[];
  /** Items/conditions required before execution */
  prerequisites: string[];
  /** What this skill produces/achieves */
  outcomes: string[];
  /** Success rate (0-1), updated after each use */
  successRate: number;
  /** Total times this skill was used */
  timesUsed: number;
  /** Total successful executions */
  timesSucceeded: number;
  /** Last used timestamp */
  lastUsed: number | null;
  /** Creation timestamp */
  createdAt: number;
  /** Last modified timestamp */
  updatedAt: number;
  /** Skill complexity: primitive (1-2 steps) or composite (3+ steps) */
  complexity: 'primitive' | 'composite';
  /** Optional: category for organization */
  category?: string;
}

/** Search options for finding skills */
export interface SkillSearchOptions {
  /** Text query to search in name, description, tags */
  query?: string;
  /** Filter by specific tags */
  tags?: string[];
  /** Filter by category */
  category?: string;
  /** Minimum success rate */
  minSuccessRate?: number;
  /** Maximum results to return */
  limit?: number;
  /** Sort by: relevance, successRate, timesUsed, recent */
  sortBy?: 'relevance' | 'successRate' | 'timesUsed' | 'recent';
}

/** Statistics about the skill library */
export interface SkillStats {
  totalSkills: number;
  primitiveCount: number;
  compositeCount: number;
  avgSuccessRate: number;
  mostUsed: string[];
  categories: string[];
}

/** Skill library storage format */
interface SkillLibraryData {
  version: number;
  skills: Record<string, Skill>;
  metadata: {
    totalSkills: number;
    lastUpdated: number;
  };
}

/**
 * Skill Library Service
 */
export class SkillLibraryService {
  private skills: Map<string, Skill> = new Map();
  private filePath: string;
  private saveMutex = new AsyncMutex();
  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(filePath: string = './data/skills.json') {
    this.filePath = filePath;
    this.loadFromDisk();
  }

  /**
   * Load skills from disk
   */
  private loadFromDisk(): void {
    try {
      if (existsSync(this.filePath)) {
        const data = JSON.parse(readFileSync(this.filePath, 'utf-8')) as SkillLibraryData;
        this.skills = new Map(Object.entries(data.skills || {}));
        log.info('Skill library loaded', { count: this.skills.size });
      } else {
        this.skills = new Map();
        this.initializePrimitiveSkills();
        log.info('Skill library initialized with primitives', { count: this.skills.size });
      }
    } catch (error) {
      log.warn('Failed to load skill library, starting fresh', { error });
      this.skills = new Map();
      this.initializePrimitiveSkills();
    }
  }

  /**
   * Initialize primitive skills - common single-action patterns
   */
  private initializePrimitiveSkills(): void {
    const primitives: Omit<Skill, 'successRate' | 'timesUsed' | 'timesSucceeded' | 'lastUsed' | 'createdAt' | 'updatedAt'>[] = [
      {
        name: 'mine_wood',
        description: 'Mine wood logs from nearby trees',
        tags: ['mining', 'wood', 'logs', 'basic', 'resource'],
        steps: [{ tool: 'mineResource', parameters: { resource: 'wood', count: 10 } }],
        prerequisites: [],
        outcomes: ['oak_log', 'birch_log', 'spruce_log', 'wood'],
        complexity: 'primitive',
        category: 'gathering',
      },
      {
        name: 'mine_stone',
        description: 'Mine cobblestone from nearby stone',
        tags: ['mining', 'stone', 'cobblestone', 'basic', 'resource'],
        steps: [{ tool: 'mineResource', parameters: { resource: 'stone', count: 10 } }],
        prerequisites: ['wooden_pickaxe'],
        outcomes: ['cobblestone'],
        complexity: 'primitive',
        category: 'gathering',
      },
      {
        name: 'mine_iron',
        description: 'Mine iron ore from underground',
        tags: ['mining', 'iron', 'ore', 'metal', 'resource'],
        steps: [{ tool: 'mineResource', parameters: { resource: 'iron_ore', count: 8 } }],
        prerequisites: ['stone_pickaxe'],
        outcomes: ['iron_ore', 'raw_iron'],
        complexity: 'primitive',
        category: 'gathering',
      },
      {
        name: 'mine_coal',
        description: 'Mine coal ore for fuel',
        tags: ['mining', 'coal', 'fuel', 'resource'],
        steps: [{ tool: 'mineResource', parameters: { resource: 'coal_ore', count: 8 } }],
        prerequisites: ['wooden_pickaxe'],
        outcomes: ['coal'],
        complexity: 'primitive',
        category: 'gathering',
      },
      {
        name: 'mine_diamond',
        description: 'Mine diamond ore (y-level -64 to 16)',
        tags: ['mining', 'diamond', 'rare', 'resource', 'deep'],
        steps: [{ tool: 'mineResource', parameters: { resource: 'diamond_ore', count: 4 } }],
        prerequisites: ['iron_pickaxe'],
        outcomes: ['diamond'],
        complexity: 'primitive',
        category: 'gathering',
      },
      {
        name: 'craft_planks',
        description: 'Craft wood logs into planks',
        tags: ['crafting', 'planks', 'wood', 'basic'],
        steps: [{ tool: 'craftItems', parameters: { item: 'oak_planks', count: 4 } }],
        prerequisites: ['oak_log'],
        outcomes: ['oak_planks'],
        complexity: 'primitive',
        category: 'crafting',
      },
      {
        name: 'craft_sticks',
        description: 'Craft planks into sticks',
        tags: ['crafting', 'sticks', 'basic'],
        steps: [{ tool: 'craftItems', parameters: { item: 'stick', count: 4 } }],
        prerequisites: ['oak_planks'],
        outcomes: ['stick'],
        complexity: 'primitive',
        category: 'crafting',
      },
      {
        name: 'craft_crafting_table',
        description: 'Craft a crafting table from planks',
        tags: ['crafting', 'table', 'workbench', 'basic', 'essential'],
        steps: [{ tool: 'craftItems', parameters: { item: 'crafting_table', count: 1 } }],
        prerequisites: ['oak_planks'],
        outcomes: ['crafting_table'],
        complexity: 'primitive',
        category: 'crafting',
      },
      {
        name: 'craft_furnace',
        description: 'Craft a furnace from cobblestone',
        tags: ['crafting', 'furnace', 'smelting', 'essential'],
        steps: [{ tool: 'craftItems', parameters: { item: 'furnace', count: 1 } }],
        prerequisites: ['cobblestone'],
        outcomes: ['furnace'],
        complexity: 'primitive',
        category: 'crafting',
      },
      {
        name: 'smelt_iron',
        description: 'Smelt iron ore into iron ingots',
        tags: ['smelting', 'iron', 'ingot', 'furnace'],
        steps: [{ tool: 'smeltItem', parameters: { item: 'iron_ore', count: 8 } }],
        prerequisites: ['furnace', 'iron_ore', 'coal'],
        outcomes: ['iron_ingot'],
        complexity: 'primitive',
        category: 'smelting',
      },
      {
        name: 'cook_food',
        description: 'Cook raw meat into cooked food',
        tags: ['cooking', 'food', 'furnace', 'survival'],
        steps: [{ tool: 'cookItem', parameters: { item: 'beef', count: 4 } }],
        prerequisites: ['furnace', 'raw_beef', 'coal'],
        outcomes: ['cooked_beef'],
        complexity: 'primitive',
        category: 'survival',
      },
      {
        name: 'hunt_animals',
        description: 'Hunt passive animals for food',
        tags: ['hunting', 'food', 'combat', 'survival'],
        steps: [{ tool: 'hunt', parameters: { target: 'passive', count: 3 } }],
        prerequisites: ['weapon'],
        outcomes: ['raw_beef', 'raw_porkchop', 'raw_chicken'],
        complexity: 'primitive',
        category: 'survival',
      },
      {
        name: 'find_shelter',
        description: 'Find or dig a shelter for the night',
        tags: ['survival', 'shelter', 'night', 'safety'],
        steps: [
          { tool: 'digBlock', parameters: { direction: 'down', count: 3 } },
          { tool: 'placeBlockAt', parameters: { blockType: 'dirt', position: 'above' }, notes: 'Cover entrance' },
        ],
        prerequisites: [],
        outcomes: ['shelter', 'safety'],
        complexity: 'primitive',
        category: 'survival',
      },
      {
        name: 'sleep_night',
        description: 'Sleep in a bed to skip the night',
        tags: ['sleep', 'bed', 'night', 'survival'],
        steps: [{ tool: 'sleepInBed', parameters: {} }],
        prerequisites: ['bed_nearby'],
        outcomes: ['day_time', 'spawn_point_set'],
        complexity: 'primitive',
        category: 'survival',
      },
      // Tool crafting
      {
        name: 'craft_wooden_pickaxe',
        description: 'Craft a wooden pickaxe',
        tags: ['crafting', 'tools', 'pickaxe', 'wood', 'basic'],
        steps: [{ tool: 'craftItems', parameters: { item: 'wooden_pickaxe', count: 1 } }],
        prerequisites: ['oak_planks', 'stick', 'crafting_table'],
        outcomes: ['wooden_pickaxe'],
        complexity: 'primitive',
        category: 'crafting',
      },
      {
        name: 'craft_stone_pickaxe',
        description: 'Craft a stone pickaxe',
        tags: ['crafting', 'tools', 'pickaxe', 'stone'],
        steps: [{ tool: 'craftItems', parameters: { item: 'stone_pickaxe', count: 1 } }],
        prerequisites: ['cobblestone', 'stick', 'crafting_table'],
        outcomes: ['stone_pickaxe'],
        complexity: 'primitive',
        category: 'crafting',
      },
      {
        name: 'craft_iron_pickaxe',
        description: 'Craft an iron pickaxe',
        tags: ['crafting', 'tools', 'pickaxe', 'iron'],
        steps: [{ tool: 'craftItems', parameters: { item: 'iron_pickaxe', count: 1 } }],
        prerequisites: ['iron_ingot', 'stick', 'crafting_table'],
        outcomes: ['iron_pickaxe'],
        complexity: 'primitive',
        category: 'crafting',
      },
      {
        name: 'craft_diamond_pickaxe',
        description: 'Craft a diamond pickaxe',
        tags: ['crafting', 'tools', 'pickaxe', 'diamond', 'rare'],
        steps: [{ tool: 'craftItems', parameters: { item: 'diamond_pickaxe', count: 1 } }],
        prerequisites: ['diamond', 'stick', 'crafting_table'],
        outcomes: ['diamond_pickaxe'],
        complexity: 'primitive',
        category: 'crafting',
      },
      // Weapon crafting
      {
        name: 'craft_wooden_sword',
        description: 'Craft a wooden sword',
        tags: ['crafting', 'weapons', 'sword', 'wood', 'basic'],
        steps: [{ tool: 'craftItems', parameters: { item: 'wooden_sword', count: 1 } }],
        prerequisites: ['oak_planks', 'stick', 'crafting_table'],
        outcomes: ['wooden_sword'],
        complexity: 'primitive',
        category: 'crafting',
      },
      {
        name: 'craft_stone_sword',
        description: 'Craft a stone sword',
        tags: ['crafting', 'weapons', 'sword', 'stone'],
        steps: [{ tool: 'craftItems', parameters: { item: 'stone_sword', count: 1 } }],
        prerequisites: ['cobblestone', 'stick', 'crafting_table'],
        outcomes: ['stone_sword'],
        complexity: 'primitive',
        category: 'crafting',
      },
      {
        name: 'craft_iron_sword',
        description: 'Craft an iron sword',
        tags: ['crafting', 'weapons', 'sword', 'iron'],
        steps: [{ tool: 'craftItems', parameters: { item: 'iron_sword', count: 1 } }],
        prerequisites: ['iron_ingot', 'stick', 'crafting_table'],
        outcomes: ['iron_sword'],
        complexity: 'primitive',
        category: 'crafting',
      },
      // Utility crafting
      {
        name: 'craft_torch',
        description: 'Craft torches for light',
        tags: ['crafting', 'torch', 'light', 'utility'],
        steps: [{ tool: 'craftItems', parameters: { item: 'torch', count: 4 } }],
        prerequisites: ['coal', 'stick'],
        outcomes: ['torch'],
        complexity: 'primitive',
        category: 'crafting',
      },
      {
        name: 'craft_chest',
        description: 'Craft a chest for storage',
        tags: ['crafting', 'chest', 'storage', 'utility'],
        steps: [{ tool: 'craftItems', parameters: { item: 'chest', count: 1 } }],
        prerequisites: ['oak_planks', 'crafting_table'],
        outcomes: ['chest'],
        complexity: 'primitive',
        category: 'crafting',
      },
      {
        name: 'craft_bucket',
        description: 'Craft a bucket for liquids',
        tags: ['crafting', 'bucket', 'utility', 'iron'],
        steps: [{ tool: 'craftItems', parameters: { item: 'bucket', count: 1 } }],
        prerequisites: ['iron_ingot', 'crafting_table'],
        outcomes: ['bucket'],
        complexity: 'primitive',
        category: 'crafting',
      },
      {
        name: 'craft_bed',
        description: 'Craft a bed for sleeping',
        tags: ['crafting', 'bed', 'sleep', 'utility'],
        steps: [{ tool: 'craftItems', parameters: { item: 'bed', count: 1 } }],
        prerequisites: ['oak_planks', 'wool', 'crafting_table'],
        outcomes: ['bed'],
        complexity: 'primitive',
        category: 'crafting',
      },
      // Farming
      {
        name: 'gather_seeds',
        description: 'Gather wheat seeds from grass',
        tags: ['farming', 'seeds', 'wheat', 'gathering'],
        steps: [{ tool: 'gatherSeeds', parameters: { count: 10 } }],
        prerequisites: [],
        outcomes: ['wheat_seeds'],
        complexity: 'primitive',
        category: 'farming',
      },
      {
        name: 'plant_seeds',
        description: 'Plant seeds on farmland',
        tags: ['farming', 'planting', 'wheat', 'agriculture'],
        steps: [{ tool: 'plantSeeds', parameters: { seed: 'wheat_seeds', count: 9 } }],
        prerequisites: ['wheat_seeds', 'farmland'],
        outcomes: ['planted_wheat'],
        complexity: 'primitive',
        category: 'farming',
      },
      {
        name: 'harvest_crops',
        description: 'Harvest mature crops',
        tags: ['farming', 'harvest', 'wheat', 'food'],
        steps: [{ tool: 'harvestCrops', parameters: { radius: 10 } }],
        prerequisites: ['mature_crops'],
        outcomes: ['wheat', 'wheat_seeds'],
        complexity: 'primitive',
        category: 'farming',
      },
      // Combat
      {
        name: 'attack_hostile',
        description: 'Attack nearby hostile mobs',
        tags: ['combat', 'attack', 'hostile', 'defense'],
        steps: [{ tool: 'attackSomeone', parameters: { targetType: 'hostile' } }],
        prerequisites: ['weapon'],
        outcomes: ['mob_defeated', 'loot'],
        complexity: 'primitive',
        category: 'combat',
      },
      {
        name: 'defend_self',
        description: 'Run away from danger',
        tags: ['combat', 'defense', 'escape', 'survival'],
        steps: [{ tool: 'runAway', parameters: { distance: 20 } }],
        prerequisites: [],
        outcomes: ['safety'],
        complexity: 'primitive',
        category: 'combat',
      },
      // Navigation
      {
        name: 'go_to_surface',
        description: 'Navigate up to surface level',
        tags: ['navigation', 'surface', 'escape', 'movement'],
        steps: [{ tool: 'goToSurface', parameters: {} }],
        prerequisites: [],
        outcomes: ['at_surface', 'sunlight'],
        complexity: 'primitive',
        category: 'navigation',
      },
      {
        name: 'swim_to_land',
        description: 'Swim to nearest land',
        tags: ['navigation', 'swimming', 'water', 'survival'],
        steps: [{ tool: 'swimToLand', parameters: {} }],
        prerequisites: [],
        outcomes: ['on_land'],
        complexity: 'primitive',
        category: 'navigation',
      },
      // More mining
      {
        name: 'mine_gold',
        description: 'Mine gold ore from underground',
        tags: ['mining', 'gold', 'ore', 'metal', 'resource'],
        steps: [{ tool: 'mineResource', parameters: { resource: 'gold_ore', count: 6 } }],
        prerequisites: ['iron_pickaxe'],
        outcomes: ['gold_ore', 'raw_gold'],
        complexity: 'primitive',
        category: 'gathering',
      },
      {
        name: 'mine_redstone',
        description: 'Mine redstone ore for circuits',
        tags: ['mining', 'redstone', 'ore', 'resource', 'technical'],
        steps: [{ tool: 'mineResource', parameters: { resource: 'redstone_ore', count: 8 } }],
        prerequisites: ['iron_pickaxe'],
        outcomes: ['redstone'],
        complexity: 'primitive',
        category: 'gathering',
      },
      {
        name: 'mine_lapis',
        description: 'Mine lapis lazuli for enchanting',
        tags: ['mining', 'lapis', 'ore', 'resource', 'enchanting'],
        steps: [{ tool: 'mineResource', parameters: { resource: 'lapis_ore', count: 6 } }],
        prerequisites: ['stone_pickaxe'],
        outcomes: ['lapis_lazuli'],
        complexity: 'primitive',
        category: 'gathering',
      },
      // Fishing
      {
        name: 'go_fishing',
        description: 'Fish for food and treasure',
        tags: ['fishing', 'food', 'treasure', 'survival'],
        steps: [{ tool: 'fish', parameters: { duration: 60 } }],
        prerequisites: ['fishing_rod', 'water_nearby'],
        outcomes: ['fish', 'treasure', 'junk'],
        complexity: 'primitive',
        category: 'gathering',
      },
    ];

    const now = Date.now();
    for (const prim of primitives) {
      const skill: Skill = {
        ...prim,
        successRate: 0.8, // Default success rate for primitives
        timesUsed: 0,
        timesSucceeded: 0,
        lastUsed: null,
        createdAt: now,
        updatedAt: now,
      };
      this.skills.set(skill.name, skill);
    }

    this.scheduleSave();
  }

  /**
   * Save a new skill or update existing
   */
  saveSkill(skill: Omit<Skill, 'successRate' | 'timesUsed' | 'timesSucceeded' | 'lastUsed' | 'createdAt' | 'updatedAt' | 'complexity'>): Skill {
    const now = Date.now();
    const existing = this.skills.get(skill.name);

    const complexity: 'primitive' | 'composite' = skill.steps.length <= 2 ? 'primitive' : 'composite';

    const fullSkill: Skill = {
      ...skill,
      complexity,
      successRate: existing?.successRate ?? 0.5,
      timesUsed: existing?.timesUsed ?? 0,
      timesSucceeded: existing?.timesSucceeded ?? 0,
      lastUsed: existing?.lastUsed ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.skills.set(skill.name, fullSkill);
    this.scheduleSave();

    log.info('Skill saved', { name: skill.name, complexity, steps: skill.steps.length });
    return fullSkill;
  }

  /**
   * Get a skill by name
   */
  getSkill(name: string): Skill | null {
    return this.skills.get(name) ?? null;
  }

  /**
   * Search for skills with fuzzy matching and synonym expansion
   */
  searchSkills(options: SkillSearchOptions = {}): Skill[] {
    let results = Array.from(this.skills.values());

    // Filter by category
    if (options.category) {
      results = results.filter(s => s.category === options.category);
    }

    // Filter by minimum success rate
    if (options.minSuccessRate !== undefined) {
      const minRate = options.minSuccessRate;
      results = results.filter(s => s.successRate >= minRate);
    }

    // Filter by tags
    if (options.tags && options.tags.length > 0) {
      const searchTags = new Set(options.tags.map(t => t.toLowerCase()));
      results = results.filter(s => s.tags.some(t => searchTags.has(t.toLowerCase())));
    }

    // Filter by query using fuzzy search with synonym expansion
    if (options.query) {
      const rankedResults = searchAndRank(options.query, results, {
        minScore: 0.1,
      });

      // Extract skills from ranked results, preserving order
      results = rankedResults.map(r => {
        // Remove the relevance property to return clean Skill objects
        const { relevance: _relevance, ...skill } = r;
        return skill as Skill;
      });

      log.debug('Fuzzy search completed', {
        query: options.query,
        resultsCount: results.length,
        topResult: results[0]?.name,
      });
    }

    // Sort (only apply if not already sorted by query relevance)
    if (!options.query || options.sortBy !== 'relevance') {
      switch (options.sortBy) {
        case 'successRate':
          results.sort((a, b) => b.successRate - a.successRate);
          break;
        case 'timesUsed':
          results.sort((a, b) => b.timesUsed - a.timesUsed);
          break;
        case 'recent':
          results.sort((a, b) => (b.lastUsed ?? 0) - (a.lastUsed ?? 0));
          break;
        // 'relevance' preserves query ranking
      }
    }

    // Limit results
    if (options.limit && options.limit > 0) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Record skill usage outcome
   */
  recordOutcome(skillName: string, success: boolean): boolean {
    const skill = this.skills.get(skillName);
    if (!skill) {
      log.warn('Skill not found for outcome recording', { skillName });
      return false;
    }

    skill.timesUsed++;
    if (success) {
      skill.timesSucceeded++;
    }
    skill.successRate = skill.timesSucceeded / skill.timesUsed;
    skill.lastUsed = Date.now();
    skill.updatedAt = Date.now();

    this.skills.set(skillName, skill);
    this.scheduleSave();

    log.debug('Skill outcome recorded', {
      skillName,
      success,
      newSuccessRate: skill.successRate.toFixed(2),
    });

    return true;
  }

  /**
   * Delete a skill
   */
  deleteSkill(name: string): boolean {
    if (this.skills.delete(name)) {
      this.scheduleSave();
      log.info('Skill deleted', { name });
      return true;
    }
    return false;
  }

  /**
   * Get all skills
   */
  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get skill categories
   */
  getCategories(): string[] {
    const categories = new Set<string>();
    for (const skill of this.skills.values()) {
      if (skill.category) {
        categories.add(skill.category);
      }
    }
    return Array.from(categories).sort();
  }

  /**
   * Get statistics
   */
  getStats(): SkillStats {
    const skills = Array.from(this.skills.values());
    const primitives = skills.filter(s => s.complexity === 'primitive');
    const composites = skills.filter(s => s.complexity === 'composite');

    const avgSuccessRate = skills.length > 0
      ? skills.reduce((sum, s) => sum + s.successRate, 0) / skills.length
      : 0;

    const mostUsed = skills
      .filter(s => s.timesUsed > 0)
      .sort((a, b) => b.timesUsed - a.timesUsed)
      .slice(0, 5)
      .map(s => s.name);

    return {
      totalSkills: skills.length,
      primitiveCount: primitives.length,
      compositeCount: composites.length,
      avgSuccessRate,
      mostUsed,
      categories: this.getCategories(),
    };
  }

  /**
   * Schedule a save operation (debounced)
   */
  private scheduleSave(): void {
    this.dirty = true;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => this.saveToDisk(), 1000);
  }

  /**
   * Save to disk
   */
  private async saveToDisk(): Promise<void> {
    if (!this.dirty) return;

    const release = await this.saveMutex.acquire();
    try {
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const data: SkillLibraryData = {
        version: 1,
        skills: Object.fromEntries(this.skills),
        metadata: {
          totalSkills: this.skills.size,
          lastUpdated: Date.now(),
        },
      };

      await atomicWriteFile(this.filePath, JSON.stringify(data));
      this.dirty = false;
      log.debug('Skill library saved', { count: this.skills.size });
    } catch (error) {
      log.error('Failed to save skill library', { error });
    } finally {
      release();
    }
  }

  /**
   * Shutdown - ensure final save
   */
  async shutdown(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    await this.saveToDisk();
    log.info('Skill library shutdown');
  }
}

// Singleton instance
let instance: SkillLibraryService | null = null;

export function getSkillLibrary(filePath?: string): SkillLibraryService {
  if (!instance) {
    instance = new SkillLibraryService(filePath);
  }
  return instance;
}

export function shutdownSkillLibrary(): Promise<void> {
  if (instance) {
    return instance.shutdown();
  }
  return Promise.resolve();
}
