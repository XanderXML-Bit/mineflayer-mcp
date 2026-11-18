# Minecraft MCP Mineflayer

A Model Context Protocol (MCP) server that allows AI agents to control Minecraft bots using Mineflayer.

## Features

- **94 tools** for Minecraft bot control
- **Intelligence Services** - World state, combat assessment, resource planning, exploration tracking
- **Memory System** - Persistent storage across sessions for goals, locations, and resources
- **Multi-bot Support** - Run multiple bots simultaneously
- **Plugin Architecture** - Easy to extend with new tools
- **Multi-version Support** - Works with Minecraft 1.16-1.20+
- **Rich Status Reporting** - Health, food, position, effects, inventory, threats
- **Automatic Behaviors** - Auto-eat, self-defense, auto-shield, death recovery
- **Configuration System** - YAML-based configuration with sensible defaults
- **AI Learning System** - Goal decomposition, skill library, reflection, and tech tree
- **Security Hardened** - Input validation, command blocklists, username sanitization
- **1,259 tests** - Offline unit and integration tests with mocked bots

## Quick Start

### Installation

```bash
git clone https://github.com/XanderXML-Bit/mineflayer-mcp.git
cd mineflayer-mcp
npm install
npm run build
```

### Configuration

Configure your MCP client (e.g., Cursor, Claude Desktop) to use this server:

```json
{
  "mcpServers": {
    "minecraft": {
      "command": "node",
      "args": ["/absolute/path/to/mineflayer-mcp/dist/index.js"]
    }
  }
}
```

### Basic Usage

1. Start a Minecraft server (vanilla or paper)
2. Connect your MCP client
3. Use the `joinGame` tool to spawn a bot:

```
joinGame({ username: "MyBot", host: "localhost", port: 25565 })
```

4. Control the bot with available tools

## Tool Categories

### Connection
- `joinGame` - Connect a bot to a server
- `leaveGame` - Disconnect a bot

### Movement
- `goToKnownLocation` - Navigate to coordinates
- `goToSomeone` - Navigate to a player
- `followPlayer` / `stopFollow` - Follow/stop following a player
- `moveInDirection` - Move in a direction
- `jump` - Jump
- `runAway` - Flee from threats
- `swimToLand` - Escape water
- `goToSurface` - Reach surface

### Combat
- `attackSomeone` - Attack players/mobs
- `hunt` - Hunt multiple targets
- `stopAttack` - Cancel combat

### Mining & Gathering
- `mineResource` - Mine blocks/ores
- `digBlock` - Mine specific block
- `pickupItem` - Pick up items
- `harvestMatureCrops` - Harvest crops
- `gatherSeeds` - Collect seeds

### Crafting & Cooking
- `craftItems` - Craft items (auto-places crafting table)
- `listRecipes` - View recipes
- `cookItem` / `smeltItem` - Cook/smelt items
- `retrieveItemsFromNearbyFurnace` - Collect from furnace

### Inventory
- `openInventory` - View inventory
- `equipItem` - Equip items
- `dropItem` - Drop items
- `giveItemToSomeone` - Give items to players

### Storage
- `openNearbyChest` - Open chest
- `depositItemsToNearbyChest` - Store items
- `withdrawItemsFromNearbyChest` - Retrieve items

### Farming
- `prepareLandForFarming` - Till soil
- `plantSeedsWithinRadius` - Plant seeds

### Building
- `placeItemNearYou` - Place blocks
- `placeBlockAt` - Place at coordinates
- `buildSomething` - Build structures

### Observation
- `lookAt` / `lookAround` - Look around
- `scanArea` - Scan nearby area
- `findBlock` - Find block type
- `findEntity` - Find entity
- `getPosition` - Get bot position

### Communication
- `sendChat` - Send chat message
- `readChat` - Read recent chat

### Utility
- `eatFood` - Eat food
- `sleepInNearbyBed` - Sleep
- `rest` - Wait
- `returnToLastDeathLocation` - Return to death point
- `stopAllTasks` - Cancel all tasks
- `statusDashboard` - Comprehensive status summary
- `recoverItems` - Navigate to death location and collect items

