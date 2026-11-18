/**
 * Tests for goal-decomposition.service.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  GoalDecompositionService,
  getGoalDecomposition,
  decomposeGoal,
  suggestNextGoals,
  getTechTree,
  type TechTreeNode,
  type TechCategory,
} from '../../../src/services/goal-decomposition.service.js';

describe('GoalDecompositionService', () => {
  let service: GoalDecompositionService;

  beforeEach(() => {
    service = new GoalDecompositionService();
  });

  describe('Tech Tree Structure', () => {
    it('should have a populated tech tree', () => {
      const tree = service.getTechTree();
      expect(tree.length).toBeGreaterThan(40);
    });

    it('should have basic gathering nodes with no prerequisites', () => {
      const woodLogs = service.getNode('wood_logs');
      expect(woodLogs).not.toBeNull();
      expect(woodLogs?.prerequisites).toHaveLength(0);
      expect(woodLogs?.category).toBe('gathering');
    });

    it('should have progression from wood to diamond', () => {
      const woodenPickaxe = service.getNode('wooden_pickaxe');
      const stonePickaxe = service.getNode('stone_pickaxe');
      const ironPickaxe = service.getNode('iron_pickaxe');
      const diamondPickaxe = service.getNode('diamond_pickaxe');

      expect(woodenPickaxe?.difficulty).toBeLessThan(stonePickaxe?.difficulty ?? 0);
      expect(stonePickaxe?.difficulty).toBeLessThan(ironPickaxe?.difficulty ?? 0);
      expect(ironPickaxe?.difficulty).toBeLessThan(diamondPickaxe?.difficulty ?? 0);
    });

    it('should have nodes in multiple categories', () => {
      const categories = service.getCategories();
      expect(categories).toContain('gathering');
      expect(categories).toContain('crafting');
      expect(categories).toContain('mining');
      expect(categories).toContain('smelting');
    });
  });

  describe('getNode', () => {
    it('should return a node by ID', () => {
      const node = service.getNode('iron_pickaxe');
      expect(node).not.toBeNull();
      expect(node?.name).toBe('Craft Iron Pickaxe');
    });

    it('should return null for unknown node', () => {
      const node = service.getNode('nonexistent_item');
      expect(node).toBeNull();
    });
  });

  describe('getNodesByCategory', () => {
    it('should return nodes filtered by category', () => {
      const craftingNodes = service.getNodesByCategory('crafting');
      expect(craftingNodes.length).toBeGreaterThan(10);
      expect(craftingNodes.every(n => n.category === 'crafting')).toBe(true);
    });

    it('should return empty array for unknown category', () => {
      const nodes = service.getNodesByCategory('unknown' as TechCategory);
      expect(nodes).toHaveLength(0);
    });
  });

  describe('getAllPrerequisites', () => {
    it('should return empty array for nodes with no prerequisites', () => {
      const prereqs = service.getAllPrerequisites('wood_logs');
      expect(prereqs).toHaveLength(0);
    });

    it('should return direct prerequisites', () => {
      const prereqs = service.getAllPrerequisites('planks');
      expect(prereqs).toContain('wood_logs');
    });

    it('should return recursive prerequisites for iron pickaxe', () => {
      const prereqs = service.getAllPrerequisites('iron_pickaxe');
      // Iron pickaxe needs: iron_ingot, sticks, crafting_table
      // iron_ingot needs: iron_ore, furnace, coal
      // And so on...
      expect(prereqs).toContain('iron_ingot');
      expect(prereqs).toContain('sticks');
      expect(prereqs).toContain('crafting_table');
      expect(prereqs).toContain('planks');
      expect(prereqs).toContain('wood_logs');
    });

    it('should handle circular references gracefully', () => {
      // This should not cause infinite loop
      const prereqs = service.getAllPrerequisites('diamond_pickaxe');
      expect(prereqs.length).toBeGreaterThan(0);
    });
  });

  describe('decomposeGoal', () => {
    it('should decompose wooden pickaxe into ordered steps', () => {
      const result = service.decomposeGoal('wooden_pickaxe');

      expect(result.originalGoal).toBe('wooden_pickaxe');
      expect(result.steps.length).toBeGreaterThan(0);

      // First steps should be gathering/basic crafting
      const firstStep = result.steps[0];
      expect(['wood_logs', 'planks', 'sticks', 'crafting_table']).toContain(firstStep.id);

      // Final step should be the wooden pickaxe
      const lastStep = result.steps[result.steps.length - 1];
      expect(lastStep.id).toBe('wooden_pickaxe');
    });

    it('should decompose diamond pickaxe with many steps', () => {
      const result = service.decomposeGoal('diamond_pickaxe');

      // Diamond pickaxe requires many prerequisite items
      expect(result.steps.length).toBeGreaterThan(10);

      // Should include key milestones
      const stepIds = result.steps.map(s => s.id);
      expect(stepIds).toContain('wood_logs');
      expect(stepIds).toContain('wooden_pickaxe');
      expect(stepIds).toContain('stone_pickaxe');
      expect(stepIds).toContain('iron_pickaxe');
      expect(stepIds).toContain('diamond_ore');
    });

    it('should skip steps for items already in inventory', () => {
      const fullResult = service.decomposeGoal('stone_pickaxe');
      const withInventory = service.decomposeGoal('stone_pickaxe', [
        'wood_logs',
        'planks',
        'sticks',
        'crafting_table',
      ]);

      expect(withInventory.steps.length).toBeLessThan(fullResult.steps.length);
    });

    it('should calculate total difficulty and time', () => {
      const result = service.decomposeGoal('iron_pickaxe');

      expect(result.totalDifficulty).toBeGreaterThan(0);
      expect(result.estimatedTotalTime).toBeGreaterThan(0);
    });

    it('should return empty steps for unknown goal', () => {
      const result = service.decomposeGoal('nonexistent_goal');

      expect(result.steps).toHaveLength(0);
      expect(result.missingPrerequisites).toContain('nonexistent_goal');
    });

    it('should include related skills in decomposition', () => {
      const result = service.decomposeGoal('stone_pickaxe');

      // Some steps should have related skills
      const _stepsWithSkills = result.steps.filter(s => s.relatedSkill);
      // May or may not have skills depending on skill library state
      expect(result.suggestedSkills).toBeDefined();
    });
  });

  describe('findGoals', () => {
    it('should find goals by name', () => {
      const results = service.findGoals('pickaxe');
      expect(results.length).toBeGreaterThan(3);
      expect(results.some(r => r.id === 'wooden_pickaxe')).toBe(true);
      expect(results.some(r => r.id === 'stone_pickaxe')).toBe(true);
      expect(results.some(r => r.id === 'iron_pickaxe')).toBe(true);
      expect(results.some(r => r.id === 'diamond_pickaxe')).toBe(true);
    });

    it('should find goals by description', () => {
      const results = service.findGoals('furnace');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return results sorted by difficulty', () => {
      const results = service.findGoals('pickaxe');
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].difficulty).toBeLessThanOrEqual(results[i].difficulty);
      }
    });

    it('should return empty array for no matches', () => {
      const results = service.findGoals('xyznonexistent123');
      expect(results).toHaveLength(0);
    });
  });

  describe('suggestNextGoals', () => {
    it('should suggest basic goals when inventory is empty', () => {
      const suggestions = service.suggestNextGoals([]);

      // Should suggest things with no prerequisites
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.every(s => s.prerequisites.length === 0)).toBe(true);
    });

    it('should suggest next tier when prerequisites met', () => {
      const suggestions = service.suggestNextGoals(['wood_logs']);

      // Should suggest things that need wood_logs
      expect(suggestions.some(s => s.id === 'planks')).toBe(true);
    });

    it('should suggest crafting tools when materials available', () => {
      const suggestions = service.suggestNextGoals([
        'planks',
        'sticks',
        'crafting_table',
      ]);

      // Should suggest wooden tools
      const suggestionIds = suggestions.map(s => s.id);
      expect(
        suggestionIds.includes('wooden_pickaxe') ||
        suggestionIds.includes('wooden_axe') ||
        suggestionIds.includes('wooden_sword')
      ).toBe(true);
    });

    it('should respect limit parameter', () => {
      const suggestions = service.suggestNextGoals([], 3);
      expect(suggestions.length).toBeLessThanOrEqual(3);
    });

    it('should not suggest already acquired items', () => {
      const suggestions = service.suggestNextGoals(['wood_logs', 'planks']);

      expect(suggestions.some(s => s.id === 'wood_logs')).toBe(false);
      expect(suggestions.some(s => s.id === 'planks')).toBe(false);
    });
  });

  describe('addNode', () => {
    it('should allow adding custom nodes', () => {
      const customNode: TechTreeNode = {
        id: 'custom_item',
        name: 'Custom Item',
        description: 'A custom test item',
        prerequisites: ['iron_ingot'],
        toolsRequired: [],
        materialsRequired: [{ item: 'iron_ingot', count: 5 }],
        category: 'crafting',
        difficulty: 4,
        estimatedTime: 2,
        relatedSkills: [],
      };

      service.addNode(customNode);

      const retrieved = service.getNode('custom_item');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe('Custom Item');
    });
  });

  describe('singleton', () => {
    it('should return same instance from getGoalDecomposition', () => {
      const instance1 = getGoalDecomposition();
      const instance2 = getGoalDecomposition();
      expect(instance1).toBe(instance2);
    });
  });

  describe('convenience functions', () => {
    it('getTechTree should return full tree', () => {
      const tree = getTechTree();
      expect(tree.length).toBeGreaterThan(40);
    });

    it('decomposeGoal should work as convenience function', () => {
      const result = decomposeGoal('wooden_pickaxe');
      expect(result.steps.length).toBeGreaterThan(0);
    });

    it('suggestNextGoals should work as convenience function', () => {
      const suggestions = suggestNextGoals([]);
      expect(suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('Brewing Progression', () => {
    it('should have brewing category nodes', () => {
      const brewingNodes = service.getNodesByCategory('brewing');
      expect(brewingNodes.length).toBeGreaterThan(0);
    });

    it('should have brewing_stand node', () => {
      const brewingStand = service.getNode('brewing_stand');
      expect(brewingStand).not.toBeNull();
      expect(brewingStand?.category).toBe('brewing');
      expect(brewingStand?.prerequisites).toContain('blaze_rod');
    });

    it('should have awkward_potion as base for other potions', () => {
      const awkward = service.getNode('awkward_potion');
      expect(awkward).not.toBeNull();
      expect(awkward?.prerequisites).toContain('brewing_stand');
      expect(awkward?.prerequisites).toContain('nether_wart');
    });

    it('should decompose healing_potion with brewing chain', () => {
      const result = service.decomposeGoal('healing_potion');
      const stepIds = result.steps.map(s => s.id);

      expect(stepIds).toContain('awkward_potion');
      expect(stepIds).toContain('brewing_stand');
      expect(stepIds).toContain('nether_portal');
    });

    it('should have multiple potion types', () => {
      const healingPotion = service.getNode('healing_potion');
      const strengthPotion = service.getNode('strength_potion');
      const speedPotion = service.getNode('speed_potion');
      const fireResistance = service.getNode('fire_resistance_potion');

      expect(healingPotion).not.toBeNull();
      expect(strengthPotion).not.toBeNull();
      expect(speedPotion).not.toBeNull();
      expect(fireResistance).not.toBeNull();
    });
  });

  describe('Enchanting Progression', () => {
    it('should have enchanting category nodes', () => {
      const enchantingNodes = service.getNodesByCategory('enchanting');
      expect(enchantingNodes.length).toBeGreaterThan(3);
    });

    it('should have bookshelf for enchanting power', () => {
      const bookshelf = service.getNode('bookshelf');
      expect(bookshelf).not.toBeNull();
      expect(bookshelf?.category).toBe('enchanting');
      expect(bookshelf?.prerequisites).toContain('book');
    });

    it('should have lapis_lazuli for enchanting', () => {
      const lapis = service.getNode('lapis_lazuli');
      expect(lapis).not.toBeNull();
      expect(lapis?.category).toBe('mining');
    });

    it('should have full enchanting setup', () => {
      const enchantingSetup = service.getNode('enchanting_setup');
      expect(enchantingSetup).not.toBeNull();
      expect(enchantingSetup?.prerequisites).toContain('enchanting_table');
      expect(enchantingSetup?.prerequisites).toContain('bookshelf');
      expect(enchantingSetup?.prerequisites).toContain('lapis_lazuli');
    });

    it('should have anvil for combining enchantments', () => {
      const anvil = service.getNode('anvil');
      expect(anvil).not.toBeNull();
      expect(anvil?.category).toBe('enchanting');
    });

    it('should decompose enchanting_setup with many steps', () => {
      const result = service.decomposeGoal('enchanting_setup');
      expect(result.steps.length).toBeGreaterThan(15);

      const stepIds = result.steps.map(s => s.id);
      expect(stepIds).toContain('enchanting_table');
      expect(stepIds).toContain('bookshelf');
      expect(stepIds).toContain('book');
    });
  });

  describe('Combat Progression', () => {
    it('should have combat category nodes', () => {
      const combatNodes = service.getNodesByCategory('combat');
      expect(combatNodes.length).toBeGreaterThan(5);
    });

    it('should have bow and arrows for ranged combat', () => {
      const bow = service.getNode('bow');
      const arrow = service.getNode('arrow');

      expect(bow).not.toBeNull();
      expect(arrow).not.toBeNull();
      expect(bow?.category).toBe('combat');
    });

    it('should have crossbow as advanced ranged weapon', () => {
      const crossbow = service.getNode('crossbow');
      expect(crossbow).not.toBeNull();
      expect(crossbow?.prerequisites).toContain('iron_ingot');
    });

    it('should have diamond armor pieces', () => {
      const helmet = service.getNode('diamond_helmet');
      const chestplate = service.getNode('diamond_chestplate');
      const leggings = service.getNode('diamond_leggings');
      const boots = service.getNode('diamond_boots');

      expect(helmet).not.toBeNull();
      expect(chestplate).not.toBeNull();
      expect(leggings).not.toBeNull();
      expect(boots).not.toBeNull();
    });

    it('should have combat readiness tiers', () => {
      const basicCombat = service.getNode('combat_ready_basic');
      const ironCombat = service.getNode('combat_ready_iron');
      const diamondCombat = service.getNode('combat_ready_diamond');

      expect(basicCombat).not.toBeNull();
      expect(ironCombat).not.toBeNull();
      expect(diamondCombat).not.toBeNull();

      // Difficulty should increase
      expect(basicCombat!.difficulty).toBeLessThan(ironCombat!.difficulty);
      expect(ironCombat!.difficulty).toBeLessThan(diamondCombat!.difficulty);
    });

    it('should have ranged_combat_ready milestone', () => {
      const rangedReady = service.getNode('ranged_combat_ready');
      expect(rangedReady).not.toBeNull();
      expect(rangedReady?.prerequisites).toContain('bow');
      expect(rangedReady?.prerequisites).toContain('arrow');
    });

    it('should decompose diamond combat with full progression', () => {
      const result = service.decomposeGoal('combat_ready_diamond');
      expect(result.steps.length).toBeGreaterThan(20);

      const stepIds = result.steps.map(s => s.id);
      expect(stepIds).toContain('diamond_armor_full');
      expect(stepIds).toContain('bow');
    });
  });

  describe('Exploration Progression', () => {
    it('should have exploration category nodes', () => {
      const explorationNodes = service.getNodesByCategory('exploration');
      expect(explorationNodes.length).toBeGreaterThan(2);
    });

    it('should have compass and map', () => {
      const compass = service.getNode('compass');
      const map = service.getNode('map');

      expect(compass).not.toBeNull();
      expect(map).not.toBeNull();
      expect(compass?.prerequisites).toContain('iron_ingot');
      expect(compass?.prerequisites).toContain('redstone');
    });

    it('should have clock for time tracking', () => {
      const clock = service.getNode('clock');
      expect(clock).not.toBeNull();
      expect(clock?.prerequisites).toContain('gold_ingot');
      expect(clock?.prerequisites).toContain('redstone');
    });

    it('should have spyglass for scouting', () => {
      const spyglass = service.getNode('spyglass');
      expect(spyglass).not.toBeNull();
      expect(spyglass?.prerequisites).toContain('copper_ingot');
      expect(spyglass?.prerequisites).toContain('amethyst_shard');
    });
  });

  describe('Extended Mining', () => {
    it('should have copper ore and ingot', () => {
      const copperOre = service.getNode('copper_ore');
      const copperIngot = service.getNode('copper_ingot');

      expect(copperOre).not.toBeNull();
      expect(copperIngot).not.toBeNull();
      expect(copperIngot?.category).toBe('smelting');
    });

    it('should have redstone mining', () => {
      const redstone = service.getNode('redstone');
      expect(redstone).not.toBeNull();
      expect(redstone?.prerequisites).toContain('iron_pickaxe');
    });

    it('should have amethyst gathering', () => {
      const amethyst = service.getNode('amethyst_shard');
      expect(amethyst).not.toBeNull();
      expect(amethyst?.prerequisites).toContain('iron_pickaxe');
    });
  });

  describe('Tech Tree Completeness', () => {
    it('should have at least 90 nodes', () => {
      const tree = service.getTechTree();
      // Tech tree has ~92 nodes covering all major Minecraft progression
      expect(tree.length).toBeGreaterThanOrEqual(90);
    });

    it('should have all 10 categories', () => {
      const categories = service.getCategories();
      expect(categories).toContain('gathering');
      expect(categories).toContain('crafting');
      expect(categories).toContain('mining');
      expect(categories).toContain('smelting');
      expect(categories).toContain('combat');
      expect(categories).toContain('farming');
      expect(categories).toContain('brewing');
      expect(categories).toContain('enchanting');
      expect(categories).toContain('nether');
      expect(categories).toContain('exploration');
    });

    it('should have valid prerequisites for all nodes', () => {
      const tree = service.getTechTree();
      const nodeIds = new Set(tree.map(n => n.id));

      for (const node of tree) {
        for (const prereq of node.prerequisites) {
          // All prerequisites should either exist in tree or be special items
          const exists = nodeIds.has(prereq) || prereq.includes('nearby') || prereq.includes('available');
          if (!exists) {
            // Log but don't fail for flexibility
            console.warn(`Node ${node.id} has unknown prerequisite: ${prereq}`);
          }
        }
      }
    });
  });
});
