/**
 * Tests for the configuration system
 */

import { describe, it, expect } from 'vitest';
import { AppConfigSchema } from '../../../src/config/schema.js';
import { defaultConfig } from '../../../src/config/defaults.js';

describe('Configuration System', () => {
  describe('AppConfigSchema', () => {
    it('should validate a complete config', () => {
      const result = AppConfigSchema.safeParse(defaultConfig);
      expect(result.success).toBe(true);
    });

    it('should apply defaults for empty config', () => {
      const result = AppConfigSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.server.name).toBe('minecraft-mcp-mineflayer');
        expect(result.data.bot.defaults.host).toBe('localhost');
        expect(result.data.bot.defaults.port).toBe(25565);
      }
    });

    it('should merge partial config with defaults', () => {
      const partialConfig = {
        server: { name: 'custom-server' },
        bot: { defaults: { port: 25566 } },
      };

      const result = AppConfigSchema.safeParse(partialConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.server.name).toBe('custom-server');
        expect(result.data.server.version).toBe('2.0.0'); // Default
        expect(result.data.bot.defaults.port).toBe(25566);
        expect(result.data.bot.defaults.host).toBe('localhost'); // Default
      }
    });

    it('should validate navigation config bounds', () => {
      const invalidConfig = {
        navigation: { maxDropDown: 15 }, // Max is 10
      };

      const result = AppConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should validate port bounds', () => {
      const invalidConfig = {
        bot: { defaults: { port: 70000 } }, // Max is 65535
      };

      const result = AppConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should validate logging level enum', () => {
      const validConfig = {
        logging: { level: 'debug' },
      };

      const result = AppConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);

      const invalidConfig = {
        logging: { level: 'invalid' },
      };

      const invalidResult = AppConfigSchema.safeParse(invalidConfig);
      expect(invalidResult.success).toBe(false);
    });
  });

  describe('defaultConfig', () => {
    it('should have all required sections', () => {
      expect(defaultConfig).toHaveProperty('server');
      expect(defaultConfig).toHaveProperty('bot');
      expect(defaultConfig).toHaveProperty('navigation');
      expect(defaultConfig).toHaveProperty('timeouts');
      expect(defaultConfig).toHaveProperty('mining');
      expect(defaultConfig).toHaveProperty('farming');
      expect(defaultConfig).toHaveProperty('logging');
    });

    it('should have sensible timeout defaults', () => {
      expect(defaultConfig.timeouts.navigation).toBeGreaterThan(0);
      expect(defaultConfig.timeouts.mining).toBeGreaterThan(0);
      expect(defaultConfig.timeouts.crafting).toBeGreaterThan(0);
    });

    it('should have hostile mobs list populated', () => {
      expect(defaultConfig.bot.selfDefense.hostileMobs.length).toBeGreaterThan(10);
      expect(defaultConfig.bot.selfDefense.hostileMobs).toContain('zombie');
      expect(defaultConfig.bot.selfDefense.hostileMobs).toContain('creeper');
      expect(defaultConfig.bot.selfDefense.hostileMobs).toContain('skeleton');
    });
  });
});
