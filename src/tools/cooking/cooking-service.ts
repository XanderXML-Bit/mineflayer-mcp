/**
 * Cooking Service
 * Shared utilities for cooking tools
 */

import type { Bot } from 'mineflayer';
import { createEquipmentService } from '../../services/equipment.service.js';
import { configureMovements } from '../../services/navigation.service.js';

import pathfinderPkg from 'mineflayer-pathfinder';
import type { Block } from 'prismarine-block';
import type { Entity } from 'prismarine-entity';
const { goals } = pathfinderPkg;

type DeviceType = 'furnace' | 'smoker' | 'blast_furnace';

/** Furnace window interface for cooking operations */
interface FurnaceWindow {
  fuelItem(): unknown;
  putFuel(type: number, metadata: null, count: number): Promise<void>;
  putInput(type: number, metadata: null, count: number): Promise<void>;
  takeOutput(): Promise<{ name: string; count?: number } | null>;
  close(): void;
}

/** Default fuel items in order of preference */
const FUEL_ITEMS = [
  'coal',
  'charcoal',
  'coal_block',
  'lava_bucket',
  'stick',
  'oak_planks',
  'spruce_planks',
  'birch_planks',
  'jungle_planks',
  'acacia_planks',
  'dark_oak_planks',
  'mangrove_planks',
  'cherry_planks',
  'bamboo_planks',
  'crimson_planks',
  'warped_planks',
];

/**
 * Open a furnace-like device
 */
export async function openFurnaceLike(bot: Bot, device: DeviceType): Promise<FurnaceWindow> {
  const block = bot.findBlock({
    matching: (b) => b !== null && b.name === device,
    maxDistance: 16,
  });

  if (!block) {
    throw new Error(`No ${device} nearby`);
  }

  // mineflayer uses the same API for furnace/smoker/blast_furnace
  const botWithFurnace = bot as Bot & { openFurnace(block: Block): Promise<FurnaceWindow> };
  const furnace = await botWithFurnace.openFurnace(block);
  return furnace;
}

/**
 * Cook or smelt items on a device
 */
export async function cookOrSmeltOnDevice(
  bot: Bot,
  device: DeviceType,
  itemName: string,
  fuelName?: string,
  count: number = 1,
  totalMaxMs?: number
): Promise<{
  ok: boolean;
  deviceUsed: string;
  outputsCollected: number;
  requested: number;
  remaining: number;
  timedOut?: boolean;
  stalled?: boolean;
  outOfFuel?: boolean;
  reason?: string;
  output?: string;
}> {
  const equipment = createEquipmentService();
  const furnace = await openFurnaceLike(bot, device);

  try {
    // Take any existing output
    try {
      await furnace.takeOutput();
    } catch {
      // Ignore if no output available
    }

    // Determine how many items to process
    const invItems = bot.inventory.items().filter((i) => i.name === itemName);
    const available = invItems.reduce((a, b) => a + b.count, 0);
    const toProcess = Math.max(1, Math.min(count, available));

    if (toProcess <= 0) {
      throw new Error(`Missing input '${itemName}'`);
    }

    // Helper to find fuel
    const findFuel = () => {
      if (fuelName) {
        return bot.inventory.items().find((i) => i.name === fuelName) || null;
      }
      return bot.inventory.items().find((i) => FUEL_ITEMS.includes(i.name)) || null;
    };

    // Ensure fuel is present
    if (!furnace.fuelItem()) {
      const fuel = findFuel();
      if (fuel) {
        equipment.pushSuspendAutoEat(bot);
        try {
          await furnace.putFuel(fuel.type, null, Math.min(1, fuel.count));
        } finally {
          equipment.popSuspendAutoEat(bot);
        }
      } else {
        return {
          ok: false,
          deviceUsed: device,
          outputsCollected: 0,
          requested: count,
          remaining: count,
          outOfFuel: true,
          reason: 'missing_fuel',
        };
      }
    }

    // Insert inputs in batches
    let inserted = 0;
    while (inserted < toProcess) {
      const nxt = bot.inventory.items().find((i) => i.name === itemName && i.count > 0);
      if (!nxt) break;

      const batch = Math.min(nxt.count, toProcess - inserted);
      equipment.pushSuspendAutoEat(bot);
      try {
        await furnace.putInput(nxt.type, null, batch);
      } finally {
        equipment.popSuspendAutoEat(bot);
      }
      inserted += batch;
    }

    // Collect outputs until done or timeout
    const outputsTarget = inserted;
    let outputs = 0;
    const deadline = Date.now() + (totalMaxMs ?? Math.max(90000, 60000 * outputsTarget));
    let lastProgressAt = Date.now();
    let lastOutName: string | undefined;
    let outOfFuel = false;
    let refuelAttempts = 0;

    while (outputs < outputsTarget && Date.now() < deadline) {
      await bot.waitForTicks(10);

      try {
        const out = await furnace.takeOutput();
        if (out) {
          outputs += out.count ?? 1;
          lastOutName = out.name;
          lastProgressAt = Date.now();
        }
      } catch {
        // Ignore output collection errors
      }

      // Attempt refuel on stall
      if (Date.now() - lastProgressAt > 15000) {
        const hasFuelNow = !!furnace.fuelItem();
        if (!hasFuelNow) {
          const fuel = findFuel();
          if (fuel && refuelAttempts < 2) {
            try {
              equipment.pushSuspendAutoEat(bot);
              try {
                await furnace.putFuel(fuel.type, null, Math.min(1, fuel.count));
              } finally {
                equipment.popSuspendAutoEat(bot);
              }
              refuelAttempts++;
              lastProgressAt = Date.now();
              continue;
            } catch {
              // Ignore refuel errors
            }
          }
          outOfFuel = true;
          break;
        }
        break; // Stalled for another reason
      }
    }

    const timedOut = outputs < outputsTarget && Date.now() >= deadline;
    const stalled = outputs < outputsTarget && !timedOut && !outOfFuel;
    const reason = outOfFuel
      ? 'out_of_fuel'
      : timedOut
        ? 'timed_out'
        : stalled
          ? 'stalled'
          : undefined;

    return {
      ok: outputs >= outputsTarget,
      deviceUsed: device,
      outputsCollected: outputs,
      requested: count,
      remaining: Math.max(0, count - outputs),
      timedOut,
      stalled,
      outOfFuel,
      reason,
      output: lastOutName,
    };
  } finally {
    try {
      furnace.close();
    } catch {
      // Ignore close errors
    }
  }
}

