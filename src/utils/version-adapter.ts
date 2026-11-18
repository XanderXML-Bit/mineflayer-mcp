/**
 * Multi-version compatibility adapter for Minecraft MCP
 *
 * Handles differences between Minecraft versions 1.16-1.20+
 */

import minecraftData from 'minecraft-data';

/** Minecraft data interface for the parts we use */
interface MinecraftDataInterface {
  blocksByName: Record<string, { name: string; id: number } | undefined>;
  entitiesByName: Record<string, { name: string; id: number } | undefined>;
  itemsByName: Record<string, { name: string; id: number } | undefined>;
}

/** Bot with version and mcdata properties */
interface BotWithVersion {
  version?: string;
  __mcdata?: MinecraftDataInterface;
}

/** Version capabilities */
export interface VersionCapabilities {
  hasOffhand: boolean;
  hasDualWield: boolean;
  hasShields: boolean;
  hasElytra: boolean;
  hasTridents: boolean;
  combatCooldown: boolean;
  maxStackSize: number;
}

/** Version-specific capabilities */
const VERSION_CAPABILITIES: Record<string, Partial<VersionCapabilities>> = {
  '1.16': { hasOffhand: true, hasShields: true, combatCooldown: true, hasTridents: true },
  '1.17': { hasOffhand: true, hasShields: true, combatCooldown: true, hasTridents: true },
  '1.18': { hasOffhand: true, hasShields: true, combatCooldown: true, hasTridents: true },
  '1.19': { hasOffhand: true, hasShields: true, combatCooldown: true, hasTridents: true },
  '1.20': { hasOffhand: true, hasShields: true, combatCooldown: true, hasTridents: true },
  '1.21': { hasOffhand: true, hasShields: true, combatCooldown: true, hasTridents: true },
};

/** Block name mappings across versions */
const BLOCK_NAME_MAPPINGS: Record<string, string[]> = {
  grass_block: ['grass'],
  oak_log: ['log'],
  cobblestone_slab: ['stone_slab'],
  dirt_path: ['grass_path'],
  deepslate_iron_ore: ['iron_ore'],
  deepslate_gold_ore: ['gold_ore'],
  deepslate_diamond_ore: ['diamond_ore'],
  deepslate_coal_ore: ['coal_ore'],
  deepslate_copper_ore: ['copper_ore'],
  deepslate_lapis_ore: ['lapis_ore'],
  deepslate_redstone_ore: ['redstone_ore'],
  deepslate_emerald_ore: ['emerald_ore'],
  raw_iron: ['iron_ore'],
  raw_gold: ['gold_ore'],
  raw_copper: ['copper_ore'],
};

/** Entity name mappings across versions */
const ENTITY_NAME_MAPPINGS: Record<string, string[]> = {
  snow_golem: ['snowman'],
  mooshroom: ['mushroom_cow'],
};

/**
 * Version compatibility adapter
 */
export class VersionAdapter {
  private capabilities: VersionCapabilities;
  private blockNameMap: Map<string, string> = new Map();
  private entityNameMap: Map<string, string> = new Map();
  private reverseBlockMap: Map<string, string> = new Map();
  private reverseEntityMap: Map<string, string> = new Map();
  private majorVersion: string;

  constructor(
    private version: string,
    private mcData: MinecraftDataInterface
  ) {
    this.majorVersion = this.extractMajorVersion(version);
    this.capabilities = this.buildCapabilities();
    this.buildNameMappings();
  }

  /**
   * Extract the major version (e.g., "1.20" from "1.20.4")
   */
  private extractMajorVersion(version: string): string {
    const match = version.match(/1\.(\d+)/);
    return match ? `1.${match[1]}` : '1.20';
  }

  /**
   * Build version capabilities
   */
  private buildCapabilities(): VersionCapabilities {
    const base: VersionCapabilities = {
      hasOffhand: true,
      hasDualWield: true,
      hasShields: true,
      hasElytra: true,
      hasTridents: true,
      combatCooldown: true,
      maxStackSize: 64,
    };

    return { ...base, ...(VERSION_CAPABILITIES[this.majorVersion] || {}) };
  }

  /**
   * Build name mappings for blocks and entities
   */
  private buildNameMappings(): void {
    // Block mappings
    for (const [canonical, aliases] of Object.entries(BLOCK_NAME_MAPPINGS)) {
      if (this.mcData.blocksByName[canonical]) {
        // Canonical name exists in this version
        for (const alias of aliases) {
          this.blockNameMap.set(alias, canonical);
          this.reverseBlockMap.set(canonical, alias);
        }
      } else {
        // Try aliases as canonical names for older versions
        for (const alias of aliases) {
          if (this.mcData.blocksByName[alias]) {
            this.blockNameMap.set(canonical, alias);
            this.reverseBlockMap.set(alias, canonical);
            break;
          }
        }
      }
    }

    // Entity mappings
    for (const [canonical, aliases] of Object.entries(ENTITY_NAME_MAPPINGS)) {
      if (this.mcData.entitiesByName?.[canonical]) {
        for (const alias of aliases) {
          this.entityNameMap.set(alias, canonical);
          this.reverseEntityMap.set(canonical, alias);
        }
      } else {
        for (const alias of aliases) {
          if (this.mcData.entitiesByName?.[alias]) {
            this.entityNameMap.set(canonical, alias);
            this.reverseEntityMap.set(alias, canonical);
            break;
          }
        }
      }
    }
  }

  /**
   * Resolve a block name to the version-appropriate name
   */
  resolveBlockName(name: string): string {
    return this.blockNameMap.get(name) || name;
  }

  /**
   * Resolve an entity name to the version-appropriate name
   */
  resolveEntityName(name: string): string {
    return this.entityNameMap.get(name) || name;
  }

  /**
   * Get the canonical block name from a version-specific name
   */
  getCanonicalBlockName(name: string): string {
    return this.reverseBlockMap.get(name) || name;
  }

  /**
   * Get the canonical entity name from a version-specific name
   */
  getCanonicalEntityName(name: string): string {
    return this.reverseEntityMap.get(name) || name;
  }

  /**
   * Check if shields are available in this version
   */
  canUseShield(): boolean {
    return this.capabilities.hasShields;
  }

  /**
   * Check if offhand is available in this version
   */
  canUseOffhand(): boolean {
    return this.capabilities.hasOffhand;
  }

  /**
   * Get the combat cooldown in milliseconds (0 for pre-1.9)
   */
  getCombatCooldown(): number {
    return this.capabilities.combatCooldown ? 500 : 0;
  }

  /**
   * Check if tridents are available in this version
   */
  hasTridents(): boolean {
    return this.capabilities.hasTridents;
  }

  /**
   * Get the current Minecraft version
   */
  getVersion(): string {
    return this.version;
  }

  /**
   * Get the major version string
   */
  getMajorVersion(): string {
    return this.majorVersion;
  }

  /**
   * Get all capabilities
   */
  getCapabilities(): VersionCapabilities {
    return { ...this.capabilities };
  }

  /**
   * Check if a block exists in this version
   */
  blockExists(name: string): boolean {
    const resolved = this.resolveBlockName(name);
    return !!this.mcData.blocksByName[resolved];
  }

  /**
   * Check if an item exists in this version
   */
  itemExists(name: string): boolean {
    return !!this.mcData.itemsByName[name];
  }
}

/**
 * Create a version adapter for a bot
 */
export function createVersionAdapter(bot: BotWithVersion): VersionAdapter {
  const version = bot.version || '1.20';
  const mcData = bot.__mcdata || minecraftData(version) as MinecraftDataInterface;
  return new VersionAdapter(version, mcData);
}
