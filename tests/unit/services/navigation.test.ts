/**
 * Navigation Service Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Vec3 } from 'vec3';

// Mock the pathfinder module
vi.mock('mineflayer-pathfinder', () => ({
  default: {
    // `function` (not arrow) implementations: the source calls these with `new`,
    // and Vitest 4+ rejects `new` on arrow-function mock implementations.
    Movements: vi.fn().mockImplementation(function () {
      return {
        allowParkour: false,
        allowSprinting: true,
        canDig: true,
        maxDropDown: 3,
        liquidCost: 25,
      };
    }),
    goals: {
      GoalNear: vi.fn().mockImplementation(function (x, y, z, range) {
        return { x, y, z, range };
      }),
      GoalFollow: vi.fn().mockImplementation(function (entity, distance) {
        return { entity, distance };
      }),
    },
  },
}));

// Mock mining helpers
vi.mock('../../../src/utils/mining-helpers.js', () => ({
  pickupNearbyDrops: vi.fn().mockResolvedValue(0),
}));

// Mock equipment service
vi.mock('../../../src/services/equipment.service.js', () => ({
  createEquipmentService: vi.fn(() => ({
    equipBestToolForBlock: vi.fn().mockResolvedValue(undefined),
  })),
}));

import {
  configureMovements,
  waitForNavigation,
  createNavigationService,
  attemptUnstuck,
  pathfindToPredicate,
  NavigationService,
} from '../../../src/services/navigation.service.js';

describe('NavigationService', () => {
  describe('configureMovements', () => {
    it('should create movements with default config', () => {
      const mockBot = {
        version: '1.20.1',
      } as any;

      const movements = configureMovements(mockBot);

      expect(movements).toBeDefined();
      expect(movements.allowSprinting).toBe(true);
      expect(movements.allowParkour).toBe(false);
      expect(movements.canDig).toBe(true);
    });

    it('should override defaults with provided config', () => {
      const mockBot = {
        version: '1.20.1',
      } as any;

      const movements = configureMovements(mockBot, {
        allowParkour: true,
        allowSprinting: false,
        canDig: false,
      });

      expect(movements.allowParkour).toBe(true);
      expect(movements.allowSprinting).toBe(false);
      expect(movements.canDig).toBe(false);
    });
  });

  describe('waitForNavigation', () => {
    let mockBot: any;

    beforeEach(() => {
      let callCount = 0;
      mockBot = {
        entity: {
          position: new Vec3(0, 64, 0),
        },
        waitForTicks: vi.fn().mockImplementation(async () => {
          // Simulate movement toward target
          callCount++;
          if (callCount >= 3) {
            mockBot.entity.position = new Vec3(10, 64, 10);
          }
        }),
      };
    });

    it('should return true when arrived within distance', async () => {
      mockBot.entity.position = new Vec3(10, 64, 10);

      const target = new Vec3(10, 64, 10);
      const result = await waitForNavigation(mockBot, target, {
        timeoutMs: 1000,
        arrivedDistance: 2.5,
      });

      expect(result).toBe(true);
    });

    it('should return false on timeout', async () => {
      mockBot.entity.position = new Vec3(0, 64, 0);
      mockBot.waitForTicks = vi.fn().mockResolvedValue(undefined);

      const target = new Vec3(100, 64, 100);
      const result = await waitForNavigation(mockBot, target, {
        timeoutMs: 50,
        arrivedDistance: 2.5,
        tickInterval: 1,
      });

      expect(result).toBe(false);
    });

    it('should accept plain object as target position', async () => {
      mockBot.entity.position = new Vec3(5, 64, 5);

      const target = { x: 5, y: 64, z: 5 };
      const result = await waitForNavigation(mockBot, target, {
        timeoutMs: 1000,
        arrivedDistance: 2.5,
      });

      expect(result).toBe(true);
    });

    it('should use default options when not provided', async () => {
      mockBot.entity.position = new Vec3(0, 64, 0);

      const target = new Vec3(0, 64, 0);
      const result = await waitForNavigation(mockBot, target);

      expect(result).toBe(true);
    });
  });

  describe('NavigationService', () => {
    it('should create service with default config', () => {
      const service = createNavigationService();
      const config = service.getConfig();

      expect(config.allowParkour).toBe(false);
      expect(config.allowSprinting).toBe(true);
      expect(config.canDig).toBe(true);
      expect(config.maxDropDown).toBe(3);
      expect(config.unstuckTimeoutMs).toBe(15000);
    });

    it('should create service with custom config', () => {
      const service = createNavigationService({
        allowParkour: true,
        maxDropDown: 5,
      });
      const config = service.getConfig();

      expect(config.allowParkour).toBe(true);
      expect(config.maxDropDown).toBe(5);
    });

    it('should update config via setConfig', () => {
      const service = createNavigationService();
      service.setConfig({ allowSprinting: false });

      const config = service.getConfig();
      expect(config.allowSprinting).toBe(false);
      expect(config.allowParkour).toBe(false); // Unchanged
    });

    it('should stop following', () => {
      const mockBot = {
        pathfinder: {
          stop: vi.fn(),
        },
      } as any;

      const service = createNavigationService();
      service.stopFollow(mockBot);

      expect(mockBot.pathfinder.stop).toHaveBeenCalled();
    });
  });

  describe('attemptUnstuck', () => {
    it('should attempt to unstick bot with movement and jump', async () => {
      const mockBot = {
        entity: {
          position: {
            offset: vi.fn().mockReturnValue({
              floored: vi.fn().mockReturnValue(new Vec3(0, 65, 0)),
            }),
          },
        },
        setControlState: vi.fn(),
        blockAt: vi.fn().mockReturnValue(null),
        dig: vi.fn(),
      } as any;

      const result = await attemptUnstuck(mockBot);

      expect(result).toBe(true);
      expect(mockBot.setControlState).toHaveBeenCalled();
    });

    it('should break solid block above head', async () => {
      const blockPos = new Vec3(0, 66, 0);
      const mockBot = {
        entity: {
          position: {
            offset: vi.fn().mockReturnValue({
              floored: vi.fn().mockReturnValue(new Vec3(0, 65, 0)),
            }),
          },
        },
        setControlState: vi.fn(),
        blockAt: vi.fn().mockReturnValue({
          name: 'stone',
          boundingBox: 'block',
          position: { ...blockPos, clone: () => blockPos },
        }),
        dig: vi.fn().mockResolvedValue(undefined),
      } as any;

      const result = await attemptUnstuck(mockBot);

      expect(result).toBe(true);
      expect(mockBot.dig).toHaveBeenCalled();
    });

    it('should not break liquid blocks', async () => {
      const mockBot = {
        entity: {
          position: {
            offset: vi.fn().mockReturnValue({
              floored: vi.fn().mockReturnValue(new Vec3(0, 65, 0)),
            }),
          },
        },
        setControlState: vi.fn(),
        blockAt: vi.fn().mockReturnValue({
          name: 'water',
          boundingBox: 'block',
        }),
        dig: vi.fn(),
      } as any;

      const result = await attemptUnstuck(mockBot);

      expect(result).toBe(true);
      expect(mockBot.dig).not.toHaveBeenCalled();
    });

    it('should handle dig errors gracefully', async () => {
      const mockBot = {
        entity: {
          position: {
            offset: vi.fn().mockReturnValue({
              floored: vi.fn().mockReturnValue(new Vec3(0, 65, 0)),
            }),
          },
        },
        setControlState: vi.fn(),
        blockAt: vi.fn().mockReturnValue({
          name: 'stone',
          boundingBox: 'block',
        }),
        dig: vi.fn().mockRejectedValue(new Error('dig failed')),
      } as any;

      const result = await attemptUnstuck(mockBot);

      expect(result).toBe(true);
    });

    it('should return false when attempt throws', async () => {
      const mockBot = {
        entity: {
          position: {
            offset: vi.fn().mockImplementation(() => {
              throw new Error('position error');
            }),
          },
        },
        setControlState: vi.fn().mockImplementation(() => {
          throw new Error('control error');
        }),
      } as any;

      const result = await attemptUnstuck(mockBot);

      expect(result).toBe(false);
    });
  });

  describe('goToPosition', () => {
    let service: NavigationService;
    let mockBot: any;

    beforeEach(() => {
      service = createNavigationService();
      mockBot = {
        entity: {
          position: new Vec3(0, 64, 0),
        },
        pathfinder: {
          setMovements: vi.fn(),
          setGoal: vi.fn(),
          stop: vi.fn(),
        },
        version: '1.20.1',
        waitForTicks: vi.fn().mockResolvedValue(undefined),
        setControlState: vi.fn(),
        blockAt: vi.fn().mockReturnValue(null),
        dig: vi.fn(),
      };
    });

    it('should arrive at target successfully', async () => {
      // Start far, then move close
      let callCount = 0;
      mockBot.waitForTicks = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount >= 2) {
          mockBot.entity.position = new Vec3(10, 64, 10);
        }
      });

      const result = await service.goToPosition(mockBot, new Vec3(10, 64, 10), {
        range: 1,
        timeout: 5000,
      });

      expect(result.success).toBe(true);
      expect(result.arrived).toBe(true);
    });

    it('should timeout when not reaching target', async () => {
      mockBot.waitForTicks = vi.fn().mockResolvedValue(undefined);
      // Position stays at 0, 64, 0

      const result = await service.goToPosition(mockBot, new Vec3(100, 64, 100), {
        range: 1,
        timeout: 100,
      });

      expect(result.success).toBe(false);
      expect(result.timedOut).toBe(true);
      expect(result.reason).toBe('timeout');
    });

    it('should abort when signal is aborted', async () => {
      const controller = new AbortController();
      let callCount = 0;

      mockBot.waitForTicks = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          controller.abort();
        }
      });

      const result = await service.goToPosition(mockBot, new Vec3(100, 64, 100), {
        range: 1,
        timeout: 5000,
        signal: controller.signal,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('aborted');
    });

    it('should use custom navigation options', async () => {
      let callCount = 0;
      mockBot.waitForTicks = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount >= 1) {
          mockBot.entity.position = new Vec3(10, 64, 10);
        }
      });

      const result = await service.goToPosition(mockBot, new Vec3(10, 64, 10), {
        range: 2,
        timeout: 5000,
        allowParkour: true,
        allowSprinting: false,
        canDig: false,
        maxDropDown: 4,
      });

      expect(result.success).toBe(true);
      expect(mockBot.pathfinder.setMovements).toHaveBeenCalled();
    });
  });

  describe('goToBlock', () => {
    let service: NavigationService;
    let mockBot: any;

    beforeEach(() => {
      service = createNavigationService();
      mockBot = {
        entity: {
          position: new Vec3(0, 64, 0),
        },
        pathfinder: {
          setMovements: vi.fn(),
          setGoal: vi.fn(),
          stop: vi.fn(),
        },
        version: '1.20.1',
        waitForTicks: vi.fn().mockResolvedValue(undefined),
        findBlock: vi.fn(),
        setControlState: vi.fn(),
        blockAt: vi.fn().mockReturnValue(null),
        dig: vi.fn(),
      };
    });

    it('should return failure when block not found', async () => {
      mockBot.findBlock = vi.fn().mockReturnValue(null);

      const result = await service.goToBlock(mockBot, (b) => b.name === 'diamond_ore');

      expect(result.success).toBe(false);
      expect(result.block).toBeNull();
    });

    it('should navigate to found block', async () => {
      const mockBlock = {
        name: 'diamond_ore',
        position: new Vec3(5, 60, 5),
      };

      mockBot.findBlock = vi.fn().mockReturnValue(mockBlock);

      // Simulate arriving at the block
      let callCount = 0;
      mockBot.waitForTicks = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount >= 2) {
          mockBot.entity.position = new Vec3(5, 60, 5);
        }
      });

      const result = await service.goToBlock(mockBot, (b) => b.name === 'diamond_ore', {
        timeout: 5000,
      });

      expect(result.success).toBe(true);
      expect(result.block).toBe(mockBlock);
    });

    it('should accept maxDistance option', async () => {
      mockBot.findBlock = vi.fn().mockReturnValue(null);

      await service.goToBlock(mockBot, (b) => b.name === 'diamond_ore', {
        maxDistance: 64,
      });

      expect(mockBot.findBlock).toHaveBeenCalledWith({
        matching: expect.any(Function),
        maxDistance: 64,
      });
    });
  });

  describe('followEntity', () => {
    let service: NavigationService;
    let mockBot: any;

    beforeEach(() => {
      service = createNavigationService();
      mockBot = {
        pathfinder: {
          setMovements: vi.fn(),
          setGoal: vi.fn(),
        },
        version: '1.20.1',
      };
    });

    it('should set follow goal for entity', async () => {
      const mockEntity = { id: 1, position: new Vec3(10, 64, 10) } as any;

      await service.followEntity(mockBot, mockEntity);

      expect(mockBot.pathfinder.setMovements).toHaveBeenCalled();
      expect(mockBot.pathfinder.setGoal).toHaveBeenCalled();
    });

    it('should use custom distance option', async () => {
      const mockEntity = { id: 1, position: new Vec3(10, 64, 10) } as any;

      await service.followEntity(mockBot, mockEntity, { distance: 5 });

      expect(mockBot.pathfinder.setGoal).toHaveBeenCalled();
    });
  });

  describe('pathfindToPredicate', () => {
    let mockBot: any;

    beforeEach(() => {
      mockBot = {
        entity: {
          position: new Vec3(0, 64, 0),
        },
        pathfinder: {
          setMovements: vi.fn(),
          setGoal: vi.fn(),
        },
        version: '1.20.1',
        findBlock: vi.fn(),
        waitForTicks: vi.fn().mockResolvedValue(undefined),
        setControlState: vi.fn(),
        blockAt: vi.fn().mockReturnValue(null),
        dig: vi.fn(),
      };
    });

    it('should throw when block not found', async () => {
      mockBot.findBlock = vi.fn().mockReturnValue(null);

      await expect(pathfindToPredicate(mockBot, (b) => b.name === 'diamond_ore')).rejects.toThrow(
        'Target not found nearby'
      );
    });

    it('should return block when arrived', async () => {
      const mockBlock = {
        name: 'diamond_ore',
        position: new Vec3(5, 60, 5),
      };

      mockBot.findBlock = vi.fn().mockReturnValue(mockBlock);

      let callCount = 0;
      mockBot.waitForTicks = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount >= 2) {
          mockBot.entity.position = new Vec3(5, 60, 5);
        }
      });

      const result = await pathfindToPredicate(mockBot, (b) => b.name === 'diamond_ore');

      expect(result).toBe(mockBlock);
    });

    it('should throw on timeout', async () => {
      const mockBlock = {
        name: 'diamond_ore',
        position: new Vec3(100, 60, 100),
      };

      mockBot.findBlock = vi.fn().mockReturnValue(mockBlock);
      mockBot.waitForTicks = vi.fn().mockResolvedValue(undefined);

      await expect(
        pathfindToPredicate(mockBot, (b) => b.name === 'diamond_ore', 32, 1, 100)
      ).rejects.toThrow('navigation_timeout');
    });

    it('should track progress toward target', async () => {
      const mockBlock = {
        name: 'diamond_ore',
        position: new Vec3(10, 60, 10),
      };

      mockBot.findBlock = vi.fn().mockReturnValue(mockBlock);

      let ticks = 0;

      mockBot.waitForTicks = vi.fn().mockImplementation(async () => {
        ticks++;
        // Simulate progress - get closer each tick
        mockBot.entity.position = new Vec3(ticks, 64, ticks);
        // Finally reach
        if (ticks >= 5) {
          mockBot.entity.position = new Vec3(10, 60, 10);
        }
      });

      const result = await pathfindToPredicate(mockBot, (b) => b.name === 'diamond_ore', 32, 1, 5000);

      expect(result).toBe(mockBlock);
    });

    it('should accept custom maxDistance and range', async () => {
      const mockBlock = {
        name: 'emerald_ore',
        position: new Vec3(3, 64, 3),
      };

      mockBot.findBlock = vi.fn().mockReturnValue(mockBlock);

      let callCount = 0;
      mockBot.waitForTicks = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount >= 1) {
          mockBot.entity.position = new Vec3(3, 64, 3);
        }
      });

      const result = await pathfindToPredicate(mockBot, (b) => b.name === 'emerald_ore', 64, 2);

      expect(mockBot.findBlock).toHaveBeenCalledWith({
        matching: expect.any(Function),
        maxDistance: 64,
      });
      expect(result).toBe(mockBlock);
    });
  });
});
