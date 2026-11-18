/**
 * Tests for combat tools (auto-defense, assess-threats, attack-someone, hunt, stop-attack, get-combat-readiness)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ToolContext } from '../../../src/tools/base-tool.js';
import { AutoDefenseTool } from '../../../src/tools/combat/auto-defense.js';
import { AssessThreatsTool } from '../../../src/tools/combat/assess-threats.js';
import { GetCombatReadinessTool } from '../../../src/tools/combat/get-combat-readiness.js';
import { StopAttackTool } from '../../../src/tools/combat/stop-attack.js';

// Mock auto-defense service
vi.mock('../../../src/services/auto-defense.service.js', () => ({
  setAutoDefenseEnabled: vi.fn(),
  configureAutoDefense: vi.fn(),
  getAutoDefenseStatus: vi.fn().mockReturnValue({
    enabled: false,
    isAttacking: false,
    currentTarget: null,
    config: {
      enabled: false,
      minHealthToFight: 6,
      attackRange: 4,
      chase: true,
      maxChaseDistance: 16,
      proactiveDefense: false,
      proactiveRadius: 8,
    },
  }),
}));

// Mock combat intelligence service
vi.mock('../../../src/services/combat-intelligence.service.js', () => ({
  assessThreats: vi.fn().mockReturnValue({
    overallThreat: 'low',
    threats: [],
    nearestThreat: null,
    recommendation: 'ignore',
    escapeRoutes: [],
    summary: 'No immediate threats detected',
  }),
  getCombatReadiness: vi.fn().mockReturnValue({
    ready: true,
    armorRating: 15,
    bestWeapon: 'iron_sword',
    weaponDamage: 6,
    shieldEquipped: false,
    healthPercent: 100,
    foodLevel: 20,
    issues: [],
    summary: 'Ready for combat',
  }),
  getCombatStats: vi.fn().mockReturnValue({
    totalFights: 10,
    wins: 8,
    losses: 2,
    winRate: 0.8,
    deathsBy: { zombie: 1, skeleton: 1 },
    killsBy: { zombie: 5, skeleton: 3 },
  }),
}));

// Mock equipment service
vi.mock('../../../src/services/equipment.service.js', () => ({
  createEquipmentService: () => ({
    equipBestWeapon: vi.fn().mockResolvedValue(undefined),
    pushSuspendAutoEat: vi.fn(),
    popSuspendAutoEat: vi.fn(),
  }),
}));

describe('Combat Tools', () => {
  let mockContext: ToolContext;
  let mockBot: ReturnType<typeof createMockBot>;

  function createMockBot() {
    const position = {
      x: 100,
      y: 64,
      z: -50,
      floored: () => position,
      offset: (dx: number, dy: number, dz: number) => ({
        x: position.x + dx,
        y: position.y + dy,
        z: position.z + dz,
        floored: () => position,
      }),
      clone: () => position,
      distanceTo: (other: { x: number; y: number; z: number }) => {
        const dx = position.x - other.x;
        const dy = position.y - other.y;
        const dz = position.z - other.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
      },
    };

    const inventoryItems = [
      { name: 'iron_sword', count: 1, slot: 0, type: 267, nbt: null },
      { name: 'shield', count: 1, slot: 1, type: 442, nbt: null },
      { name: 'cooked_beef', count: 64, slot: 2, type: 364, nbt: null },
    ];

    return {
      username: 'TestBot',
      version: '1.20.1',
      health: 20,
      food: 20,
      foodSaturation: 5,
      entity: { position, onGround: true, equipment: [] },
      inventory: {
        items: () => inventoryItems,
        slots: inventoryItems,
      },
      entities: {},
      oxygenLevel: 20,
      time: { timeOfDay: 6000 },
      blockAt: vi.fn().mockReturnValue({ name: 'grass_block' }),
      game: { gameMode: 0 },
      heldItem: { name: 'iron_sword' },
      attack: vi.fn().mockResolvedValue(undefined),
      equip: vi.fn().mockResolvedValue(undefined),
      lookAt: vi.fn().mockResolvedValue(undefined),
      activateItem: vi.fn(),
      deactivateItem: vi.fn(),
      waitForTicks: vi.fn().mockResolvedValue(undefined),
      nearestEntity: vi.fn().mockReturnValue(null),
      on: vi.fn(),
      removeListener: vi.fn(),
      pvp: {
        attack: vi.fn(),
        stop: vi.fn(),
      },
      __status: null,
      __chatLog: [],
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockBot = createMockBot();
    mockContext = {
      getBotOrThrow: vi.fn().mockReturnValue(mockBot),
      getAllBots: vi.fn().mockReturnValue(new Map([['TestBot', mockBot]])),
      config: {} as unknown as ToolContext['config'],
    };
  });

  describe('AutoDefenseTool', () => {
    it('should have correct definition', () => {
      const tool = new AutoDefenseTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('configureAutoDefense');
      expect(definition.description).toContain('automatic');
      expect(definition.inputSchema.properties).toHaveProperty('action');
      expect(definition.inputSchema.properties).toHaveProperty('config');
    });

    it('should enable auto-defense', async () => {
      const { setAutoDefenseEnabled, getAutoDefenseStatus } = await import(
        '../../../src/services/auto-defense.service.js'
      );
      vi.mocked(getAutoDefenseStatus).mockReturnValue({
        enabled: true,
        isAttacking: false,
        currentTarget: null,
        config: {
          enabled: true,
          minHealthToFight: 6,
          attackRange: 4,
          chase: true,
          maxChaseDistance: 16,
          proactiveDefense: false,
          proactiveRadius: 8,
        },
      });

      const tool = new AutoDefenseTool(mockContext);
      const result = await tool.run({ action: 'enable' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.enabled).toBe(true);
        expect(result.data.message).toContain('enabled');
      }
      expect(setAutoDefenseEnabled).toHaveBeenCalledWith(mockBot, true);
    });

    it('should disable auto-defense', async () => {
      const { setAutoDefenseEnabled, getAutoDefenseStatus } = await import(
        '../../../src/services/auto-defense.service.js'
      );
      vi.mocked(getAutoDefenseStatus).mockReturnValue({
        enabled: false,
        isAttacking: false,
        currentTarget: null,
        config: {
          enabled: false,
          minHealthToFight: 6,
          attackRange: 4,
          chase: true,
          maxChaseDistance: 16,
          proactiveDefense: false,
          proactiveRadius: 8,
        },
      });

      const tool = new AutoDefenseTool(mockContext);
      const result = await tool.run({ action: 'disable' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.enabled).toBe(false);
        expect(result.data.message).toContain('disabled');
      }
      expect(setAutoDefenseEnabled).toHaveBeenCalledWith(mockBot, false);
    });

    it('should configure auto-defense', async () => {
      const { configureAutoDefense } = await import(
        '../../../src/services/auto-defense.service.js'
      );

      const tool = new AutoDefenseTool(mockContext);
      const config = {
        minHealthToFight: 10,
        attackRange: 5,
        proactiveDefense: true,
      };
      const result = await tool.run({ action: 'configure', config });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.message).toContain('configuration');
      }
      expect(configureAutoDefense).toHaveBeenCalledWith(mockBot, config);
    });

    it('should return status', async () => {
      const tool = new AutoDefenseTool(mockContext);
      const result = await tool.run({ action: 'status' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.config).toBeDefined();
        expect(result.data.isAttacking).toBe(false);
        expect(result.data.currentTarget).toBe(null);
      }
    });

    it('should show current target when attacking', async () => {
      const { getAutoDefenseStatus } = await import(
        '../../../src/services/auto-defense.service.js'
      );
      vi.mocked(getAutoDefenseStatus).mockReturnValue({
        enabled: true,
        isAttacking: true,
        currentTarget: 'zombie',
        config: {
          enabled: true,
          minHealthToFight: 6,
          attackRange: 4,
          chase: true,
          maxChaseDistance: 16,
          proactiveDefense: false,
          proactiveRadius: 8,
        },
      });

      const tool = new AutoDefenseTool(mockContext);
      const result = await tool.run({ action: 'status' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.isAttacking).toBe(true);
        expect(result.data.currentTarget).toBe('zombie');
        expect(result.data.message).toContain('zombie');
      }
    });
  });

  describe('AssessThreatsTool', () => {
    it('should have correct definition', () => {
      const tool = new AssessThreatsTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('assessThreats');
      expect(definition.description).toContain('hostile');
      expect(definition.inputSchema.properties).toHaveProperty('radius');
    });

    it('should assess threats with default radius', async () => {
      const tool = new AssessThreatsTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.scanRadius).toBe(16);
        expect(result.data.overallThreat).toBeDefined();
        expect(result.data.recommendation).toBeDefined();
      }
    });

    it('should assess threats with custom radius', async () => {
      const { assessThreats } = await import(
        '../../../src/services/combat-intelligence.service.js'
      );

      const tool = new AssessThreatsTool(mockContext);
      const result = await tool.run({ radius: 32 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.scanRadius).toBe(32);
      }
      expect(assessThreats).toHaveBeenCalledWith(mockBot, 32);
    });

    it('should return fight recommendation when threats are manageable', async () => {
      const { assessThreats } = await import(
        '../../../src/services/combat-intelligence.service.js'
      );
      vi.mocked(assessThreats).mockReturnValue({
        overallThreat: 'medium',
        threats: [
          {
            entity: '123',
            name: 'zombie',
            type: 'hostile',
            distance: 10,
            health: 20,
            maxHealth: 20,
            damage: 3,
            isBaby: false,
            isHostile: true,
            canWin: true,
          },
        ],
        nearestThreat: {
          entity: '123',
          name: 'zombie',
          type: 'hostile',
          distance: 10,
          health: 20,
          maxHealth: 20,
          damage: 3,
          isBaby: false,
          isHostile: true,
          canWin: true,
        },
        recommendation: 'fight',
        escapeRoutes: [],
        summary: 'One zombie nearby - you can take it',
      });

      const tool = new AssessThreatsTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.recommendation).toBe('fight');
        expect(result.data.threats.length).toBe(1);
        expect(result.data.nearestThreat?.name).toBe('zombie');
      }
    });

    it('should return flee recommendation when overwhelmed', async () => {
      const { assessThreats } = await import(
        '../../../src/services/combat-intelligence.service.js'
      );
      vi.mocked(assessThreats).mockReturnValue({
        overallThreat: 'critical',
        threats: [],
        nearestThreat: null,
        recommendation: 'flee',
        escapeRoutes: [{ x: 100, y: 64, z: -60 }],
        summary: 'Multiple creepers detected - run!',
      });

      const tool = new AssessThreatsTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.recommendation).toBe('flee');
        expect(result.data.escapeRoutes.length).toBeGreaterThan(0);
      }
    });
  });

  describe('GetCombatReadinessTool', () => {
    it('should have correct definition', () => {
      const tool = new GetCombatReadinessTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('getCombatReadiness');
      expect(definition.description).toContain('readiness');
      expect(definition.inputSchema.properties).toHaveProperty('includeStats');
    });

    it('should return combat readiness without stats', async () => {
      const tool = new GetCombatReadinessTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.ready).toBe(true);
        expect(result.data.armorRating).toBeDefined();
        expect(result.data.bestWeapon).toBe('iron_sword');
        expect(result.data.stats).toBeUndefined();
      }
    });

    it('should return combat readiness with stats', async () => {
      const tool = new GetCombatReadinessTool(mockContext);
      const result = await tool.run({ includeStats: true });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.ready).toBe(true);
        expect(result.data.stats).toBeDefined();
        expect(result.data.stats?.totalFights).toBe(10);
        expect(result.data.stats?.winRate).toBe(0.8);
      }
    });

    it('should identify combat issues', async () => {
      const { getCombatReadiness } = await import(
        '../../../src/services/combat-intelligence.service.js'
      );
      vi.mocked(getCombatReadiness).mockReturnValue({
        ready: false,
        armorRating: 0,
        bestWeapon: null,
        weaponDamage: 1,
        shieldEquipped: false,
        healthPercent: 30,
        foodLevel: 5,
        issues: ['No weapon equipped', 'Low health', 'Low food'],
        summary: 'Not ready for combat - missing equipment and low resources',
      });

      const tool = new GetCombatReadinessTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.ready).toBe(false);
        expect(result.data.issues.length).toBeGreaterThan(0);
        expect(result.data.issues).toContain('No weapon equipped');
      }
    });
  });

  describe('StopAttackTool', () => {
    it('should have correct definition', () => {
      const tool = new StopAttackTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('stopAttack');
      expect(definition.description).toContain('Stop');
    });

    it('should stop current attack', async () => {
      const tool = new StopAttackTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.ok).toBe(true);
      }
    });

    it('should handle stop when no attack is active', async () => {
      mockBot.pvp = undefined;

      const tool = new StopAttackTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.ok).toBe(true);
      }
    });
  });

  describe('Combat Tool Integration', () => {
    it('should all be in combat category', () => {
      const autoDefenseTool = new AutoDefenseTool(mockContext);
      const assessTool = new AssessThreatsTool(mockContext);
      const readinessTool = new GetCombatReadinessTool(mockContext);
      const stopTool = new StopAttackTool(mockContext);

      expect(autoDefenseTool.category).toBe('combat');
      expect(assessTool.category).toBe('combat');
      expect(readinessTool.category).toBe('combat');
      expect(stopTool.category).toBe('combat');
    });

    it('should provide consistent status tracking', async () => {
      const tools = [
        new AutoDefenseTool(mockContext),
        new AssessThreatsTool(mockContext),
        new GetCombatReadinessTool(mockContext),
        new StopAttackTool(mockContext),
      ];

      for (const tool of tools) {
        let result;
        if (tool.name === 'configureAutoDefense') {
          result = await tool.run({ action: 'status' });
        } else {
          result = await tool.run({});
        }
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.status).toBeDefined();
          expect(result.bot).toBe('TestBot');
        }
      }
    });

    it('should work together for combat workflow', async () => {
      // Step 1: Check combat readiness
      const readinessTool = new GetCombatReadinessTool(mockContext);
      const readinessResult = await readinessTool.run({});
      expect(readinessResult.ok).toBe(true);

      // Step 2: Assess threats
      const assessTool = new AssessThreatsTool(mockContext);
      const threatResult = await assessTool.run({});
      expect(threatResult.ok).toBe(true);

      // Step 3: Enable auto-defense if ready
      const autoDefenseTool = new AutoDefenseTool(mockContext);
      const enableResult = await autoDefenseTool.run({ action: 'enable' });
      expect(enableResult.ok).toBe(true);

      // Step 4: Stop attack when done
      const stopTool = new StopAttackTool(mockContext);
      const stopResult = await stopTool.run({});
      expect(stopResult.ok).toBe(true);
    });
  });
});
