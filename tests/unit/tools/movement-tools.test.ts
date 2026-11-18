/**
 * Tests for movement tools (go-to-location, follow-player, run-away, etc.)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ToolContext } from '../../../src/tools/base-tool.js';
import { GoToLocationTool } from '../../../src/tools/movement/go-to-location.js';
import { JumpTool } from '../../../src/tools/movement/jump.js';
import { MoveDirectionTool } from '../../../src/tools/movement/move-direction.js';
import { RunAwayTool } from '../../../src/tools/movement/run-away.js';

// Mock navigation service
vi.mock('../../../src/services/navigation.service.js', () => ({
  configureMovements: vi.fn(() => ({})),
  attemptUnstuck: vi.fn().mockResolvedValue(undefined),
}));

// Mock pathfinder
vi.mock('mineflayer-pathfinder', () => ({
  default: {
    goals: {
      GoalNear: class GoalNear {
        constructor(public x: number, public y: number, public z: number, public range: number) {}
      },
      GoalInvert: class GoalInvert {
        constructor(public goal: unknown) {}
      },
    },
  },
  goals: {
    GoalNear: class GoalNear {
      constructor(public x: number, public y: number, public z: number, public range: number) {}
    },
    GoalInvert: class GoalInvert {
      constructor(public goal: unknown) {}
    },
  },
}));

describe('Movement Tools', () => {
  let mockContext: ToolContext;
  let mockBot: ReturnType<typeof createMockBot>;

  // Mock Vec3 class for position operations
  class MockVec3 {
    constructor(public x: number, public y: number, public z: number) {}
    floored() { return new MockVec3(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z)); }
    offset(dx: number, dy: number, dz: number) { return new MockVec3(this.x + dx, this.y + dy, this.z + dz); }
    clone() { return new MockVec3(this.x, this.y, this.z); }
    minus(other: { x: number; y: number; z: number }) { return new MockVec3(this.x - other.x, this.y - other.y, this.z - other.z); }
    plus(other: { x: number; y: number; z: number }) { return new MockVec3(this.x + other.x, this.y + other.y, this.z + other.z); }
    normalize() {
      const len = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
      return len > 0 ? new MockVec3(this.x / len, this.y / len, this.z / len) : new MockVec3(0, 0, 0);
    }
    scaled(factor: number) { return new MockVec3(this.x * factor, this.y * factor, this.z * factor); }
    distanceTo(other: { x: number; y: number; z: number }) {
      const dx = this.x - other.x;
      const dy = this.y - other.y;
      const dz = this.z - other.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
  }

  function createMockBot() {
    const position = new MockVec3(100, 64, -50);

    const threatEntity = {
      type: 'mob',
      name: 'zombie',
      position: new MockVec3(105, 64, -50),
    };

    return {
      username: 'TestBot',
      version: '1.20.1',
      health: 20,
      food: 20,
      foodSaturation: 5,
      entity: { position, onGround: true, velocity: { x: 0, y: 0, z: 0 } },
      inventory: { items: () => [] },
      oxygenLevel: 20,
      time: { timeOfDay: 6000 },
      blockAt: vi.fn().mockReturnValue({ name: 'grass_block' }),
      game: { gameMode: 0 },
      setControlState: vi.fn(),
      waitForTicks: vi.fn().mockImplementation(async () => {
        // Simulate moving closer to target
        position.x += 1;
      }),
      nearestEntity: vi.fn().mockReturnValue(threatEntity),
      pathfinder: {
        goto: vi.fn().mockResolvedValue(undefined),
        setMovements: vi.fn(),
        setGoal: vi.fn(),
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

  describe('GoToLocationTool', () => {
    it('should have correct definition', () => {
      const tool = new GoToLocationTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('goToKnownLocation');
      expect(definition.description).toContain('Navigate');
      expect(definition.inputSchema.properties).toHaveProperty('x');
      expect(definition.inputSchema.properties).toHaveProperty('y');
      expect(definition.inputSchema.properties).toHaveProperty('z');
      expect(definition.inputSchema.properties).toHaveProperty('range');
      expect(definition.inputSchema.properties).toHaveProperty('maxMs');
    });

    it('should navigate to coordinates', async () => {
      // Mock being at target location
      mockBot.waitForTicks = vi.fn().mockImplementation(async () => {
        mockBot.entity.position.x = 105;
        mockBot.entity.position.y = 64;
        mockBot.entity.position.z = -50;
      });

      const tool = new GoToLocationTool(mockContext);
      const result = await tool.run({ x: 105, y: 64, z: -50 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.arrived).toBe(true);
        expect(result.data.distance).toBeDefined();
      }
    });

    it('should respect range parameter', async () => {
      mockBot.waitForTicks = vi.fn().mockImplementation(async () => {
        mockBot.entity.position.x = 103;
      });

      const tool = new GoToLocationTool(mockContext);
      const result = await tool.run({ x: 105, y: 64, z: -50, range: 3 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.arrived).toBe(true);
      }
    });

    it('should timeout when destination unreachable', async () => {
      // Never get closer
      mockBot.waitForTicks = vi.fn().mockResolvedValue(undefined);

      const tool = new GoToLocationTool(mockContext);
      const result = await tool.run({ x: 1000, y: 64, z: 1000, maxMs: 100 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.timedOut).toBe(true);
        expect(result.data.arrived).toBe(false);
      }
    });

    it('should reject missing coordinates', async () => {
      const tool = new GoToLocationTool(mockContext);
      const result = await tool.run({ x: 100 });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });
  });

  describe('JumpTool', () => {
    it('should have correct definition', () => {
      const tool = new JumpTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('jump');
      expect(definition.description).toContain('jump');
      expect(definition.inputSchema.properties).toHaveProperty('duration');
    });

    it('should make bot jump', async () => {
      const tool = new JumpTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      expect(mockBot.setControlState).toHaveBeenCalledWith('jump', true);
    });

    it('should respect duration parameter', async () => {
      const tool = new JumpTool(mockContext);
      const result = await tool.run({ duration: 1000 });

      expect(result.ok).toBe(true);
    });
  });

  describe('MoveDirectionTool', () => {
    it('should have correct definition', () => {
      const tool = new MoveDirectionTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('moveInDirection');
      expect(definition.description).toContain('Move');
      expect(definition.inputSchema.properties).toHaveProperty('direction');
      expect(definition.inputSchema.properties).toHaveProperty('durationMs');
    });

    it('should move forward', async () => {
      const tool = new MoveDirectionTool(mockContext);
      const result = await tool.run({ direction: 'forward' });

      expect(result.ok).toBe(true);
      expect(mockBot.setControlState).toHaveBeenCalledWith('forward', true);
    });

    it('should move backward', async () => {
      const tool = new MoveDirectionTool(mockContext);
      const result = await tool.run({ direction: 'back' });

      expect(result.ok).toBe(true);
      expect(mockBot.setControlState).toHaveBeenCalledWith('back', true);
    });

    it('should sprint when requested', async () => {
      const tool = new MoveDirectionTool(mockContext);
      const result = await tool.run({ direction: 'sprint' });

      expect(result.ok).toBe(true);
      expect(mockBot.setControlState).toHaveBeenCalledWith('sprint', true);
    });

    it('should reject invalid direction', async () => {
      const tool = new MoveDirectionTool(mockContext);
      const result = await tool.run({ direction: 'invalid' });

      expect(result.ok).toBe(false);
    });
  });

  describe('RunAwayTool', () => {
    it('should have correct definition', () => {
      const tool = new RunAwayTool(mockContext);
      const definition = tool.getDefinition();

      expect(definition.name).toBe('runAway');
      expect(definition.description).toContain('Run');
      expect(definition.inputSchema.properties).toHaveProperty('distance');
    });

    it('should run away from current position', async () => {
      const tool = new RunAwayTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
    });

    it('should respect distance parameter', async () => {
      const tool = new RunAwayTool(mockContext);
      const result = await tool.run({ distance: 32 });

      expect(result.ok).toBe(true);
    });
  });

  describe('Movement Tool Integration', () => {
    it('should all be in movement category', () => {
      const goToTool = new GoToLocationTool(mockContext);
      const jumpTool = new JumpTool(mockContext);
      const moveTool = new MoveDirectionTool(mockContext);
      const runTool = new RunAwayTool(mockContext);

      expect(goToTool.category).toBe('movement');
      expect(jumpTool.category).toBe('movement');
      expect(moveTool.category).toBe('movement');
      expect(runTool.category).toBe('movement');
    });

    it('should provide consistent status tracking', async () => {
      const tool = new JumpTool(mockContext);
      const result = await tool.run({});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.status).toBeDefined();
        expect(result.bot).toBe('TestBot');
      }
    });
  });
});
