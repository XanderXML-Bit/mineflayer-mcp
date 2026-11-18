/**
 * Tests for utility tools (rest, dance, detect-gamemode, etc.)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ToolContext } from '../../../src/tools/base-tool.js';
import { RestTool } from '../../../src/tools/utility/rest.js';
import { DanceTool } from '../../../src/tools/utility/dance.js';
import { DetectGamemodeTool } from '../../../src/tools/utility/detect-gamemode.js';
import { GetEventsTool } from '../../../src/tools/utility/get-events.js';
import { StatusDashboardTool } from '../../../src/tools/utility/status-dashboard.js';
import { RecoverItemsTool } from '../../../src/tools/utility/recover-items.js';
import { GoToSurfaceTool } from '../../../src/tools/utility/go-to-surface.js';
import { PickupItemTool } from '../../../src/tools/utility/pickup-item.js';
import { PickupLootTool } from '../../../src/tools/utility/pickup-loot.js';
import { SleepInBedTool } from '../../../src/tools/utility/sleep-in-bed.js';
import { StopAllTasksTool } from '../../../src/tools/utility/stop-all-tasks.js';

// Mock block helpers
vi.mock('../../../src/utils/block-helpers.js', () => ({
  isClearToSkyAt: vi.fn().mockReturnValue(true),
}));

// Mock mining helpers
vi.mock('../../../src/utils/mining-helpers.js', () => ({
  digBlockWithTimeout: vi.fn().mockResolvedValue(undefined),
  pickupNearbyDrops: vi.fn().mockResolvedValue(0),
}));

// Mock equipment service
vi.mock('../../../src/services/equipment.service.js', () => ({
  createEquipmentService: vi.fn(() => ({
    pushSuspendAutoEat: vi.fn(),
    popSuspendAutoEat: vi.fn(),
    equipBestToolForBlock: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock pathfinder module
vi.mock('mineflayer-pathfinder', () => {
  const goals = {
    GoalNear: class GoalNear {
      constructor(public x, public y, public z, public range) {}
    },
    GoalY: class GoalY {
      constructor(public y) {}
    },
    GoalFollow: class GoalFollow {
      constructor(public entity, public range) {}
    },
    GoalBlock: class GoalBlock {
      constructor(public x, public y, public z) {}
    },
    GoalXZ: class GoalXZ {
      constructor(public x, public z) {}
    },
  };
  return {
    default: { goals },
    goals,
  };
});

// Mock the event service
vi.mock('../../../src/services/event.service.js', () => {
  let events: { type: string; timestamp: number; data: unknown }[] = [];
  return {
    getAndClearEvents: vi.fn(() => {
      const result = [...events];
      events = [];
      return result;
    }),
    peekEvents: vi.fn((bot: unknown, since?: number) => {
      if (since) {
        return events.filter((e) => e.timestamp >= since);
      }
      return [...events];
    }),
    __setEvents: (newEvents: { type: string; timestamp: number; data: unknown }[]) => {
      events = newEvents;
    },
  };
});

// Mock task service
vi.mock('../../../src/services/task.service.js', () => ({
  withTask: vi.fn((_bot, fn) => fn({
    onAbort: vi.fn(),
  })),
  stopAllTasks: vi.fn(),
}));

// Mock world state service
vi.mock('../../../src/services/world-state.service.js', () => ({
  getWorldState: vi.fn(() => ({
    biome: 'plains',
    dimension: 'overworld',
    time: { phase: 'day', dayTime: 6000 },
    lightLevel: 15,
    weather: 'clear',
    isUnderground: false,
    nearbyStructures: [],
  })),
  getDangerLevel: vi.fn(() => ({ level: 1, reasons: [] })),
}));

// Mock resource planner service
vi.mock('../../../src/services/resource-planner.service.js', () => ({
  getResourceStatus: vi.fn(() => ({
    food: { mealsRemaining: 5 },
    tools: [],
    inventoryPercent: 50,
    inventoryUsed: 18,
    inventoryTotal: 36,
  })),
}));

// Mock combat intelligence service
vi.mock('../../../src/services/combat-intelligence.service.js', () => ({
  assessThreats: vi.fn(() => ({
    overallThreat: 'low',
    threats: [],
    nearestThreat: null,
    recommendation: 'Safe to proceed',
  })),
  getCombatReadiness: vi.fn(() => ({
    ready: true,
    armorRating: 10,
    weapons: [],
  })),
}));

// Mock goal service
vi.mock('../../../src/services/goal.service.js', () => ({
  getActiveGoals: vi.fn(() => []),
}));

// Update the death recovery mock to allow setting deaths for tests
vi.mock('../../../src/services/death-recovery.service.js', () => {
  let lastDeath = null;
  return {
    getLastDeath: vi.fn(() => lastDeath),
    markRecovered: vi.fn(() => {
      if (lastDeath) { lastDeath.recovered = true; return true; }
      return false;
    }),
    incrementRecoveryAttempts: vi.fn(() => {
      if (lastDeath) return ++lastDeath.recoveryAttempts;
      return 0;
    }),
    itemsLikelyAvailable: vi.fn(() => ({ available: lastDeath ? !lastDeath.recovered : false, timeRemaining: 180000 })),
    getDeathHistory: vi.fn(() => lastDeath ? [lastDeath] : []),
    getDeathStats: vi.fn(() => ({ totalDeaths: lastDeath ? 1 : 0, recoveredCount: 0 })),
    __setLastDeath: (death) => { lastDeath = death; },
    __clearLastDeath: () => { lastDeath = null; },
  };
});

// Mock navigation service
vi.mock('../../../src/services/navigation.service.js', () => ({
  configureMovements: vi.fn(() => ({})),
  pathfindToPredicate: vi.fn().mockRejectedValue(new Error('No matching block found')),
}));


describe('Utility Tools', () => {
  let mockContext: ToolContext;
  let mockBot: ReturnType<typeof createMockBot>;

  function createMockBot() {
    const position = {
      x: 0,
      y: 64,
      z: 0,
      floored: () => position,
      offset: (dx: number, dy: number, dz: number) => ({
        x: position.x + dx,
        y: position.y + dy,
        z: position.z + dz,
        floored: () => position,
      }),
      clone: () => position,
    };

    return {
      username: 'TestBot',
      health: 20,
      food: 20,
      foodSaturation: 5,
      entity: { position, onGround: true },
      inventory: { items: () => [] },
      oxygenLevel: 20,
      time: { timeOfDay: 6000 },
      blockAt: vi.fn().mockReturnValue({ name: 'grass_block', biome: { name: 'plains' } }),
      game: { gameMode: 0 }, // 0 = survival (numeric)
      setControlState: vi.fn(),
      waitForTicks: vi.fn().mockResolvedValue(undefined),
      players: {},
      entities: {},
      pathfinder: {
        goto: vi.fn().mockResolvedValue(undefined),
        setMovements: vi.fn(),
        setGoal: vi.fn(),
        isMoving: vi.fn().mockReturnValue(false),
        stop: vi.fn(),
      },
      nearestEntity: vi.fn().mockReturnValue(null),
      sleep: vi.fn().mockResolvedValue(undefined),
      wake: vi.fn().mockResolvedValue(undefined),
      activateBlock: vi.fn().mockResolvedValue(undefined),
      findBlock: vi.fn().mockReturnValue(null),
      __status: null,
      __chatLog: [],
      __eventLog: [],
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

  describe('RestTool', () => {
    it('should have correct definition', () => {
      const tool = new RestTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('rest');
      expect(definition.description).toContain('Wait');
      expect(definition.inputSchema.properties).toHaveProperty('ms');
    });

    it('should wait for specified duration', async () => {
      const tool = new RestTool(mockContext);
      const start = Date.now();
      const result = await tool.run({ ms: 50 });
      const elapsed = Date.now() - start;

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.ok).toBe(true);
      }
      expect(elapsed).toBeGreaterThanOrEqual(40); // Allow some tolerance
    });

    it('should use default duration', async () => {
      const tool = new RestTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
    });

    it('should work with zero ms', async () => {
      const tool = new RestTool(mockContext);
      const result = await tool.run({ ms: 0 });

      expect(result.ok).toBe(true);
    });

    it('should return status in response', async () => {
      const tool = new RestTool(mockContext);
      const result = await tool.run({ ms: 10 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.bot).toBe('TestBot');
        expect(result.status).toBeDefined();
      }
    });
  });

  describe('DanceTool', () => {
    it('should have correct definition', () => {
      const tool = new DanceTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('dance');
      expect(definition.description).toContain('dance');
      expect(definition.inputSchema.properties).toHaveProperty('durationMs');
    });

    it('should execute dance', async () => {
      const tool = new DanceTool(mockContext);
      const result = await tool.run({ durationMs: 100 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toBeDefined();
      }
    });

    it('should use default duration', async () => {
      const tool = new DanceTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
    });

    it('should control bot movements during dance', async () => {
      const tool = new DanceTool(mockContext);
      await tool.run({ durationMs: 50 });

      // Verify setControlState was called
      expect(mockBot.setControlState).toHaveBeenCalled();
    });
  });

  describe('DetectGamemodeTool', () => {
    it('should have correct definition', () => {
      const tool = new DetectGamemodeTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('detectGamemode');
      expect(definition.description).toContain('game mode');
    });

    it('should detect survival mode', async () => {
      mockBot.game = { gameMode: 0 };
      const tool = new DetectGamemodeTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.gameMode).toBe('survival');
      }
    });

    it('should detect creative mode', async () => {
      mockBot.game = { gameMode: 1 };
      const tool = new DetectGamemodeTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.gameMode).toBe('creative');
      }
    });

    it('should detect adventure mode', async () => {
      mockBot.game = { gameMode: 2 };
      const tool = new DetectGamemodeTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.gameMode).toBe('adventure');
      }
    });

    it('should detect spectator mode', async () => {
      mockBot.game = { gameMode: 3 };
      const tool = new DetectGamemodeTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.gameMode).toBe('spectator');
      }
    });

    it('should handle missing game info', async () => {
      mockBot.game = undefined as unknown as { gameMode: number };
      const tool = new DetectGamemodeTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.gameMode).toBe('NaN');
      }
    });
  });

  describe('GetEventsTool', () => {
    it('should have correct definition', () => {
      const tool = new GetEventsTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('getEvents');
      expect(definition.description).toContain('events');
      expect(definition.inputSchema.properties).toHaveProperty('types');
      expect(definition.inputSchema.properties).toHaveProperty('since');
      expect(definition.inputSchema.properties).toHaveProperty('clear');
    });

    it('should return empty events when no events exist', async () => {
      const tool = new GetEventsTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.events).toEqual([]);
        expect(result.data.count).toBe(0);
      }
    });

    it('should accept filter parameters', async () => {
      const tool = new GetEventsTool(mockContext);
      const result = await tool.run({ types: ['damage_taken'], since: Date.now() - 1000 });

      expect(result.ok).toBe(true);
    });

    it('should accept clear parameter', async () => {
      const tool = new GetEventsTool(mockContext);
      const result = await tool.run({ clear: true });

      expect(result.ok).toBe(true);
    });

    it('should not clear by default when clear is false', async () => {
      const tool = new GetEventsTool(mockContext);
      const result = await tool.run({ clear: false });

      expect(result.ok).toBe(true);
    });

    it('should return proper output structure', async () => {
      const tool = new GetEventsTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toHaveProperty('events');
        expect(result.data).toHaveProperty('count');
        expect(result.data).toHaveProperty('oldestTimestamp');
        expect(result.data).toHaveProperty('newestTimestamp');
      }
    });

    it('should return invalid input error for invalid types format', async () => {
      const tool = new GetEventsTool(mockContext);
      // types should be an array, not a string
      const result = await tool.run({ types: 'not_an_array' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Invalid input');
        expect(result.code).toBe('INVALID_INPUT');
      }
    });

    it('should return error when getBotOrThrow fails', async () => {
      mockContext.getBotOrThrow = vi.fn().mockImplementation(() => {
        throw new Error('Bot not connected');
      });

      const tool = new GetEventsTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Bot not connected');
      }
    });

    it('should include error code when error has code property', async () => {
      const errorWithCode = Object.assign(new Error('Custom error'), { code: 'CUSTOM_CODE' });
      mockContext.getBotOrThrow = vi.fn().mockImplementation(() => {
        throw errorWithCode;
      });

      const tool = new GetEventsTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Custom error');
        expect(result.code).toBe('CUSTOM_CODE');
      }
    });
  });
  describe('StatusDashboardTool', () => {
    it('should have correct definition', () => {
      const tool = new StatusDashboardTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('statusDashboard');
      expect(definition.description).toContain('status');
      expect(definition.inputSchema.properties).toHaveProperty('detail');
    });

    it('should return dashboard with default detail level', async () => {
      const tool = new StatusDashboardTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toBeDefined();
      }
    });

    it('should accept brief detail level', async () => {
      const tool = new StatusDashboardTool(mockContext);
      const result = await tool.run({ detail: 'brief' });

      expect(result.ok).toBe(true);
    });

    it('should accept full detail level', async () => {
      const tool = new StatusDashboardTool(mockContext);
      const result = await tool.run({ detail: 'full' });

      expect(result.ok).toBe(true);
    });

    it('should warn about nighttime when not underground', async () => {
      const { getWorldState } = await import('../../../src/services/world-state.service.js');
      vi.mocked(getWorldState).mockReturnValueOnce({
        time: { phase: 'night', dayTime: 18000 },
        biome: 'plains',
        dimension: 'overworld',
        lightLevel: 0,
        weather: 'clear',
        isUnderground: false,
        nearbyStructures: [],
      });

      const tool = new StatusDashboardTool(mockContext);
      const result = await tool.run({ detail: 'brief' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.warnings).toContain('Nighttime - hostile mobs spawn');
      }
    });

    it('should warn about critical threat level', async () => {
      const { assessThreats } = await import('../../../src/services/combat-intelligence.service.js');
      vi.mocked(assessThreats).mockReturnValueOnce({
        overallThreat: 'critical',
        threats: [{ name: 'creeper', distance: 5, threat: 'high' }],
        nearestThreat: { name: 'creeper' },
        recommendation: 'Run!',
      });

      const tool = new StatusDashboardTool(mockContext);
      const result = await tool.run({ detail: 'brief' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.warnings).toContain('CRITICAL THREAT NEARBY!');
      }
    });

    it('should warn about high threat level', async () => {
      const { assessThreats } = await import('../../../src/services/combat-intelligence.service.js');
      vi.mocked(assessThreats).mockReturnValueOnce({
        overallThreat: 'high',
        threats: [{ name: 'zombie', distance: 10, threat: 'medium' }],
        nearestThreat: { name: 'zombie' },
        recommendation: 'Stay alert',
      });

      const tool = new StatusDashboardTool(mockContext);
      const result = await tool.run({ detail: 'brief' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.warnings).toContain('Multiple threats detected');
      }
    });

    it('should warn about low meals remaining', async () => {
      const { getResourceStatus } = await import('../../../src/services/resource-planner.service.js');
      vi.mocked(getResourceStatus).mockReturnValueOnce({
        food: { mealsRemaining: 2 },
        tools: [],
        inventoryPercent: 50,
        inventoryUsed: 18,
        inventoryTotal: 36,
      });

      const tool = new StatusDashboardTool(mockContext);
      const result = await tool.run({ detail: 'normal' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.alerts?.food).toContain('Only 2 meals remaining');
      }
    });

    it('should warn about high inventory usage', async () => {
      const { getResourceStatus } = await import('../../../src/services/resource-planner.service.js');
      vi.mocked(getResourceStatus).mockReturnValueOnce({
        food: { mealsRemaining: 5 },
        tools: [],
        inventoryPercent: 95,
        inventoryUsed: 34,
        inventoryTotal: 36,
      });

      const tool = new StatusDashboardTool(mockContext);
      const result = await tool.run({ detail: 'normal' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.alerts?.inventory).toContain('Inventory 95% full');
      }
    });

    it('should warn about tools breaking', async () => {
      const { getResourceStatus } = await import('../../../src/services/resource-planner.service.js');
      vi.mocked(getResourceStatus).mockReturnValueOnce({
        food: { mealsRemaining: 5 },
        tools: [{ item: 'diamond_pickaxe', critical: true, durabilityPercent: 5 }],
        inventoryPercent: 50,
        inventoryUsed: 18,
        inventoryTotal: 36,
      });

      const tool = new StatusDashboardTool(mockContext);
      const result = await tool.run({ detail: 'normal' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.warnings.some(w => w.includes('Tool breaking'))).toBe(true);
      }
    });

    it('should warn about pending death recovery', async () => {
      const deathService = await import('../../../src/services/death-recovery.service.js');
      vi.mocked(deathService.getLastDeath).mockReturnValueOnce({
        position: { x: 100, y: 64, z: -50 },
        cause: 'zombie',
        timestamp: Date.now() - 60000,
        recoveryAttempts: 0,
        recovered: false,
      });
      vi.mocked(deathService.itemsLikelyAvailable).mockReturnValueOnce({ available: true, timeRemaining: 180000 });

      const tool = new StatusDashboardTool(mockContext);
      const result = await tool.run({ detail: 'normal' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.pendingRecovery?.hasPending).toBe(true);
        expect(result.data.warnings).toContain('Items to recover from death!');
      }
    });

    it('should count nearby mobs in full detail mode', async () => {
      mockBot.entities = {
        1: { type: 'mob', name: 'zombie', position: { x: 5, y: 64, z: 5, distanceTo: () => 5 } },
        2: { type: 'mob', name: 'zombie', position: { x: 8, y: 64, z: 8, distanceTo: () => 10 } },
        3: { type: 'mob', name: 'skeleton', position: { x: 10, y: 64, z: 10, distanceTo: () => 15 } },
      };

      const tool = new StatusDashboardTool(mockContext);
      const result = await tool.run({ detail: 'full' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.nearbyMobs).toBeDefined();
        expect(result.data.nearbyMobs?.length).toBeGreaterThan(0);
      }
    });

    it('should report critical health status and warning', async () => {
      // Set health to 3 (15%)
      mockBot.health = 3;

      const tool = new StatusDashboardTool(mockContext);
      const result = await tool.run({ detail: 'brief' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.health.status).toBe('critical');
        expect(result.data.warnings).toContain('Health critically low!');
      }
      // Reset health
      mockBot.health = 20;
    });

    it('should report low health status and warning', async () => {
      // Set health to 7 (35%)
      mockBot.health = 7;

      const tool = new StatusDashboardTool(mockContext);
      const result = await tool.run({ detail: 'brief' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.health.status).toBe('low');
        expect(result.data.warnings).toContain('Health is low');
      }
      // Reset health
      mockBot.health = 20;
    });

    it('should report starving hunger status', async () => {
      // Set food to 2
      mockBot.food = 2;

      const tool = new StatusDashboardTool(mockContext);
      const result = await tool.run({ detail: 'brief' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.hunger.status).toBe('starving');
        expect(result.data.warnings).toContain('Starving!');
      }
      // Reset food
      mockBot.food = 20;
    });

    it('should report hungry status', async () => {
      // Set food to 5
      mockBot.food = 5;

      const tool = new StatusDashboardTool(mockContext);
      const result = await tool.run({ detail: 'brief' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.hunger.status).toBe('hungry');
        expect(result.data.warnings).toContain('Getting hungry');
      }
      // Reset food
      mockBot.food = 20;
    });

    it('should report weak armor status', async () => {
      const { getCombatReadiness } = await import('../../../src/services/combat-intelligence.service.js');
      vi.mocked(getCombatReadiness).mockReturnValueOnce({
        ready: false,
        armorRating: 3,
        bestWeapon: null,
        weaponDamage: 1,
        shieldEquipped: false,
      });

      const tool = new StatusDashboardTool(mockContext);
      const result = await tool.run({ detail: 'brief' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.armor.status).toBe('weak');
        expect(result.data.armor.rating).toBe(3);
      }
    });

    it('should report no armor status', async () => {
      const { getCombatReadiness } = await import('../../../src/services/combat-intelligence.service.js');
      vi.mocked(getCombatReadiness).mockReturnValueOnce({
        ready: false,
        armorRating: 0,
        bestWeapon: null,
        weaponDamage: 1,
        shieldEquipped: false,
      });

      const tool = new StatusDashboardTool(mockContext);
      const result = await tool.run({ detail: 'brief' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.armor.status).toBe('none');
        expect(result.data.armor.rating).toBe(0);
      }
    });

    it('should show nearby players in full detail', async () => {
      mockBot.players = {
        'TestBot': { entity: null, username: 'TestBot' },
        'Player1': { entity: { position: { x: 10, y: 64, z: 10 } }, username: 'Player1' },
        'Player2': { entity: { position: { x: 20, y: 64, z: 20 } }, username: 'Player2' },
      };
      mockBot.username = 'TestBot';

      const tool = new StatusDashboardTool(mockContext);
      const result = await tool.run({ detail: 'full' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.nearbyPlayers).toBeDefined();
        expect(result.data.nearbyPlayers).toContain('Player1');
        expect(result.data.nearbyPlayers).toContain('Player2');
        expect(result.data.nearbyPlayers).not.toContain('TestBot');
      }
    });

    it('should show summary with no warnings', async () => {
      // Reset to good state
      mockBot.health = 20;
      mockBot.food = 20;

      const { assessThreats } = await import('../../../src/services/combat-intelligence.service.js');
      vi.mocked(assessThreats).mockReturnValueOnce({
        overallThreat: 'low',
        threats: [],
        recommendation: 'Safe',
      });

      const tool = new StatusDashboardTool(mockContext);
      const result = await tool.run({ detail: 'brief' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.summary).toContain('All clear');
      }
    });
  });

  describe('RecoverItemsTool', () => {
    it('should have correct definition', () => {
      const tool = new RecoverItemsTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('recoverItems');
      expect(definition.description).toContain('death');
      expect(definition.inputSchema.properties).toHaveProperty('action');
    });

    it('should return status when no death recorded', async () => {
      const tool = new RecoverItemsTool(mockContext);
      const result = await tool.run({ action: 'status' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect((result.data as { hasPendingRecovery: boolean }).hasPendingRecovery).toBe(false);
      }
    });

    it('should return status with pending death', async () => {
      const deathService = await import('../../../src/services/death-recovery.service.js');
      vi.mocked(deathService.getLastDeath).mockReturnValue({
        position: { x: 100, y: 64, z: -50 },
        cause: 'zombie',
        timestamp: Date.now() - 60000,
        recoveryAttempts: 1,
        recovered: false,
      });
      vi.mocked(deathService.itemsLikelyAvailable).mockReturnValue({ available: true, timeRemaining: 240000 });

      const tool = new RecoverItemsTool(mockContext);
      const result = await tool.run({ action: 'status' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { hasPendingRecovery: boolean; lastDeath?: { position: unknown } };
        expect(data.hasPendingRecovery).toBe(true);
        expect(data.lastDeath).toBeDefined();
      }
    });

    it('should return history with deaths', async () => {
      const deathService = await import('../../../src/services/death-recovery.service.js');
      vi.mocked(deathService.getDeathHistory).mockReturnValue([
        {
          position: { x: 100, y: 64, z: -50 },
          cause: 'zombie',
          timestamp: Date.now() - 120000,
          recoveryAttempts: 1,
          recovered: true,
        },
      ]);
      vi.mocked(deathService.getDeathStats).mockReturnValue({ totalDeaths: 1, recoveredCount: 1 });

      const tool = new RecoverItemsTool(mockContext);
      const result = await tool.run({ action: 'history' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { deaths: unknown[]; stats: { totalDeaths: number } };
        expect(data.deaths.length).toBe(1);
        expect(data.stats.totalDeaths).toBe(1);
      }
    });

    it('should handle recover action with no death', async () => {
      const deathService = await import('../../../src/services/death-recovery.service.js');
      vi.mocked(deathService.getLastDeath).mockReturnValue(null);

      const tool = new RecoverItemsTool(mockContext);
      const result = await tool.run({ action: 'recover' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect((result.data as { message: string }).message).toContain('No pending death');
      }
    });

    it('should handle recover action when items despawned', async () => {
      const deathService = await import('../../../src/services/death-recovery.service.js');
      vi.mocked(deathService.getLastDeath).mockReturnValue({
        position: { x: 100, y: 64, z: -50 },
        cause: 'creeper',
        timestamp: Date.now() - 400000, // More than 5 minutes ago
        recoveryAttempts: 0,
        recovered: false,
      });
      vi.mocked(deathService.itemsLikelyAvailable).mockReturnValue({ available: false, timeRemaining: 0 });

      const tool = new RecoverItemsTool(mockContext);
      const result = await tool.run({ action: 'recover' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { success: boolean; message: string };
        expect(data.success).toBe(false);
        expect(data.message).toContain('despawned');
      }
    });

    it('should handle recover action when max attempts exceeded', async () => {
      const deathService = await import('../../../src/services/death-recovery.service.js');
      vi.mocked(deathService.getLastDeath).mockReturnValue({
        position: { x: 100, y: 64, z: -50 },
        cause: 'skeleton',
        timestamp: Date.now() - 60000,
        recoveryAttempts: 5,
        recovered: false,
      });
      vi.mocked(deathService.itemsLikelyAvailable).mockReturnValue({ available: true, timeRemaining: 240000 });

      const tool = new RecoverItemsTool(mockContext);
      const result = await tool.run({ action: 'recover', maxAttempts: 3 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { success: boolean; message: string };
        expect(data.success).toBe(false);
        expect(data.message).toContain('Maximum recovery attempts');
      }
    });

    it('should mark recovered successfully', async () => {
      const deathService = await import('../../../src/services/death-recovery.service.js');
      vi.mocked(deathService.markRecovered).mockReturnValue(true);

      const tool = new RecoverItemsTool(mockContext);
      const result = await tool.run({ action: 'mark_recovered' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { success: boolean; message: string };
        expect(data.success).toBe(true);
        expect(data.message).toContain('marked as recovered');
      }
    });

    it('should handle mark_recovered when no death pending', async () => {
      const deathService = await import('../../../src/services/death-recovery.service.js');
      vi.mocked(deathService.markRecovered).mockReturnValue(false);

      const tool = new RecoverItemsTool(mockContext);
      const result = await tool.run({ action: 'mark_recovered' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { success: boolean; message: string };
        expect(data.success).toBe(false);
        expect(data.message).toContain('No pending death');
      }
    });

    it('should recover items successfully', async () => {
      const deathService = await import('../../../src/services/death-recovery.service.js');
      vi.mocked(deathService.getLastDeath).mockReturnValue({
        position: { x: 100, y: 64, z: -50 },
        cause: 'zombie',
        timestamp: Date.now() - 60000,
        recoveryAttempts: 0,
        recovered: false,
      });
      vi.mocked(deathService.itemsLikelyAvailable).mockReturnValue({ available: true, timeRemaining: 240000 });
      vi.mocked(deathService.incrementRecoveryAttempts).mockReturnValue(1);
      vi.mocked(deathService.markRecovered).mockReturnValue(true);

      // Set up bot with pathfinder and inventory
      mockBot.inventory = {
        items: vi.fn()
          .mockReturnValueOnce([]) // Before pickup
          .mockReturnValue([{ name: 'diamond', count: 5 }]), // After pickup
      };
      mockBot.entities = {}; // No nearby item entities

      const tool = new RecoverItemsTool(mockContext);
      const result = await tool.run({ action: 'recover' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { success: boolean };
        expect(data.success).toBe(true);
      }
    });

    it('should handle pathfinder not available', async () => {
      const deathService = await import('../../../src/services/death-recovery.service.js');
      vi.mocked(deathService.getLastDeath).mockReturnValue({
        position: { x: 100, y: 64, z: -50 },
        cause: 'lava',
        timestamp: Date.now() - 30000,
        recoveryAttempts: 0,
        recovered: false,
      });
      vi.mocked(deathService.itemsLikelyAvailable).mockReturnValue({ available: true, timeRemaining: 270000 });
      vi.mocked(deathService.incrementRecoveryAttempts).mockReturnValue(1);

      // Remove pathfinder from bot
      const botWithoutPathfinder = { ...mockBot, pathfinder: undefined };
      mockContext.getBotOrThrow = vi.fn().mockReturnValue(botWithoutPathfinder);

      const tool = new RecoverItemsTool(mockContext);
      const result = await tool.run({ action: 'recover' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { success: boolean; message: string };
        expect(data.success).toBe(false);
        expect(data.message).toContain('pathfinder not available');
      }
    });

    it('should be in utility category', () => {
      const tool = new RecoverItemsTool(mockContext);
      expect(tool.category).toBe('utility');
    });

    it('should handle navigation error during recovery', async () => {
      const deathService = await import('../../../src/services/death-recovery.service.js');
      vi.mocked(deathService.getLastDeath).mockReturnValue({
        position: { x: 100, y: 64, z: -50 },
        cause: 'fall',
        timestamp: Date.now() - 60000,
        recoveryAttempts: 0,
        recovered: false,
      });
      vi.mocked(deathService.itemsLikelyAvailable).mockReturnValue({ available: true, timeRemaining: 200000 });
      vi.mocked(deathService.incrementRecoveryAttempts).mockReturnValue(1);

      // Make pathfinder.goto throw an error
      mockBot.pathfinder = {
        goto: vi.fn().mockRejectedValue(new Error('Path blocked by obstacle')),
        setGoal: vi.fn(),
        setMovements: vi.fn(),
      };
      mockContext.getBotOrThrow = vi.fn().mockReturnValue(mockBot);

      const tool = new RecoverItemsTool(mockContext);
      const result = await tool.run({ action: 'recover' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { success: boolean; message: string };
        expect(data.success).toBe(false);
        expect(data.message).toContain('Recovery failed');
        expect(data.message).toContain('Path blocked');
      }
    });

    it('should format time as hours for old deaths', async () => {
      const deathService = await import('../../../src/services/death-recovery.service.js');
      // Death from 2 hours ago
      vi.mocked(deathService.getLastDeath).mockReturnValue({
        position: { x: 100, y: 64, z: -50 },
        cause: 'lava',
        timestamp: Date.now() - (2 * 60 * 60 * 1000), // 2 hours ago
        recoveryAttempts: 0,
        recovered: false,
      });
      vi.mocked(deathService.itemsLikelyAvailable).mockReturnValue({ available: false, timeRemaining: 0 });

      const tool = new RecoverItemsTool(mockContext);
      const result = await tool.run({ action: 'status' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { lastDeath?: { timeAgo: string } };
        expect(data.lastDeath?.timeAgo).toContain('h ago');
      }
    });

    it('should handle status with zero time remaining', async () => {
      const deathService = await import('../../../src/services/death-recovery.service.js');
      vi.mocked(deathService.getLastDeath).mockReturnValue({
        position: { x: 100, y: 64, z: -50 },
        cause: 'creeper',
        timestamp: Date.now() - 60000,
        recoveryAttempts: 0,
        recovered: false,
      });
      vi.mocked(deathService.itemsLikelyAvailable).mockReturnValue({ available: false, timeRemaining: 0 });

      const tool = new RecoverItemsTool(mockContext);
      const result = await tool.run({ action: 'status' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { hasPendingRecovery: boolean; timeRemaining?: string };
        expect(data.hasPendingRecovery).toBe(true);
        expect(data.timeRemaining).toBeUndefined();
      }
    });

    it('should collect nearby item entities during recovery', async () => {
      const deathService = await import('../../../src/services/death-recovery.service.js');
      vi.mocked(deathService.getLastDeath).mockReturnValue({
        position: { x: 100, y: 64, z: -50 },
        cause: 'zombie',
        timestamp: Date.now() - 60000,
        recoveryAttempts: 0,
        recovered: false,
      });
      vi.mocked(deathService.itemsLikelyAvailable).mockReturnValue({ available: true, timeRemaining: 240000 });
      vi.mocked(deathService.incrementRecoveryAttempts).mockReturnValue(1);
      vi.mocked(deathService.markRecovered).mockReturnValue(true);

      // Mock nearby item entity with proper distance calculation
      const itemPosition = {
        x: 100,
        y: 64,
        z: -49,
        distanceTo: vi.fn().mockReturnValue(1), // Within 4 block range
      };
      mockBot.entities = {
        'item-1': {
          position: itemPosition,
          type: 'object',
          objectType: 'Item',
        },
      };

      // First call returns empty (before), second returns items (after pickup)
      const itemsBefore: unknown[] = [];
      const itemsAfter = [{ name: 'diamond', count: 1 }];
      mockBot.inventory = {
        items: vi.fn()
          .mockReturnValueOnce(itemsBefore)
          .mockReturnValue(itemsAfter),
      };

      const tool = new RecoverItemsTool(mockContext);
      const result = await tool.run({ action: 'recover' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { success: boolean; message: string };
        expect(data.success).toBe(true);
        // Test that it reports items collected (1 - 0 = 1)
        expect(data.message).toContain('Collected');
      }
    });
  });

  describe('GoToSurfaceTool', () => {
    it('should have correct definition', () => {
      const tool = new GoToSurfaceTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('goToSurface');
      expect(definition.description).toContain('surface');
      expect(definition.inputSchema.properties).toHaveProperty('maxMs');
    });

    it('should be in utility category', () => {
      const tool = new GoToSurfaceTool(mockContext);
      expect(tool.category).toBe('utility');
    });

    it('should return result object', async () => {
      const tool = new GoToSurfaceTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toBeDefined();
        expect(result.bot).toBe('TestBot');
      }
    });

    it('should arrive immediately when already at surface', async () => {
      // isClearToSkyAt is mocked to return true by default
      const tool = new GoToSurfaceTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.arrived).toBe(true);
      }
    });

    it('should dig through blocks above when underground', async () => {
      // Mock isClearToSkyAt to return false (underground)
      const { isClearToSkyAt } = await import('../../../src/utils/block-helpers.js');
      vi.mocked(isClearToSkyAt).mockReturnValue(false);

      // Mock blockAt to return a solid block above with position
      const mockPos = { x: 0, y: 65, z: 0, clone: () => mockPos };
      mockBot.blockAt = vi.fn().mockReturnValue({ name: 'stone', position: mockPos });

      const tool = new GoToSurfaceTool(mockContext);
      const result = await tool.run({ maxMs: 1000 });

      // Should attempt to dig or navigate
      expect(result.ok).toBe(true);
    });

    it('should dig block two above when directly above is empty', async () => {
      const { isClearToSkyAt } = await import('../../../src/utils/block-helpers.js');
      vi.mocked(isClearToSkyAt).mockReturnValue(false);

      const mockPos = { x: 0, y: 66, z: 0, clone: () => mockPos };
      // First block above is air, second is stone
      mockBot.blockAt = vi.fn()
        .mockReturnValueOnce({ name: 'air' })
        .mockReturnValueOnce({ name: 'stone', position: mockPos });

      const tool = new GoToSurfaceTool(mockContext);
      const result = await tool.run({ maxMs: 1000 });

      expect(result.ok).toBe(true);
    });

    it('should respect timeout', async () => {
      // Reset isClearToSkyAt to return true (at surface)
      const { isClearToSkyAt } = await import('../../../src/utils/block-helpers.js');
      vi.mocked(isClearToSkyAt).mockReturnValue(true);

      const tool = new GoToSurfaceTool(mockContext);
      const result = await tool.run({ maxMs: 100 });

      expect(result.ok).toBe(true);
    });

    it('should use pathfinder to move upward', async () => {
      const { isClearToSkyAt } = await import('../../../src/utils/block-helpers.js');
      vi.mocked(isClearToSkyAt).mockReturnValue(false);

      // Mock blocks as air with empty boundingBox to trigger pathfinder usage
      mockBot.blockAt = vi.fn().mockReturnValue({ name: 'air', boundingBox: 'empty' });

      const tool = new GoToSurfaceTool(mockContext);
      await tool.run({ maxMs: 1000 });

      // Pathfinder should have been configured
      expect(mockBot.pathfinder.setMovements).toHaveBeenCalled();
    });

    it('should call digBlockWithTimeout for solid blocks above', async () => {
      const { isClearToSkyAt } = await import('../../../src/utils/block-helpers.js');
      const { digBlockWithTimeout } = await import('../../../src/utils/mining-helpers.js');

      // First iteration: underground, then at surface
      let callCount = 0;
      vi.mocked(isClearToSkyAt).mockImplementation(() => {
        callCount++;
        return callCount > 1; // Surface after first dig
      });

      // Block above has solid bounding box with position
      const mockPos = { x: 0, y: 65, z: 0, clone: () => mockPos };
      mockBot.blockAt = vi.fn().mockReturnValue({ name: 'stone', boundingBox: 'block', position: mockPos });

      const tool = new GoToSurfaceTool(mockContext);
      const result = await tool.run({ maxMs: 5000 });

      expect(result.ok).toBe(true);
      expect(digBlockWithTimeout).toHaveBeenCalled();
    });

    it('should dig two blocks above when one above is empty', async () => {
      const { isClearToSkyAt } = await import('../../../src/utils/block-helpers.js');
      const { digBlockWithTimeout } = await import('../../../src/utils/mining-helpers.js');

      let callCount = 0;
      vi.mocked(isClearToSkyAt).mockImplementation(() => {
        callCount++;
        return callCount > 1;
      });

      // First block above is empty, second is solid
      mockBot.blockAt = vi.fn()
        .mockImplementation((pos: { y: number }) => {
          // y+1 is empty, y+2 is solid
          const baseY = mockBot.entity.position.y;
          const mockPos = { x: 0, y: pos.y, z: 0, clone: () => mockPos };
          if (pos.y === baseY + 1) {
            return { name: 'air', boundingBox: 'empty', position: mockPos };
          }
          return { name: 'stone', boundingBox: 'block', position: mockPos };
        });

      const tool = new GoToSurfaceTool(mockContext);
      const result = await tool.run({ maxMs: 5000 });

      expect(result.ok).toBe(true);
      expect(digBlockWithTimeout).toHaveBeenCalled();
    });

    it('should continue while defense is active even after timeout', async () => {
      const { isClearToSkyAt } = await import('../../../src/utils/block-helpers.js');

      // Eventually reach surface after defense ends
      let iterCount = 0;
      vi.mocked(isClearToSkyAt).mockImplementation(() => {
        iterCount++;
        return iterCount > 3;
      });

      // Set defense active flag
      (mockBot as { __defenseActive?: boolean }).__defenseActive = true;

      mockBot.blockAt = vi.fn().mockReturnValue({ name: 'air', boundingBox: 'empty' });

      const tool = new GoToSurfaceTool(mockContext);
      // Very short timeout but defense active should keep it going
      const result = await tool.run({ maxMs: 10 });

      expect(result.ok).toBe(true);

      // Clean up
      (mockBot as { __defenseActive?: boolean }).__defenseActive = false;
    });

    it('should return arrived=false when timeout exceeded', async () => {
      const { isClearToSkyAt } = await import('../../../src/utils/block-helpers.js');
      vi.mocked(isClearToSkyAt).mockReturnValue(false);

      // Mock blocks as empty to force pathfinder path (fast loop)
      mockBot.blockAt = vi.fn().mockReturnValue({ name: 'air', boundingBox: 'empty' });

      const tool = new GoToSurfaceTool(mockContext);
      const result = await tool.run({ maxMs: 50 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.arrived).toBe(false);
      }
    });

    it('should have maxMs with default value in schema', () => {
      const tool = new GoToSurfaceTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.inputSchema.properties?.maxMs?.default).toBe(120000);
    });

    it('should skip null blocks', async () => {
      const { isClearToSkyAt } = await import('../../../src/utils/block-helpers.js');

      let callCount = 0;
      vi.mocked(isClearToSkyAt).mockImplementation(() => {
        callCount++;
        return callCount > 1;
      });

      // Return null for blocks
      mockBot.blockAt = vi.fn().mockReturnValue(null);

      const tool = new GoToSurfaceTool(mockContext);
      const result = await tool.run({ maxMs: 100 });

      expect(result.ok).toBe(true);
      // Should still use pathfinder when no blocks found
      expect(mockBot.pathfinder.setMovements).toHaveBeenCalled();
    });
  });


  describe('PickupItemTool', () => {
    it('should have correct definition', () => {
      const tool = new PickupItemTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('pickupItem');
      expect(definition.inputSchema.properties).toHaveProperty('itemName');
      expect(definition.inputSchema.properties).toHaveProperty('maxMs');
    });

    it('should be in utility category', () => {
      const tool = new PickupItemTool(mockContext);
      expect(tool.category).toBe('utility');
    });

    it('should return error if no items nearby', async () => {
      mockBot.nearestEntity = vi.fn().mockReturnValue(null);
      const tool = new PickupItemTool(mockContext);
      const result = await tool.run({});
      expect(result.ok).toBe(false);
    });

    it('should successfully pick up item when entity disappears', async () => {
      const droppedItem = {
        id: 123,
        type: 'object',
        displayName: 'diamond',
        position: { x: 101, y: 64, z: -50 },
      };

      let callCount = 0;
      mockBot.nearestEntity = vi.fn().mockImplementation(() => {
        callCount++;
        return callCount <= 1 ? droppedItem : null;
      });

      const tool = new PickupItemTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.pickedUp).toBe(true);
      }
    });

    it('should timeout when item cannot be reached', async () => {
      const droppedItem = {
        id: 456,
        type: 'object',
        displayName: 'gold_ingot',
        position: { x: 101, y: 64, z: -50 },
      };

      mockBot.nearestEntity = vi.fn().mockReturnValue(droppedItem);

      const tool = new PickupItemTool(mockContext);
      const result = await tool.run({ maxMs: 50 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.timedOut).toBe(true);
        expect(result.data.pickedUp).toBe(false);
      }
    });
  });

  describe('PickupLootTool', () => {
    it('should have correct definition', () => {
      const tool = new PickupLootTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('pickupLootWithinRadius');
      expect(definition.inputSchema.properties).toHaveProperty('radius');
      expect(definition.inputSchema.properties).toHaveProperty('maxMs');
    });

    it('should be in utility category', () => {
      const tool = new PickupLootTool(mockContext);
      expect(tool.category).toBe('utility');
    });

    it('should return zero items when no loot nearby', async () => {
      mockBot.nearestEntity = vi.fn().mockReturnValue(null);
      const tool = new PickupLootTool(mockContext);
      const result = await tool.run({});
      expect(result).toHaveProperty('ok');
      if (result.ok) {
        expect(result.data.pickedUp).toBe(0);
      }
    });

    it('should pick up items when found nearby', async () => {
      const itemEntity = {
        type: 'object',
        position: {
          x: 5,
          y: 64,
          z: 5,
          distanceTo: vi.fn().mockReturnValue(3),
        },
      };
      mockBot.nearestEntity = vi
        .fn()
        .mockReturnValueOnce(itemEntity)
        .mockReturnValueOnce(null);

      const tool = new PickupLootTool(mockContext);
      const result = await tool.run({ radius: 8 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.pickedUp).toBe(1);
      }
      expect(mockBot.pathfinder.setGoal).toHaveBeenCalled();
    });

    it('should invoke filter callback for entity filtering', async () => {
      // Set up entities that the filter will be applied to
      const validItem = {
        name: 'item', // Valid item name
        type: 'object',
        position: {
          x: 102,
          y: 64,
          z: -48,
          distanceTo: vi.fn().mockReturnValue(3),
        },
      };
      const invalidTypeEntity = {
        name: 'zombie', // Not an item
        type: 'mob',
        position: {
          x: 101,
          y: 64,
          z: -50,
          distanceTo: vi.fn().mockReturnValue(1),
        },
      };
      const tooFarEntity = {
        name: 'item',
        type: 'object',
        position: {
          x: 200,
          y: 64,
          z: 100,
          distanceTo: vi.fn().mockReturnValue(150), // Way outside radius
        },
      };
      const noPositionEntity = {
        name: 'item',
        type: 'object',
        position: null,
      };

      // Mock nearestEntity to invoke the filter callback
      let filterCallback: ((e: unknown) => boolean) | undefined;
      mockBot.nearestEntity = vi.fn().mockImplementation((filter: (e: unknown) => boolean) => {
        filterCallback = filter;
        // First call returns valid item, second returns null
        if (!mockBot.nearestEntity.mock.results.length) {
          return filter(validItem) ? validItem : null;
        }
        return null;
      });

      const tool = new PickupLootTool(mockContext);
      const result = await tool.run({ radius: 8 });

      expect(result.ok).toBe(true);

      // Verify the filter callback was set
      expect(filterCallback).toBeDefined();

      // Test the filter callback with different entities
      if (filterCallback) {
        expect(filterCallback(validItem)).toBe(true); // name: 'item', has position, within radius
        expect(filterCallback(invalidTypeEntity)).toBeFalsy(); // Wrong name/type
        expect(filterCallback(tooFarEntity)).toBeFalsy(); // Too far away
        expect(filterCallback(noPositionEntity)).toBeFalsy(); // No position
      }
    });
  });

  describe('SleepInBedTool', () => {
    it('should have correct definition', () => {
      const tool = new SleepInBedTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('sleepInNearbyBed');
      expect(definition.inputSchema.properties).toHaveProperty('setSpawnIfDay');
    });

    it('should be in utility category', () => {
      const tool = new SleepInBedTool(mockContext);
      expect(tool.category).toBe('utility');
    });

    it('should return error when no bed found', async () => {
      mockBot.findBlock = vi.fn().mockReturnValue(null);
      const { pathfindToPredicate } = await import('../../../src/services/navigation.service.js');
      vi.mocked(pathfindToPredicate).mockRejectedValueOnce(new Error('No bed found'));

      const tool = new SleepInBedTool(mockContext);
      const result = await tool.run({});
      expect(result.ok).toBe(false);
    });

    it('should sleep in bed at night', async () => {
      const { pathfindToPredicate } = await import('../../../src/services/navigation.service.js');
      const bedBlock = { name: 'red_bed', position: { x: 100, y: 64, z: -50 } };
      vi.mocked(pathfindToPredicate).mockResolvedValueOnce(bedBlock as any);
      mockBot.sleep = vi.fn().mockResolvedValue(undefined);
      mockBot.time = { timeOfDay: 13000 };

      const tool = new SleepInBedTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.action).toBe('slept');
      }
      expect(mockBot.sleep).toHaveBeenCalledWith(bedBlock);
    });

    it('should set spawn during daytime when setSpawnIfDay is true', async () => {
      const { pathfindToPredicate } = await import('../../../src/services/navigation.service.js');
      const bedBlock = { name: 'red_bed', position: { x: 100, y: 64, z: -50 } };
      vi.mocked(pathfindToPredicate).mockResolvedValueOnce(bedBlock as any);
      mockBot.activateBlock = vi.fn().mockResolvedValue(undefined);
      mockBot.time = { timeOfDay: 6000 };

      const tool = new SleepInBedTool(mockContext);
      const result = await tool.run({ setSpawnIfDay: true });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.action).toBe('set_spawn');
      }
      expect(mockBot.activateBlock).toHaveBeenCalledWith(bedBlock);
    });
  });

  describe('StopAllTasksTool', () => {
    it('should have correct definition', () => {
      const tool = new StopAllTasksTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('stopAllTasks');
      expect(definition.inputSchema.properties).toHaveProperty('stopAll');
    });

    it('should be in utility category', () => {
      const tool = new StopAllTasksTool(mockContext);
      expect(tool.category).toBe('utility');
    });

    it('should stop tasks for a single bot', async () => {
      const tool = new StopAllTasksTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
    });

    it('should stop tasks for all bots when stopAll is true', async () => {
      const tool = new StopAllTasksTool(mockContext);
      const result = await tool.run({ stopAll: true });

      expect(result.ok).toBe(true);
    });

    it('should call task.abort when task has abort function', async () => {
      const abortFn = vi.fn();
      const taskState = { running: true, abort: abortFn };
      (mockBot as unknown as { __task: typeof taskState }).__task = taskState;

      const tool = new StopAllTasksTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      expect(abortFn).toHaveBeenCalled();
      expect(taskState.running).toBe(false);
      expect(taskState.abort).toBeNull();
    });

    it('should handle task.abort throwing an error', async () => {
      const abortFn = vi.fn().mockImplementation(() => {
        throw new Error('Abort failed');
      });
      const taskState = { running: true, abort: abortFn };
      (mockBot as unknown as { __task: typeof taskState }).__task = taskState;

      const tool = new StopAllTasksTool(mockContext);
      const result = await tool.run({});

      // Should not throw, should still succeed
      expect(result.ok).toBe(true);
      expect(abortFn).toHaveBeenCalled();
      // Task state should still be reset
      expect(taskState.running).toBe(false);
      expect(taskState.abort).toBeNull();
    });

    it('should reset task state even without abort function', async () => {
      const taskState = { running: true, abort: null };
      (mockBot as unknown as { __task: typeof taskState }).__task = taskState;

      const tool = new StopAllTasksTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      expect(taskState.running).toBe(false);
    });
  });
});
