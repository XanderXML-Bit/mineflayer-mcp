/**
 * Tests for version-adapter.ts
 */

import { describe, it, expect } from 'vitest';
import { VersionAdapter, createVersionAdapter } from '../../../src/utils/version-adapter.js';

describe('VersionAdapter', () => {
  // Mock mcData for testing
  const createMockMcData = (blocks: string[], entities: string[] = []) => ({
    blocksByName: Object.fromEntries(blocks.map((b) => [b, { id: 1 }])),
    entitiesByName: Object.fromEntries(entities.map((e) => [e, { id: 1 }])),
    itemsByName: Object.fromEntries(blocks.map((b) => [b, { id: 1 }])),
  });

  describe('version extraction', () => {
    it('should extract major version from full version string', () => {
      const mcData = createMockMcData(['stone']);
      const adapter = new VersionAdapter('1.20.4', mcData);
      expect(adapter.getMajorVersion()).toBe('1.20');
    });

    it('should extract major version from simple version', () => {
      const mcData = createMockMcData(['stone']);
      const adapter = new VersionAdapter('1.18', mcData);
      expect(adapter.getMajorVersion()).toBe('1.18');
    });

    it('should default to 1.20 for invalid version', () => {
      const mcData = createMockMcData(['stone']);
      const adapter = new VersionAdapter('invalid', mcData);
      expect(adapter.getMajorVersion()).toBe('1.20');
    });

    it('should return full version from getVersion()', () => {
      const mcData = createMockMcData(['stone']);
      const adapter = new VersionAdapter('1.19.3', mcData);
      expect(adapter.getVersion()).toBe('1.19.3');
    });
  });

  describe('capabilities', () => {
    it('should have default capabilities for 1.20', () => {
      const mcData = createMockMcData(['stone']);
      const adapter = new VersionAdapter('1.20', mcData);
      const caps = adapter.getCapabilities();

      expect(caps.hasOffhand).toBe(true);
      expect(caps.hasDualWield).toBe(true);
      expect(caps.hasShields).toBe(true);
      expect(caps.hasElytra).toBe(true);
      expect(caps.hasTridents).toBe(true);
      expect(caps.combatCooldown).toBe(true);
      expect(caps.maxStackSize).toBe(64);
    });

    it('should have capabilities for 1.16', () => {
      const mcData = createMockMcData(['stone']);
      const adapter = new VersionAdapter('1.16', mcData);
      const caps = adapter.getCapabilities();

      expect(caps.hasOffhand).toBe(true);
      expect(caps.hasShields).toBe(true);
      expect(caps.hasTridents).toBe(true);
    });

    it('should return immutable copy of capabilities', () => {
      const mcData = createMockMcData(['stone']);
      const adapter = new VersionAdapter('1.20', mcData);
      const caps1 = adapter.getCapabilities();
      const caps2 = adapter.getCapabilities();

      expect(caps1).not.toBe(caps2);
      expect(caps1).toEqual(caps2);
    });
  });

  describe('capability checks', () => {
    it('canUseShield should return correct value', () => {
      const mcData = createMockMcData(['stone']);
      const adapter = new VersionAdapter('1.20', mcData);
      expect(adapter.canUseShield()).toBe(true);
    });

    it('canUseOffhand should return correct value', () => {
      const mcData = createMockMcData(['stone']);
      const adapter = new VersionAdapter('1.20', mcData);
      expect(adapter.canUseOffhand()).toBe(true);
    });

    it('hasTridents should return correct value', () => {
      const mcData = createMockMcData(['stone']);
      const adapter = new VersionAdapter('1.20', mcData);
      expect(adapter.hasTridents()).toBe(true);
    });

    it('getCombatCooldown should return 500 for modern versions', () => {
      const mcData = createMockMcData(['stone']);
      const adapter = new VersionAdapter('1.20', mcData);
      expect(adapter.getCombatCooldown()).toBe(500);
    });
  });

  describe('block name resolution', () => {
    it('should resolve alias to canonical name when canonical exists', () => {
      const mcData = createMockMcData(['grass_block', 'stone']);
      const adapter = new VersionAdapter('1.20', mcData);

      // 'grass' is alias for 'grass_block'
      expect(adapter.resolveBlockName('grass')).toBe('grass_block');
    });

    it('should resolve canonical to alias when canonical does not exist', () => {
      const mcData = createMockMcData(['grass', 'stone']); // Older version without grass_block
      const adapter = new VersionAdapter('1.20', mcData);

      // 'grass_block' should resolve to 'grass'
      expect(adapter.resolveBlockName('grass_block')).toBe('grass');
    });

    it('should return original name if no mapping exists', () => {
      const mcData = createMockMcData(['stone']);
      const adapter = new VersionAdapter('1.20', mcData);

      expect(adapter.resolveBlockName('stone')).toBe('stone');
      expect(adapter.resolveBlockName('unknown_block')).toBe('unknown_block');
    });

    it('should handle deepslate ores', () => {
      const mcData = createMockMcData(['deepslate_iron_ore', 'stone']);
      const adapter = new VersionAdapter('1.20', mcData);

      // 'iron_ore' mapping for deepslate
      expect(adapter.resolveBlockName('iron_ore')).toBe('deepslate_iron_ore');
    });
  });

  describe('entity name resolution', () => {
    it('should resolve alias to canonical name', () => {
      const mcData = createMockMcData([], ['snow_golem']);
      const adapter = new VersionAdapter('1.20', mcData);

      expect(adapter.resolveEntityName('snowman')).toBe('snow_golem');
    });

    it('should resolve canonical to alias for older versions', () => {
      const mcData = createMockMcData([], ['snowman']);
      const adapter = new VersionAdapter('1.20', mcData);

      expect(adapter.resolveEntityName('snow_golem')).toBe('snowman');
    });

    it('should return original name if no mapping exists', () => {
      const mcData = createMockMcData([], ['zombie']);
      const adapter = new VersionAdapter('1.20', mcData);

      expect(adapter.resolveEntityName('zombie')).toBe('zombie');
    });
  });

  describe('canonical name getters', () => {
    it('getCanonicalBlockName should return canonical from alias', () => {
      const mcData = createMockMcData(['grass_block']);
      const adapter = new VersionAdapter('1.20', mcData);

      // Reverse mapping: grass_block -> grass (the alias)
      expect(adapter.getCanonicalBlockName('grass_block')).toBe('grass');
    });

    it('getCanonicalEntityName should return canonical from alias', () => {
      const mcData = createMockMcData([], ['snow_golem']);
      const adapter = new VersionAdapter('1.20', mcData);

      expect(adapter.getCanonicalEntityName('snow_golem')).toBe('snowman');
    });

    it('should return original name if no reverse mapping', () => {
      const mcData = createMockMcData(['stone']);
      const adapter = new VersionAdapter('1.20', mcData);

      expect(adapter.getCanonicalBlockName('stone')).toBe('stone');
    });
  });

  describe('existence checks', () => {
    it('blockExists should return true for existing blocks', () => {
      const mcData = createMockMcData(['stone', 'dirt']);
      const adapter = new VersionAdapter('1.20', mcData);

      expect(adapter.blockExists('stone')).toBe(true);
      expect(adapter.blockExists('dirt')).toBe(true);
    });

    it('blockExists should return false for non-existing blocks', () => {
      const mcData = createMockMcData(['stone']);
      const adapter = new VersionAdapter('1.20', mcData);

      expect(adapter.blockExists('nonexistent')).toBe(false);
    });

    it('blockExists should resolve aliases', () => {
      const mcData = createMockMcData(['grass_block']);
      const adapter = new VersionAdapter('1.20', mcData);

      // 'grass' is alias for 'grass_block'
      expect(adapter.blockExists('grass')).toBe(true);
    });

    it('itemExists should return true for existing items', () => {
      const mcData = createMockMcData(['diamond']);
      const adapter = new VersionAdapter('1.20', mcData);

      expect(adapter.itemExists('diamond')).toBe(true);
    });

    it('itemExists should return false for non-existing items', () => {
      const mcData = createMockMcData(['stone']);
      const adapter = new VersionAdapter('1.20', mcData);

      expect(adapter.itemExists('nonexistent')).toBe(false);
    });
  });
});

describe('createVersionAdapter', () => {
  it('should create adapter from bot with version', () => {
    const mockBot = {
      version: '1.20.1',
      __mcdata: {
        blocksByName: { stone: { id: 1 } },
        entitiesByName: {},
        itemsByName: { stone: { id: 1 } },
      },
    };

    const adapter = createVersionAdapter(mockBot);
    expect(adapter.getVersion()).toBe('1.20.1');
    expect(adapter.getMajorVersion()).toBe('1.20');
  });

  it('should default to 1.20 if no version on bot', () => {
    const mockBot = {
      __mcdata: {
        blocksByName: { stone: { id: 1 } },
        entitiesByName: {},
        itemsByName: { stone: { id: 1 } },
      },
    };

    const adapter = createVersionAdapter(mockBot);
    expect(adapter.getVersion()).toBe('1.20');
  });
});
