/**
 * Auto-Armor Service Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Bot } from 'mineflayer';
import type { Item } from 'prismarine-item';

// Import the service functions
import {
  initializeAutoArmor,
  setAutoArmorEnabled,
  configureAutoArmor,
  getAutoArmorStatus,
  equipBestArmorNow,
  cleanupAutoArmor,
  DEFAULT_AUTO_ARMOR_CONFIG,
} from '../../../src/services/auto-armor.service.js';

// Create a mock bot for testing
function createMockBot(): Bot {
  const inventory = {
    items: vi.fn().mockReturnValue([]),
    slots: {} as Record<number, Item | null>,
    equipmentSlot: vi.fn((slot: string) => {
      switch (slot) {
        case 'head': return 5;
        case 'torso': return 6;
        case 'legs': return 7;
        case 'feet': return 8;
        default: return 0;
      }
    }),
  };

  const bot = {
    username: 'TestBot',
    entity: { position: { x: 0, y: 64, z: 0 } },
    inventory,
    equip: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
  } as unknown as Bot;

  return bot;
}

// Create a mock armor item
function createMockArmor(name: string, nbt?: any): Item {
  return {
    name,
    count: 1,
    type: 0,
    slot: 0,
    nbt,
  } as Item;
}

describe('AutoArmorService', () => {
  let bot: Bot;

  beforeEach(() => {
    bot = createMockBot();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanupAutoArmor(bot);
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('DEFAULT_AUTO_ARMOR_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_AUTO_ARMOR_CONFIG.enabled).toBe(true);
      expect(DEFAULT_AUTO_ARMOR_CONFIG.checkIntervalMs).toBe(2000);
      expect(DEFAULT_AUTO_ARMOR_CONFIG.preferEnchanted).toBe(true);
    });
  });

  describe('initializeAutoArmor', () => {
    it('should initialize with default config', () => {
      initializeAutoArmor(bot);
      const status = getAutoArmorStatus(bot);

      expect(status.enabled).toBe(true);
      expect(status.config.checkIntervalMs).toBe(2000);
      expect(status.config.preferEnchanted).toBe(true);
    });

    it('should accept custom config', () => {
      initializeAutoArmor(bot, {
        enabled: true,
        checkIntervalMs: 5000,
        preferEnchanted: false,
      });

      const status = getAutoArmorStatus(bot);
      expect(status.config.checkIntervalMs).toBe(5000);
      expect(status.config.preferEnchanted).toBe(false);
    });

    it('should not start interval when disabled', () => {
      initializeAutoArmor(bot, { enabled: false });
      const status = getAutoArmorStatus(bot);

      expect(status.enabled).toBe(false);
    });

    it('should register event listeners', () => {
      initializeAutoArmor(bot);

      expect(bot.on).toHaveBeenCalledWith('playerCollect', expect.any(Function));
      expect(bot.once).toHaveBeenCalledWith('spawn', expect.any(Function));
    });
  });

  describe('setAutoArmorEnabled', () => {
    it('should enable auto-armor', () => {
      initializeAutoArmor(bot, { enabled: false });
      setAutoArmorEnabled(bot, true);

      const status = getAutoArmorStatus(bot);
      expect(status.enabled).toBe(true);
    });

    it('should disable auto-armor', () => {
      initializeAutoArmor(bot);
      setAutoArmorEnabled(bot, false);

      const status = getAutoArmorStatus(bot);
      expect(status.enabled).toBe(false);
    });
  });

  describe('configureAutoArmor', () => {
    it('should update configuration', () => {
      initializeAutoArmor(bot);
      configureAutoArmor(bot, { checkIntervalMs: 1000 });

      const status = getAutoArmorStatus(bot);
      expect(status.config.checkIntervalMs).toBe(1000);
    });

    it('should merge with existing config', () => {
      initializeAutoArmor(bot, { preferEnchanted: false });
      configureAutoArmor(bot, { checkIntervalMs: 3000 });

      const status = getAutoArmorStatus(bot);
      expect(status.config.preferEnchanted).toBe(false);
      expect(status.config.checkIntervalMs).toBe(3000);
    });
  });

  describe('getAutoArmorStatus', () => {
    it('should return current armor state', () => {
      initializeAutoArmor(bot);
      const status = getAutoArmorStatus(bot);

      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('config');
      expect(status).toHaveProperty('currentArmor');
      expect(status.currentArmor).toHaveLength(4);
    });

    it('should show empty slots when no armor equipped', () => {
      initializeAutoArmor(bot);
      const status = getAutoArmorStatus(bot);

      for (const armor of status.currentArmor) {
        expect(armor.item).toBeNull();
        expect(armor.tier).toBe(0);
      }
    });

    it('should show equipped armor', () => {
      const helmet = createMockArmor('diamond_helmet');
      (bot.inventory as any).slots[5] = helmet;

      initializeAutoArmor(bot);
      const status = getAutoArmorStatus(bot);

      const headArmor = status.currentArmor.find(a => a.slot === 'head');
      expect(headArmor?.item).toBe('diamond_helmet');
      expect(headArmor?.tier).toBe(5); // Diamond tier
    });
  });

  describe('equipBestArmorNow', () => {
    it('should equip armor from inventory', async () => {
      const chestplate = createMockArmor('iron_chestplate');
      (bot.inventory.items as any).mockReturnValue([chestplate]);

      initializeAutoArmor(bot);
      await equipBestArmorNow(bot);

      expect(bot.equip).toHaveBeenCalledWith(chestplate, 'torso');
    });

    it('should not equip if already wearing better armor', async () => {
      const ironChest = createMockArmor('iron_chestplate');
      const diamondChest = createMockArmor('diamond_chestplate');

      // Already wearing diamond
      (bot.inventory as any).slots[6] = diamondChest;
      (bot.inventory.items as any).mockReturnValue([ironChest]);

      initializeAutoArmor(bot);
      await equipBestArmorNow(bot);

      expect(bot.equip).not.toHaveBeenCalled();
    });

    it('should upgrade to better armor', async () => {
      const ironChest = createMockArmor('iron_chestplate');
      const diamondChest = createMockArmor('diamond_chestplate');

      // Wearing iron, have diamond in inventory
      (bot.inventory as any).slots[6] = ironChest;
      (bot.inventory.items as any).mockReturnValue([diamondChest]);

      initializeAutoArmor(bot);
      await equipBestArmorNow(bot);

      expect(bot.equip).toHaveBeenCalledWith(diamondChest, 'torso');
    });
  });

  describe('cleanupAutoArmor', () => {
    it('should clear interval on cleanup', () => {
      initializeAutoArmor(bot);
      cleanupAutoArmor(bot);

      // Verify state is cleaned (no error on second cleanup)
      cleanupAutoArmor(bot);
    });

    it('should handle cleanup when not initialized', () => {
      // Should not throw
      cleanupAutoArmor(bot);
    });
  });

  describe('armor tier ranking', () => {
    it('should correctly identify armor tiers', () => {
      const items = [
        { name: 'leather_helmet', expectedTier: 1 },
        { name: 'golden_helmet', expectedTier: 2 },
        { name: 'chainmail_helmet', expectedTier: 3 },
        { name: 'iron_helmet', expectedTier: 4 },
        { name: 'diamond_helmet', expectedTier: 5 },
        { name: 'netherite_helmet', expectedTier: 6 },
      ];

      for (const { name, expectedTier } of items) {
        const item = createMockArmor(name);
        (bot.inventory as any).slots[5] = item;

        initializeAutoArmor(bot);
        const status = getAutoArmorStatus(bot);
        const headArmor = status.currentArmor.find(a => a.slot === 'head');

        expect(headArmor?.tier).toBe(expectedTier);
        cleanupAutoArmor(bot);
      }
    });
  });

  describe('armor slot detection', () => {
    it('should detect helmet slot', async () => {
      const helmet = createMockArmor('iron_helmet');
      (bot.inventory.items as any).mockReturnValue([helmet]);

      initializeAutoArmor(bot);
      await equipBestArmorNow(bot);

      expect(bot.equip).toHaveBeenCalledWith(helmet, 'head');
    });

    it('should detect chestplate slot', async () => {
      const chest = createMockArmor('iron_chestplate');
      (bot.inventory.items as any).mockReturnValue([chest]);

      initializeAutoArmor(bot);
      await equipBestArmorNow(bot);

      expect(bot.equip).toHaveBeenCalledWith(chest, 'torso');
    });

    it('should detect leggings slot', async () => {
      const legs = createMockArmor('iron_leggings');
      (bot.inventory.items as any).mockReturnValue([legs]);

      initializeAutoArmor(bot);
      await equipBestArmorNow(bot);

      expect(bot.equip).toHaveBeenCalledWith(legs, 'legs');
    });

    it('should detect boots slot', async () => {
      const boots = createMockArmor('iron_boots');
      (bot.inventory.items as any).mockReturnValue([boots]);

      initializeAutoArmor(bot);
      await equipBestArmorNow(bot);

      expect(bot.equip).toHaveBeenCalledWith(boots, 'feet');
    });

    it('should detect leather tunic as torso', async () => {
      const tunic = createMockArmor('leather_tunic');
      (bot.inventory.items as any).mockReturnValue([tunic]);

      initializeAutoArmor(bot);
      await equipBestArmorNow(bot);

      expect(bot.equip).toHaveBeenCalledWith(tunic, 'torso');
    });

    it('should detect leather cap as head', async () => {
      const cap = createMockArmor('leather_cap');
      (bot.inventory.items as any).mockReturnValue([cap]);

      initializeAutoArmor(bot);
      await equipBestArmorNow(bot);

      expect(bot.equip).toHaveBeenCalledWith(cap, 'head');
    });
  });

  describe('enchantment preference', () => {
    it('should prefer enchanted armor when configured', async () => {
      const plainDiamond = createMockArmor('diamond_chestplate');
      const enchantedIron = createMockArmor('iron_chestplate', {
        value: {
          Enchantments: {
            value: {
              value: [
                { id: { value: 'protection' }, lvl: { value: 4 } },
                { id: { value: 'unbreaking' }, lvl: { value: 3 } },
              ],
            },
          },
        },
      });

      (bot.inventory.items as any).mockReturnValue([plainDiamond, enchantedIron]);

      initializeAutoArmor(bot, { preferEnchanted: true });
      await equipBestArmorNow(bot);

      // Should pick enchanted iron over plain diamond due to high enchantment value
      expect(bot.equip).toHaveBeenCalledWith(enchantedIron, 'torso');
    });

    it('should prefer higher tier when not preferring enchanted', async () => {
      const plainDiamond = createMockArmor('diamond_chestplate');
      const enchantedIron = createMockArmor('iron_chestplate', {
        value: {
          Enchantments: {
            value: {
              value: [
                { id: { value: 'protection' }, lvl: { value: 1 } },
              ],
            },
          },
        },
      });

      (bot.inventory.items as any).mockReturnValue([plainDiamond, enchantedIron]);

      initializeAutoArmor(bot, { preferEnchanted: false });
      await equipBestArmorNow(bot);

      // Should pick diamond over iron regardless of enchantments
      expect(bot.equip).toHaveBeenCalledWith(plainDiamond, 'torso');
    });
  });

  describe('periodic check', () => {
    it('should check armor periodically', async () => {
      const helmet = createMockArmor('iron_helmet');
      (bot.inventory.items as any).mockReturnValue([helmet]);

      initializeAutoArmor(bot, { checkIntervalMs: 1000 });

      // Fast forward time
      await vi.advanceTimersByTimeAsync(1000);

      expect(bot.equip).toHaveBeenCalled();
    });

    it('should respect custom interval', async () => {
      const helmet = createMockArmor('iron_helmet');
      (bot.inventory.items as any).mockReturnValue([helmet]);

      initializeAutoArmor(bot, { checkIntervalMs: 5000 });

      // Advance less than interval
      await vi.advanceTimersByTimeAsync(3000);
      expect(bot.equip).not.toHaveBeenCalled();

      // Advance past interval
      await vi.advanceTimersByTimeAsync(2000);
      expect(bot.equip).toHaveBeenCalled();
    });
  });
});
