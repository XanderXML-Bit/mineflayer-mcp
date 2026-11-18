# Stateful Service Resource Cleanup Pattern

---
category: code-quality
tags: [memory-leak, event-listeners, timers, cleanup, typescript, services]
severity: critical
components: [totem.service, mlg-water.service, elytra.service, smart-eat.service]
date_discovered: 2025-01-09
---

## Problem

When creating stateful services that attach to a bot instance, resources like event listeners, intervals, and timeouts must be properly tracked and cleaned up to prevent memory leaks.

### Symptoms

- Memory usage grows over time when bots connect/disconnect repeatedly
- Event handlers fire on destroyed bot instances
- Timeouts execute callbacks after service cleanup
- TypeScript interfaces declare fields that are never used (dead code)

## Root Cause

Services store state on bot instances but fail to:
1. **Track event listener references** - Listeners added with `bot.on()` but never stored for removal
2. **Track timer references** - `setTimeout()` and `setInterval()` calls without storing handles
3. **Validate external dependencies** - Assuming plugins like `pathfinder` exist without checking

## Investigation Steps

### Code Review Findings

1. **totem.service.ts** - `entityStatus` listener added but never stored:
   ```typescript
   // BAD: Anonymous listener can never be removed
   bot.on('entityStatus', (entity, status) => { ... });
   ```

2. **mlg-water.service.ts** - Untracked setTimeout:
   ```typescript
   // BAD: No reference stored for cleanup
   setTimeout(() => { pickupWater(bot); }, delay);
   ```

3. **elytra.service.ts** - Dead code in interface:
   ```typescript
   interface ElytraState {
     flightCheckInterval?: ReturnType<typeof setInterval>;  // Never set!
   }
   ```

4. **smart-eat.service.ts** - Unguarded pathfinder access:
   ```typescript
   // BAD: Assumes pathfinder exists
   (bot.pathfinder as any)?.goto(goal);  // Returns undefined if missing
   ```

## Solution

### Pattern: Store All Resource References in State Interface

```typescript
interface ServiceState {
  // Configuration
  config: ServiceConfig;

  // Tracked resources for cleanup
  checkInterval?: ReturnType<typeof setInterval>;
  eventListener?: (entity: unknown, status: number) => void;
  pendingTimeout?: ReturnType<typeof setTimeout>;
}
```

### Pattern: Store and Remove Event Listeners

```typescript
function setupEventTracking(bot: Bot): void {
  const state = getServiceState(bot);

  // Remove existing listener if any
  if (state.eventListener) {
    bot.removeListener('eventName', state.eventListener);
  }

  // Create and store the listener
  state.eventListener = (data) => {
    // Handle event
  };

  bot.on('eventName', state.eventListener);
}
```

### Pattern: Track Timeouts with Cleanup

```typescript
function scheduleAction(bot: Bot, delayMs: number): void {
  const state = getServiceState(bot);

  // Clear any pending timeout
  if (state.pendingTimeout) {
    clearTimeout(state.pendingTimeout);
  }

  // Store the new timeout reference
  state.pendingTimeout = setTimeout(() => {
    doAction(bot).catch(() => {});
    state.pendingTimeout = undefined;  // Clear reference after execution
  }, delayMs);
}
```

### Pattern: Validate External Dependencies with Fallback

```typescript
async function navigateSafely(bot: Bot, target: Vec3): Promise<void> {
  const pathfinder = (bot as any).pathfinder;

  // Check if pathfinder is available AND has required methods
  if (pathfinder && typeof pathfinder.goto === 'function') {
    try {
      await pathfinder.goto(goal);
    } catch (e) {
      // Fallback to basic movement
      await basicMovement(bot, target);
    }
  } else {
    // No pathfinder available, use fallback
    await basicMovement(bot, target);
  }
}
```

### Pattern: Comprehensive Cleanup Function

```typescript
export function cleanupService(bot: Bot): void {
  const state = (bot as any).__serviceState as ServiceState | undefined;
  if (!state) return;

  // Clear intervals
  if (state.checkInterval) {
    clearInterval(state.checkInterval);
    state.checkInterval = undefined;
  }

  // Clear timeouts
  if (state.pendingTimeout) {
    clearTimeout(state.pendingTimeout);
    state.pendingTimeout = undefined;
  }

  // Remove event listeners
  if (state.eventListener) {
    bot.removeListener('eventName', state.eventListener);
    state.eventListener = undefined;
  }

  // Reset state flags
  state.isActive = false;

  log.debug('Service cleaned up', { username: bot.username });
}
```

## Prevention Strategies

### Code Review Checklist

- [ ] Every `bot.on()` call has a corresponding stored reference
- [ ] Every `setTimeout()` return value is stored for cleanup
- [ ] Every `setInterval()` return value is stored for cleanup
- [ ] State interface matches actual fields being set
- [ ] External plugin access (`pathfinder`, etc.) is validated before use
- [ ] `cleanupService()` function handles all tracked resources

### Automated Detection

Add ESLint rules or code review agents to detect:
- Anonymous event listener functions
- Unassigned setTimeout/setInterval returns
- Interface fields never referenced in code

## Files Changed

| File | Issue | Fix |
|------|-------|-----|
| `src/services/totem.service.ts` | Event listener never cleaned up | Added `entityStatusListener` and `reequipTimeout` tracking |
| `src/services/mlg-water.service.ts` | setTimeout not tracked | Added `pickupTimeout` tracking |
| `src/services/elytra.service.ts` | Dead code in state interface | Removed unused `flightCheckInterval` |
| `src/services/smart-eat.service.ts` | Pathfinder accessed without validation | Added validation and basic movement fallback |

## Related Patterns

- **Bot Lifecycle Management** - Ensure cleanup is called when bot disconnects
- **Graceful Degradation** - Fallback behavior when optional plugins unavailable
- **State Machine Pattern** - Track service state transitions cleanly

## Test Verification

All 703 tests pass after applying these fixes.
