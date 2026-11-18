# Progress-Based Timeout and Task Interruption System

---
title: Progress-Based Timeout and Task Interruption System
category: integration-issues
component: task-service, bot-factory
symptoms:
  - Tasks timeout even when bot is actively working
  - Bot continues tasks while under attack
  - Error logs show {} instead of error details
  - GoalNear undefined in death recovery
root_cause:
  - Wall-clock timeouts don't account for actual progress
  - No event-driven interruption handling
  - Error objects not enumerable by JSON.stringify
  - Dynamic imports unreliable for pathfinder goals
solution_type: architectural-improvement
date_solved: 2025-01-08
related_files:
  - src/services/progress-tracker.ts
  - src/services/interruption-manager.ts
  - src/types/progress.ts
  - src/services/task.service.ts
  - src/utils/logger.ts
tags:
  - timeout
  - progress-tracking
  - task-interruption
  - error-serialization
  - mineflayer
---

## Problem Description

### Symptoms Observed

1. **Incorrect timeouts**: Mining tasks would timeout even when the bot was actively mining through stone - just slowly
2. **No interruption handling**: Bot would continue mining while being attacked by mobs, leading to death
3. **Useless error logs**: Errors logged as `{"error": {}}` instead of actual error details
4. **Death recovery failures**: `GoalNear is undefined` errors when trying to recover items after death

### Investigation Steps

1. Researched Voyager and MindCraft bot implementations for timeout patterns
2. Analyzed existing timeout utility (wall-clock based)
3. Tested error serialization behavior with `JSON.stringify(new Error('test'))`
4. Traced GoalNear import through dynamic import chain

## Root Cause Analysis

### 1. Wall-Clock Timeouts

The existing timeout system used wall-clock time:
```typescript
// Old approach - times out regardless of activity
const timeout = setTimeout(() => reject(new TimeoutError()), maxMs);
```

This doesn't account for legitimate slow progress (mining through stone, navigating complex terrain).

### 2. No Interruption System

Tasks had no awareness of external conditions:
- Bot health changes
- Tool durability
- Environmental threats

### 3. Error Serialization

JavaScript Error objects have non-enumerable properties:
```typescript
JSON.stringify(new Error('test')) // Returns "{}"
Object.keys(new Error('test'))    // Returns []
```

### 4. Dynamic Import Issues

Dynamic imports for mineflayer-pathfinder goals were unreliable:
```typescript
// Unreliable - sometimes goals is undefined
const { goals } = await import('mineflayer-pathfinder');
```

## Solution

### Progress-Based Timeouts

Created `ProgressTracker` service that monitors actual bot activity:

```typescript
// src/services/progress-tracker.ts
export interface ProgressIndicators {
  positionHistory: Vec3[];
  blocksMinedCount: number;
  itemsCollectedCount: number;
  lastActivityTime: number;
}

// Stall detection - only timeout when no progress
function checkForStall(bot: Bot, config: ProgressTimeoutConfig): void {
  const state = getTrackerState(bot);
  const now = Date.now();

  // Check if position changed significantly
  const currentPos = bot.entity?.position;
  const hasMovement = positionHistory.some(
    pos => currentPos.distanceTo(pos) > config.movementThreshold
  );

  // Check other progress indicators
  const hasProgress = hasMovement ||
    indicators.blocksMinedCount > 0 ||
    indicators.itemsCollectedCount > 0;

  if (!hasProgress) {
    const stallDuration = now - lastProgressTime;
    if (stallDuration >= config.stallTimeoutMs) {
      state.emitter.emit('stalled', { taskType, stallDuration, indicators });
    }
  }
}
```

### Task Interruption System

Created `InterruptionManager` with priority-based conditions:

```typescript
// src/services/interruption-manager.ts
export type InterruptPriority = 'critical' | 'high' | 'advisory';

export interface InterruptCondition {
  name: string;
  priority: InterruptPriority;
  message: string;
  data?: Record<string, unknown>;
}

// Monitored conditions
const conditions = {
  damage_taken: { priority: 'critical', threshold: 4 },
  health_critical: { priority: 'critical', threshold: 6 },
  tool_broken: { priority: 'high' },
  no_suitable_tools: { priority: 'high' },
  hunger_warning: { priority: 'advisory', threshold: 6 }
};
```