### Goals
- `addGoal` - Create a new goal
- `updateGoal` - Update goal progress
- `listGoals` - View all goals with status
- `completeGoal` - Mark goal as done

### Memory
- `remember` - Store a value
- `recall` - Retrieve a stored value
- `forget` - Delete a stored value
- `listMemories` - List stored memories
- `searchMemories` - Search stored data

### Navigation (Advanced)
- `setHome` - Mark current position as home
- `goHome` - Navigate to home base
- `getHomeInfo` - Get home location info
- `exploreArea` - Systematically explore
- `getExplorationMap` - View exploration status
- `findPOI` - Find points of interest

### Intelligence
- `assessThreats` - Get threat assessment
- `getCombatReadiness` - Check combat readiness
- `getWorldState` - Get environment info
- `checkSupplies` - Get resource status
- `whatCanICraft` - List craftable items
- `checkRequirements` - Check crafting requirements

### Storage Index
- `indexNearbyStorage` - Scan and index chests
- `findItemInStorage` - Find stored items
- `labelStorage` - Name a chest
- `getStorageSummary` - Total inventory across storage

### Enchanting
- `listEnchantments` - List possible enchantments for an item
- `enchantItem` - Enchant an item at an enchanting table

### Trading
- `findVillager` - Find villagers by profession
- `listTrades` - List available trades from a villager
- `tradeWithVillager` - Execute a trade with a villager

### Brewing
- `listBrewingRecipes` - List potion brewing recipes
- `brewPotion` - Add ingredient to brewing stand
- `addToBrewingStand` - Add potions/bottles to brewing stand
- `retrieveFromBrewingStand` - Retrieve potions from brewing stand

### Fishing
- `fish` - Start fishing in nearby water

### Animals
- `findAnimals` - Find animals within a radius
- `tameAnimal` - Tame wolves, cats, horses, etc.
- `breedAnimals` - Breed two animals together

### Anvil
- `repairItem` - Repair an item at an anvil
- `renameItem` - Rename an item at an anvil
- `combineEnchantments` - Combine items to merge enchantments

### Portals
- `findPortal` - Find nether or end portals nearby
- `usePortal` - Enter a portal to travel between dimensions
- `buildNetherPortal` - Build a nether portal frame at current location

### Biomes
- `getCurrentBiome` - Get information about the biome at current location
- `findBiome` - Search for a specific biome type in the area
- `listBiomes` - List available biome types and their characteristics

### Automation
- `autoMine` - Automatically mine a specific resource in the area
- `autoFarm` - Automatically harvest and replant crops in an area
- `guardArea` - Patrol and defend an area from hostile mobs

### Stronghold & End
- `throwEyeOfEnder` - Throw an eye of ender to help locate a stronghold
- `triangulateStronghold` - Calculate stronghold position from multiple eye throws
- `findEndCity` - Search for end cities in the End dimension

### Building Templates
- `listBuildingTemplates` - List available building templates
- `checkTemplateMaterials` - Check what materials are needed to build a template
- `buildTemplate` - Build a structure from a pre-defined template

### Multi-Bot Coordination
- `getTeamStatus` - Get status of all active bots in the team
- `assignBotRole` - Assign a specialized role to a bot in the team
- `formUp` - Have all bots gather at a location in formation

### AI Learning System
- `decomposeGoal` - Break down a goal into ordered steps with tech tree
- `saveSkill` - Save a learned skill pattern for reuse
- `searchSkills` - Search the skill library by query
- `listSkills` - List all learned skills
- `recordTaskOutcome` - Record success/failure for learning
- `getReflections` - Get insights from past task outcomes
- `whatCanILearn` - Suggest next skills based on current progress
- `getTechTree` - View the full technology progression tree

## Configuration

Create a `config.yaml` file to customize behavior. All options have sensible defaults.

### Complete Configuration Reference

