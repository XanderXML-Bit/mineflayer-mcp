# Service cleanup

The [bot factory](../../../src/bot/bot-factory.ts) starts bot services and calls their cleanup functions from `destroyBot`. Services that start timers or subscribe to bot events keep a handle or listener reference so cleanup can release it.

## Follow existing cleanup patterns

- The [totem service](../../../src/services/totem.service.ts) clears its check interval and pending re-equip timeout. It also removes the stored `entityStatus` listener.
- The [water bucket service](../../../src/services/mlg-water.service.ts) clears its check interval and any pending water pickup timeout.
- The [smart eating service](../../../src/services/smart-eat.service.ts) clears its hunger check interval. Its retreat logic checks for pathfinder and can use movement controls when the plugin is unavailable.
- The [elytra service](../../../src/services/elytra.service.ts) resets flight and landing state and clears its target position.

When changing a service, check both repeated initialization and cleanup with a pending timer. See the [totem tests](../../../tests/unit/services/totem.test.ts) and [water bucket tests](../../../tests/unit/services/mlg-water.test.ts).