### Integration with Task Service

```typescript
// src/services/task.service.ts
export async function withProgressTask<T>(
  bot: Bot,
  fn: (signal: { onAbort(cb: () => void): void }) => Promise<T>,
  options: ProgressTaskOptions
): Promise<T> {
  // Subscribe to events BEFORE creating promises
  const stalledUnsubscribe = onStalled(bot, ({ stallDurationMs }) => {
    if (stallDurationMs >= stallTimeoutMs && rejectStalled) {
      rejectStalled(new TaskStalledError(stallDurationMs));
    }
  });

  const interruptUnsubscribe = onInterrupt(bot, (condition) => {
    if (condition.priority !== 'advisory' || options.interruptOnAdvisory) {
      rejectInterrupt(new TaskInterruptedError(condition));
    }
  });

  // ... task execution with cleanup
}
```

### Error Serialization Fix

```typescript
// src/utils/logger.ts
function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    const serialized: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    };
    if (error.stack) {
      serialized.stack = error.stack;
    }
    // Cast through unknown to access non-enumerable properties
    const errorObj = error as unknown as Record<string, unknown>;
    for (const key of Object.keys(errorObj)) {
      if (!['name', 'message', 'stack'].includes(key)) {
        serialized[key] = serializeValue(errorObj[key]);
      }
    }
    // Handle ES2022 cause
    if ('cause' in error && error.cause) {
      serialized.cause = serializeError(error.cause);
    }
    return serialized;
  }
  return error;
}
```

### Module-Level Import for Pathfinder

```typescript
// Use module-level import instead of dynamic import
import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg as any;

// Now GoalNear is reliably available
const goal = new goals.GoalNear(x, y, z, range);
```

## Verification

1. **Build**: `npm run build` - compiles cleanly
2. **Tests**: `npm test` - 703 tests passing
3. **Manual testing**: Bot correctly pauses timeout during active mining, interrupts on damage

## Prevention Strategies

### Code Review Checklist

- [ ] Timeouts should be progress-based, not wall-clock
- [ ] Long-running tasks should handle interruption conditions
- [ ] Error objects need custom serialization for logging
- [ ] Prefer module-level imports over dynamic imports for reliability

### Best Practices

1. **Progress Tracking**: Always track multiple indicators (position, actions, inventory changes)
2. **Priority Levels**: Use priority levels for interrupts (critical = stop now, advisory = warn only)
3. **Error Handling**: Create dedicated serialization for Error objects in logging utilities
4. **Import Patterns**: For mineflayer ecosystem, use module-level imports with type assertions

### Test Cases to Add

```typescript
describe('Progress Tracking', () => {
  it('should not timeout while making progress');
  it('should timeout when stalled');
  it('should reset timeout on any progress indicator');
});

describe('Interruption', () => {
  it('should interrupt on critical conditions');
  it('should warn but not interrupt on advisory');
  it('should check tool availability before starting');
});
```

## Related Documentation

- [docs/README.md](../../README.md) - Architecture overview with progress tracking section
- [src/utils/timeout.ts](../../../src/utils/timeout.ts) - Original timeout utility (still useful for simple cases)
- [Voyager Bot](https://github.com/MineDojo/Voyager) - Inspiration for progress-based approach
- [MindCraft Bot](https://github.com/kolbytn/mindcraft) - Inspiration for interruption cascade

## Files Modified

| File | Change |
|------|--------|
| `src/services/progress-tracker.ts` | New - Progress monitoring service |
| `src/services/interruption-manager.ts` | New - Task interruption handling |
| `src/types/progress.ts` | New - TypeScript interfaces |
| `src/services/task.service.ts` | Added `withProgressTask()` wrapper |
| `src/utils/logger.ts` | Fixed error serialization |
| `src/bot/bot-factory.ts` | Initialize/cleanup interruption manager |
| `src/tools/utility/recover-items.ts` | Fixed GoalNear import |