```yaml
server:
  name: minecraft-mcp-mineflayer    # Server name
  version: 2.0.0                    # Server version

bot:
  defaults:
    host: localhost                 # Default Minecraft server host
    port: 25565                     # Default Minecraft server port (1-65535)
  autoEat:
    enabled: true                   # Enable automatic eating
    minHunger: 15                   # Hunger level to trigger eating (0-20)
    priority: foodPoints            # Priority: 'foodPoints' or 'saturation'
  selfDefense:
    enabled: true                   # Enable automatic hostile mob defense
    durationMs: 10000               # How long to attack before disengaging
    hostileMobs:                    # List of mobs to defend against
      - zombie
      - skeleton
      - creeper
      - spider
      # ... (24 hostile mobs configured by default)
  autoShield:
    enabled: true                   # Auto-raise shield when attacked
    durationMs: 800                 # Shield duration per block

navigation:
  allowParkour: false               # Allow parkour jumps during navigation
  allowSprinting: true              # Allow sprinting during navigation
  canDig: true                      # Allow digging to clear path
  maxDropDown: 3                    # Maximum blocks to drop (1-10)
  liquidCost: 25                    # Pathfinding cost for water/lava
  unstuckTimeoutMs: 15000           # Timeout for stuck detection

timeouts:
  navigation: 60000                 # Navigation timeout (ms)
  navigationStall: 15000            # Stall detection timeout (ms)
  mining: 120000                    # Mining operation timeout (ms)
  combat: 60000                     # Combat timeout (ms)
  crafting: 30000                   # Crafting timeout (ms)
  smelting: 90000                   # Smelting timeout (ms)
  collect: 30000                    # Item collection timeout (ms)
  stallDetection: 20000             # General stall detection (ms)

mining:
  clusterMining: true               # Mine adjacent ore blocks
  maxClusterSize: 64                # Max blocks per cluster (1-256)
  requireToolCheck: true            # Require appropriate tool

farming:
  autoReplant: true                 # Auto-replant harvested crops
  hydrationRadius: 4                # Water proximity required (1-8)

autoBehaviors:
  autoCollect:
    enabled: true                   # Auto-collect dropped items after mining
    radius: 5                       # Collection radius (1-10)
    delayMs: 200                    # Delay before collecting
  autoSurface:
    enabled: true                   # Surface when drowning
    oxygenThreshold: 5              # Oxygen level to trigger (0-20)
  autoRetreat:
    enabled: true                   # Retreat on low health
    healthThreshold: 6              # Health to trigger retreat (1-20)
    retreatDistance: 15             # Distance to retreat (5-30)
  stuckRecovery:
    enabled: true                   # Enhanced stuck recovery
    timeoutMs: 10000                # Time before recovery (3000-60000)
    jumpAttempts: 3                 # Jump attempts before giving up (1-5)
  autoTorch:
    enabled: true                   # Place torches in darkness
    lightThreshold: 7               # Light level to trigger (0-15)
    checkIntervalMs: 5000           # Check interval
  autoPosition:
    enabled: true                   # Auto-position for block placement

logging:
  level: info                       # Log level: debug, info, warn, error
  format: text                      # Format: json or text
```

### Minimal Configuration

For most use cases, you only need to override specific values:

```yaml
bot:
  defaults:
    host: my-minecraft-server.com
    port: 25565

logging:
  level: debug
```

## Architecture

