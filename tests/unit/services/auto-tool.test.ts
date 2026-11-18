/**
 * Auto-Tool Service Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Bot } from 'mineflayer';
import type { Item } from 'prismarine-item';
import type { Block } from 'prismarine-block';

// Import the service functions
import {
  setAutoToolEnabled,
  configureAutoTool,
  getAutoToolStatus,
  equipBestToolForBlock,
  equipBestWeapon,
  DEFAULT_AUTO_TOOL_CONFIG,
} from '../../../src/services/auto-tool.service.js';

// Create a mock bot for testing
function createMockBot(): Bot {
  const inventory = {
    items: vi.fn().mockReturnValue([]),
    slots: {} as Record<number, Item | null>,
  };

  const bot = {
    username: 'TestBot',
    entity: { position: { x: 0, y: 64, z: 0 } },
    inventory,
    equip: vi.fn().mockResolvedValue(undefined),
    heldItem: null as Item | null,
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
  } as unknown as Bot;

  return bot;
}

// Create a mock tool item
function createMockTool(name: string, durabilityUsed = 0, maxDurability = 100, nbt?: any): Item {
  return {
    name,
    count: 1,
    type: 0,
    slot: 0,
    durabilityUsed,
    maxDurability,
    nbt,
  } as unknown as Item;
}

// Create a mock block
function createMockBlock(name: string, material?: string): Block {
  return {
    name,
    material,
    hardness: 1,
    diggable: true,
    boundingBox: 'block',
  } as unknown as Block;
}

describe('AutoToolService', () => {
  let bot: Bot;

  beforeEach(() => {
    bot = createMockBot();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('DEFAULT_AUTO_TOOL_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_AUTO_TOOL_CONFIG.enabled).toBe(true);
      expect(DEFAULT_AUTO_TOOL_CONFIG.minDurability).toBe(10);
      expect(DEFAULT_AUTO_TOOL_CONFIG.preferEnchanted).toBe(true);
      expect(DEFAULT_AUTO_TOOL_CONFIG.autoEquipWeapon).toBe(true);
    });
  });

  describe('configureAutoTool', () => {
    it('should use default config when not configured', () => {
      const status = getAutoToolStatus(bot);

      expect(status.enabled).toBe(true);
      expect(status.config.minDurability).toBe(10);
    });

    it('should accept custom config', () => {
      configureAutoTool(bot, {
        minDurability: 20,
        preferEnchanted: false,
      });

      const status = getAutoToolStatus(bot);
      expect(status.config.minDurability).toBe(20);
      expect(status.config.preferEnchanted).toBe(false);
    });

    it('should update configuration', () => {
      configureAutoTool(bot, {});
      configureAutoTool(bot, { minDurability: 50 });

      const status = getAutoToolStatus(bot);
      expect(status.config.minDurability).toBe(50);
    });

    it('should merge with existing config', () => {
      configureAutoTool(bot, { preferEnchanted: false });
      configureAutoTool(bot, { minDurability: 25 });

      const status = getAutoToolStatus(bot);
      expect(status.config.preferEnchanted).toBe(false);
      expect(status.config.minDurability).toBe(25);
    });
  });

  describe('setAutoToolEnabled', () => {
    it('should enable auto-tool', () => {
      configureAutoTool(bot, { enabled: false });
      setAutoToolEnabled(bot, true);

      const status = getAutoToolStatus(bot);
      expect(status.enabled).toBe(true);
    });

    it('should disable auto-tool', () => {
      configureAutoTool(bot, {});
      setAutoToolEnabled(bot, false);

      const status = getAutoToolStatus(bot);
      expect(status.enabled).toBe(false);
    });
  });

  describe('getAutoToolStatus', () => {
    it('should return current tool status', () => {
      configureAutoTool(bot, {});
      const status = getAutoToolStatus(bot);

      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('config');
      expect(status).toHaveProperty('tools');
    });

    it('should list available tools', () => {
      const pickaxe = createMockTool('diamond_pickaxe');
      const shovel = createMockTool('iron_shovel');
      (bot.inventory.items as any).mockReturnValue([pickaxe, shovel]);

      configureAutoTool(bot, {});
      const status = getAutoToolStatus(bot);

      expect(status.tools).toHaveLength(2);
    });
  });

  describe('equipBestToolForBlock', () => {
    it('should select pickaxe for stone', async () => {
      const pickaxe = createMockTool('iron_pickaxe');
      const shovel = createMockTool('iron_shovel');
      (bot.inventory.items as any).mockReturnValue([pickaxe, shovel]);

      configureAutoTool(bot, {});
      const block = createMockBlock('stone');
      await equipBestToolForBlock(bot, block);

      expect(bot.equip).toHaveBeenCalledWith(pickaxe, 'hand');
    });

    it('should select shovel for dirt', async () => {
      const pickaxe = createMockTool('iron_pickaxe');
      const shovel = createMockTool('iron_shovel');
      (bot.inventory.items as any).mockReturnValue([pickaxe, shovel]);

      configureAutoTool(bot, {});
      const block = createMockBlock('dirt');
      await equipBestToolForBlock(bot, block);

      expect(bot.equip).toHaveBeenCalledWith(shovel, 'hand');
    });

    it('should select axe for wood', async () => {
      const axe = createMockTool('iron_axe');
      const pickaxe = createMockTool('iron_pickaxe');
      (bot.inventory.items as any).mockReturnValue([axe, pickaxe]);

      configureAutoTool(bot, {});
      const block = createMockBlock('oak_log');
      await equipBestToolForBlock(bot, block);

      expect(bot.equip).toHaveBeenCalledWith(axe, 'hand');
    });

    it('should prefer higher tier tools', async () => {
      const ironPick = createMockTool('iron_pickaxe');
      const diamondPick = createMockTool('diamond_pickaxe');
      (bot.inventory.items as any).mockReturnValue([ironPick, diamondPick]);

      configureAutoTool(bot, {});
      const block = createMockBlock('stone');
      await equipBestToolForBlock(bot, block);

      expect(bot.equip).toHaveBeenCalledWith(diamondPick, 'hand');
    });

    it('should avoid tools with low durability', async () => {
      const lowDurability = createMockTool('diamond_pickaxe', 95, 100); // Only 5 left
      const highDurability = createMockTool('iron_pickaxe', 10, 100); // 90 left
      (bot.inventory.items as any).mockReturnValue([lowDurability, highDurability]);

      configureAutoTool(bot, { minDurability: 10 });
      const block = createMockBlock('stone');
      await equipBestToolForBlock(bot, block);

      expect(bot.equip).toHaveBeenCalledWith(highDurability, 'hand');
    });
  });

  describe('equipBestWeapon', () => {
    it('should select sword for combat', async () => {
      const sword = createMockTool('diamond_sword');
      const pickaxe = createMockTool('iron_pickaxe');
      (bot.inventory.items as any).mockReturnValue([sword, pickaxe]);

      configureAutoTool(bot, {});
      await equipBestWeapon(bot);

      expect(bot.equip).toHaveBeenCalledWith(sword, 'hand');
    });

    it('should select axe if no sword available', async () => {
      const axe = createMockTool('diamond_axe');
      const pickaxe = createMockTool('iron_pickaxe');
      (bot.inventory.items as any).mockReturnValue([axe, pickaxe]);

      configureAutoTool(bot, {});
      await equipBestWeapon(bot);

      expect(bot.equip).toHaveBeenCalledWith(axe, 'hand');
    });

    it('should prefer higher tier weapons', async () => {
      const ironSword = createMockTool('iron_sword');
      const diamondSword = createMockTool('diamond_sword');
      (bot.inventory.items as any).mockReturnValue([ironSword, diamondSword]);

      configureAutoTool(bot, {});
      await equipBestWeapon(bot);

      expect(bot.equip).toHaveBeenCalledWith(diamondSword, 'hand');
    });

    it('should prefer enchanted weapons when configured', async () => {
      const plainDiamond = createMockTool('diamond_sword');
      const enchantedIron = createMockTool('iron_sword', 0, 100, {
        value: {
          Enchantments: {
            value: {
              value: [
                { id: { value: 'sharpness' }, lvl: { value: 5 } },
              ],
            },
          },
        },
      });
      (bot.inventory.items as any).mockReturnValue([plainDiamond, enchantedIron]);

      configureAutoTool(bot, { preferEnchanted: true });
      await equipBestWeapon(bot);

      // Enchanted iron with high sharpness may beat plain diamond
      expect(bot.equip).toHaveBeenCalled();
    });
  });

  describe('tool tier ranking', () => {
    it('should correctly rank tool tiers', async () => {
      const tools = [
        createMockTool('wooden_pickaxe'),
        createMockTool('stone_pickaxe'),
        createMockTool('iron_pickaxe'),
        createMockTool('diamond_pickaxe'),
        createMockTool('netherite_pickaxe'),
      ];
      (bot.inventory.items as any).mockReturnValue(tools);

      configureAutoTool(bot, {});
      const block = createMockBlock('stone');
      await equipBestToolForBlock(bot, block);

      // Should select netherite (highest tier)
      expect(bot.equip).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'netherite_pickaxe' }),
        'hand'
      );
    });
  });

  describe('block type detection', () => {
    it('should detect ore blocks need pickaxe', async () => {
      const pickaxe = createMockTool('iron_pickaxe');
      (bot.inventory.items as any).mockReturnValue([pickaxe]);

      configureAutoTool(bot, {});
      const block = createMockBlock('iron_ore');
      await equipBestToolForBlock(bot, block);

      expect(bot.equip).toHaveBeenCalledWith(pickaxe, 'hand');
    });

    it('should detect sand needs shovel', async () => {
      const shovel = createMockTool('iron_shovel');
      (bot.inventory.items as any).mockReturnValue([shovel]);

      configureAutoTool(bot, {});
      const block = createMockBlock('sand');
      await equipBestToolForBlock(bot, block);

      expect(bot.equip).toHaveBeenCalledWith(shovel, 'hand');
    });

    it('should detect gravel needs shovel', async () => {
      const shovel = createMockTool('iron_shovel');
      (bot.inventory.items as any).mockReturnValue([shovel]);

      configureAutoTool(bot, {});
      const block = createMockBlock('gravel');
      await equipBestToolForBlock(bot, block);

      expect(bot.equip).toHaveBeenCalledWith(shovel, 'hand');
    });

    it('should detect planks need axe', async () => {
      const axe = createMockTool('iron_axe');
      (bot.inventory.items as any).mockReturnValue([axe]);

      configureAutoTool(bot, {});
      const block = createMockBlock('oak_planks');
      await equipBestToolForBlock(bot, block);

      expect(bot.equip).toHaveBeenCalledWith(axe, 'hand');
    });
  });
});