/**
 * Cook on a campfire
 */
export async function cookOnCampfire(
  bot: Bot,
  itemName: string
): Promise<{
  ok: boolean;
  deviceUsed: string;
  timedOut?: boolean;
}> {
  const equipment = createEquipmentService();

  const campfireBlock = bot.findBlock({
    matching: (b) => b !== null && b.name.includes('campfire'),
    maxDistance: 16,
  });

  if (!campfireBlock) {
    throw new Error('No campfire nearby');
  }

  const food = bot.inventory.items().find((i) => i.name === itemName);
  if (!food) {
    throw new Error(`Missing input '${itemName}'`);
  }

  // Equip food
  equipment.pushSuspendAutoEat(bot);
  try {
    await bot.equip(food, 'hand');
  } finally {
    equipment.popSuspendAutoEat(bot);
  }

  // Navigate to campfire
  const movements = configureMovements(bot);
  bot.pathfinder.setMovements(movements);
  const cp = campfireBlock.position;
  bot.pathfinder.setGoal(new goals.GoalNear(cp.x, cp.y, cp.z, 1));
  await bot.waitForTicks(10);

  const block = bot.blockAt(cp);
  if (!block) {
    throw new Error('Campfire vanished');
  }

  // Place items and wait
  equipment.pushSuspendAutoEat(bot);
  try {
    await bot.activateBlock(block);
  } finally {
    equipment.popSuspendAutoEat(bot);
  }

  const start = Date.now();
  const maxMs = 45000;

  while (Date.now() - start < maxMs) {
    await bot.waitForTicks(10);
  }

  // Try to pick up cooked item
  const endWait = Date.now() + 5000;
  while (Date.now() < endWait) {
    const ent = bot.nearestEntity(
      (e: Entity) => e.type === 'object' && e.position.distanceTo(cp) <= 3
    );
    if (ent) {
      bot.pathfinder.setGoal(new goals.GoalFollow(ent, 1));
      await bot.waitForTicks(20);
      break;
    }
    await bot.waitForTicks(5);
  }

  const timedOut = Date.now() - start >= maxMs;
  return { ok: !timedOut, deviceUsed: 'campfire', timedOut };
}