```
src/
├── index.ts          # Legacy entry point
├── main.ts           # Modular entry point
├── config/           # Configuration system
├── bot/              # Bot management
├── server/           # MCP server
├── services/         # Business logic
│   ├── task.service.ts         # Task mutex, abort, and progress tracking
│   ├── progress-tracker.ts     # Progress-based timeout monitoring
│   ├── interruption-manager.ts # Task interruption conditions
│   ├── navigation.service.ts   # Pathfinding utilities
│   ├── equipment.service.ts    # Weapon/tool selection
│   ├── status.service.ts       # Bot status tracking
│   ├── memory.service.ts       # Persistent memory
│   ├── exploration.service.ts  # World exploration tracking
│   ├── goal.service.ts         # Goal management
│   ├── skill-library.service.ts  # AI skill storage
│   ├── reflection.service.ts   # Learning from outcomes
│   └── goal-decomposition.service.ts  # Tech tree planning
├── tools/            # Tool implementations (94 tools)
│   ├── base-tool.ts           # BaseTool class with Zod validation
│   ├── registry.ts            # Tool registry
│   ├── connection/            # joinGame, leaveGame
│   ├── observation/           # lookAround, findBlock, etc.
│   ├── movement/              # goToKnownLocation, followPlayer, etc.
│   ├── combat/                # attackSomeone, hunt, etc.
│   ├── mining/                # mineResource, digBlock
│   ├── crafting/              # craftItems, listRecipes
│   ├── cooking/               # smeltItem, cookItem
│   ├── farming/               # harvestCrops, plantSeeds
│   ├── building/              # placeBlock, buildSomething
│   ├── inventory/             # equipItem, dropItem
│   ├── storage/               # openChest, depositItems
│   ├── skills/                # saveSkill, searchSkills
│   ├── reflection/            # recordTaskOutcome, getReflections
│   └── ...                    # 15+ more categories
├── types/            # TypeScript types
└── utils/            # Utilities
    ├── chat-sanitizer.ts      # Command validation & security
    ├── block-helpers.ts       # Block detection utilities
    ├── mining-helpers.ts      # Mining utilities
    ├── cooking-helpers.ts     # Cooking utilities
    ├── inventory-helpers.ts   # Inventory utilities
    ├── version-adapter.ts     # Multi-version Minecraft support
    ├── errors.ts              # Error handling with retry logic
    └── timeout.ts             # Adaptive timeout management
```

## Progress-Based Timeouts

The bot uses an intelligent progress-based timeout system that only counts time when the bot is NOT making progress. This prevents premature task timeouts when the bot is actively working but just taking longer than expected.

### How It Works

1. **Position Tracking**: The bot tracks its position every 100ms
2. **Progress Detection**: If the bot moves more than 0.5 blocks or its inventory changes, progress is detected
3. **Stall Timer**: The stall timer only runs when no progress is being made
4. **Task Completion**: Tasks complete normally or timeout only if stalled for the configured duration

### Progress Indicators

Different task types use different progress indicators:

| Task Type | Progress Indicators |
|-----------|---------------------|
| Mining | Blocks mined, position changed, inventory changed |
| Navigation | Distance to goal decreased, position changed |
| Crafting | Items crafted, inventory changed |
| Combat | Damage dealt, target health decreased |
| Farming | Crops harvested, seeds planted |

### Task Interruption Conditions

Tasks can be interrupted by critical conditions:

| Condition | Priority | Behavior |
|-----------|----------|----------|
| Bot died | Critical | Immediate task stop, recovery triggered |
| Under attack | Critical | Task stops, allows fight or flight |
| Tool broken | High | Task stops, find replacement tool |
| No suitable tools | High | Task stops, report to AI |
| Food low (<6) | Advisory | Warning only, task continues |
| Health low (<8) | High | Risky tasks stop |

## Security

The MCP server implements multiple security layers to prevent misuse:

### Command Blocklist

The following commands are blocked from chat/execution:

| Category | Blocked Commands |
|----------|------------------|
| **Admin** | `/op`, `/deop`, `/ban`, `/ban-ip`, `/kick`, `/whitelist` |
| **Server** | `/stop`, `/reload`, `/save-all`, `/save-off`, `/save-on` |
| **Execution** | `/execute`, `/function`, `/schedule` |
| **Player Manipulation** | `/gamemode`, `/give`, `/tp`, `/teleport`, `/kill`, `/effect`, `/clear`, `/enchant` |
| **World Manipulation** | `/weather`, `/time`, `/difficulty`, `/gamerule`, `/worldborder`, `/seed` |
| **Data** | `/data`, `/datapack`, `/attribute`, `/scoreboard`, `/team` |
| **Debug** | `/debug`, `/perf`, `/jfr` |

### Build Commands

Only safe building commands are allowed:
- `/fill`, `/setblock`, `/clone`, `/place`
- `/summon` is **blocked** (can spawn dangerous entities like primed TNT)

### Input Validation

- **Username validation**: 3-16 characters, alphanumeric + underscore only
- **Message length**: Max 256 characters for chat, 32000 for commands
- **Control character stripping**: Removes null bytes and control characters
- **Zod schema validation**: All tool inputs are validated before execution

### Memory Limits

- **Exploration chunks**: LRU eviction at 10,000 chunks to prevent unbounded memory growth
- **Chat log**: Rolling buffer of recent messages
- **Lesson deduplication**: O(1) Set-based duplicate prevention

## Troubleshooting

### Connection Issues

**Bot won't connect to server**
```
Error: ECONNREFUSED
```
- Verify Minecraft server is running
- Check host and port are correct
- Ensure server allows offline-mode connections (for development)
- Check firewall settings

**Authentication failed**
```
Error: Invalid session
```
- For offline servers, ensure `online-mode=false` in server.properties
- For online servers, use a valid Microsoft account

### Navigation Problems

**Bot gets stuck**
- The bot has automatic stuck recovery (enabled by default)
- Increase `navigation.unstuckTimeoutMs` if needed
- Try `goToSurface` to escape underground areas
- Use `stopAllTasks` to cancel stuck navigation

**Path not found**
- Increase search radius with `maxDistance` parameter
- Enable `navigation.canDig: true` to allow digging through obstacles
- Check if destination is reachable (not in void, behind bedrock)

### Mining Issues

**Tool breaks during mining**
- Enable `mining.requireToolCheck: true` to verify tool before mining
- Craft backup tools before long mining sessions
- Use `listInventory` to check tool durability

**Can't find ore**
- Increase `radius` parameter in `mineResource`
- Go to appropriate Y-level (diamonds at Y -64 to 16)
- Try `findBlock` first to verify ore exists in area

### Crafting Problems

**Missing materials**
```
Error: Don't have required materials
```
- Use `listInventory` to check current materials
- Use `whatCanICraft` to see available recipes
- Use `checkRequirements` to see what's missing

**Recipe not found**
- Check exact item name (e.g., `oak_planks` not `planks`)
- Use `listRecipes` with the item name to find valid recipes

### Combat Issues

**Bot dies frequently**
- Increase `bot.selfDefense.durationMs` for longer fights
- Enable `autoBehaviors.autoRetreat` with higher health threshold
- Equip armor with `equipItem`
- Ensure `bot.autoEat.enabled: true`

### Memory/Performance

**High memory usage**
- Exploration data is bounded to 10,000 chunks (LRU eviction)
- Restart the MCP server periodically for long sessions
- Reduce `mining.maxClusterSize` if mining large areas

**Slow response times**
- Check `logging.level: info` (debug is verbose)
- Reduce concurrent bot count
- Ensure server isn't overloaded

### MCP Server Issues

**Schema is missing a method literal**
```
Error: Schema is missing a method literal
```
- This error occurs if the MCP SDK request handlers are not using the proper schema types
- The server must use `ListToolsRequestSchema` and `CallToolRequestSchema` from `@modelcontextprotocol/sdk/types.js`
- Incorrect: `server.setRequestHandler({ method: 'tools/list' }, handler)`
- Correct: `server.setRequestHandler(ListToolsRequestSchema, handler)`

**Failed to reconnect to MCP**
- Ensure the MCP server builds without errors: `npm run build`
- Test the server directly: `node dist/index.js`
- Check for startup errors in the console output
- Verify the path in `.mcp.json` or MCP client config is correct

### Common Error Messages

| Error | Solution |
|-------|----------|
| `Multiple bots active, specify username` | Add `username` parameter to tool call |
| `Bot not connected` | Use `joinGame` first |
| `Task already in progress` | Use `stopAllTasks` then retry |
| `This command is blocked for security reasons` | Command is in blocklist, use alternative |
| `Username can only contain letters, numbers, and underscores` | Use valid username format |
| `Schema is missing a method literal` | Use proper SDK schema types for request handlers |

## Development

### Running Tests

```bash
npm test                # Run tests
npm run test:watch      # Watch mode
npm run test:coverage   # Coverage report
```

### Building

```bash
npm run build
```

### Development Mode

```bash
npm run dev   # restarts the server when dist/ changes; rebuild with npm run build
```

## Mineflayer Plugins

This MCP uses `mineflayer-pathfinder` for A* navigation. Combat, eating, armor and tool selection are implemented in `src/services/`.

## License

All rights reserved. See [LICENSE](../LICENSE).
