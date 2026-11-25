# mineflayer-mcp

[![CI](https://github.com/XanderXML-Bit/mineflayer-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/XanderXML-Bit/mineflayer-mcp/actions/workflows/ci.yml)

A Model Context Protocol (MCP) server for developers connecting MCP clients to Mineflayer bots on Minecraft Java Edition servers.

Built by [Xander M. Lopez](https://xandermlopez.com) / [Zendren](https://zendren.net).

## What it does

- Connect bots, inspect the world, move to coordinates, and exchange chat messages.
- Mine, craft, manage inventories, and find items in indexed storage.
- Save tool sequences, plan goal prerequisites, and review patterns in recorded outcomes.

## Safety and authorization

Use bots only on servers you own or are authorized to use. Follow the server's rules and keep its authentication settings in place.

## Stack

TypeScript, Node.js, the MCP TypeScript SDK, Mineflayer, `mineflayer-pathfinder`, Zod, YAML, and Vitest.

## Quick start

Run the server from a source checkout with [nvm](https://github.com/nvm-sh/nvm). The repository pins Node.js 22.23.3 in `.nvmrc`.

```sh
git clone https://github.com/XanderXML-Bit/mineflayer-mcp.git
cd mineflayer-mcp
nvm install
nvm use
npm ci
npm run build
node scripts/smoke.mjs
```

The smoke check starts the compiled server and lists its tools over standard input and output (stdio). It checks that the tool names and count match the table below and fails on registration warnings. It runs without a Minecraft connection.

![MCP smoke output showing server version 2.0.0, 126 registered tools, zero registration failures, and the first eight tool names](docs/mcp-smoke.png)

## Connect an MCP client

Add the following server entry to a client that supports stdio. Replace the example path with the absolute path to your checkout. If the client cannot find Node.js, set `command` to the absolute path to the pinned Node.js executable.

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

You can also start the stdio server from the checkout with `npm start`. Pass the Minecraft host and port to `joinGame` to connect to your server.

The server looks for YAML configuration relative to its working directory. It tries `config/default.config.yaml`, `config.yaml`, then `../config/default.config.yaml` and loads the first file it can read and parse. Environment variables take precedence over YAML. See the [configuration schema](src/config/schema.ts) for supported settings and the [docs index](docs/README.md) for examples.

## Tools

The compiled server returns 126 tools in the MCP `tools/list` response on Node.js 22.23.3. Use that response to inspect the input schema for each tool.

| Tool | Purpose |
| --- | --- |
| `addGoal` | Create a new goal to track progress. |
| `addToBrewingStand` | Add potions or water bottles to a brewing stand. |
| `assignBotRole` | Assign a role to a bot in the team. |
| `autoFarm` | Automatically harvest and replant crops in an area. |
| `autoMine` | Automatically mine a specified resource in the area. |
| `breedAnimals` | Breed two animals of the same type. |
| `brewPotion` | Add an ingredient to a brewing stand and optionally wait for completion. |
| `buildNetherPortal` | Build a Nether portal frame at the bot's current location. |
| `buildSomething` | Build with creative-mode commands or place blocks in survival mode. |
| `buildTemplate` | Build a structure from a predefined template. |
| `checkRequirements` | Check crafting requirements for an item. |
| `checkSupplies` | Check resource status including tool durability, food supply, and materials. |
| `checkTemplateMaterials` | Check what materials are needed to build a template. |
| `combineEnchantments` | Combine two items at an anvil to merge enchantments. |
| `completeGoal` | Complete, fail, or delete a tracked goal. |
| `configureAutoDefense` | Configure automatic responses to attacks and nearby hostile mobs. |
| `cookItem` | Cook food items. |
| `cookWithCampfire` | Cook food items using a campfire. |
| `cookWithSmoker` | Cook food items using a smoker. |
| `craftItems` | Craft items using recipes. |
| `dance` | Make the bot dance by alternating movement controls. |
| `depositItemsToNearbyChest` | Deposit items into a nearby chest. |
| `detectGamemode` | Get the current game mode of the bot. |
| `digBlock` | Dig a block at a specific position. |
| `dropItem` | Drop items from inventory. |
| `eatFood` | Eat food to restore hunger. |
| `enchantItem` | Enchant an item using a nearby enchanting table. |
| `equipItem` | Equip an item from inventory to a slot. |
| `exploreArea` | Explore in a direction, marking chunks as explored and optionally discovering points of interest. |
| `findAnimals` | Find animals within a radius. |
| `findBiome` | Search for a specific biome type in the area. |
| `findBlock` | Find the nearest block of a specific type. |
| `findEndCity` | Search for End cities. |
| `findEntity` | Find the nearest entity, optionally filtering by name or type. |
| `findItemInStorage` | Search indexed storage containers for an item. |
| `findPOI` | Find, add, or list saved points of interest. |
| `findPortal` | Find nearby Nether or End portals. |
| `findVillager` | Find villagers by profession within a radius. |
| `fish` | Start fishing in nearby water. |
| `followPlayer` | Continuously follow a player. |
| `forget` | Delete a specific memory by key. |
| `formUp` | Gather all bots at a location in formation. |
| `gatherSeeds` | Break grass to gather wheat seeds. |
| `getCurrentBiome` | Get information about the biome at current location. |
| `getEvents` | Read recent bot events, including damage, chat, and pickups. |
| `getExplorationMap` | Show a grid of explored and unexplored chunks. |
| `getHomeInfo` | Get information about saved home locations including distance and reachability. |
| `getInsights` | Summarize patterns, warnings, and tips from recorded task outcomes. |
| `getLessons` | Get lessons learned from past experiences. |
| `getPosition` | Get the current position of the bot in the world. |
| `getSkillDetails` | Show the steps and metadata for a saved skill. |
| `getSkills` | Search for relevant skills by query, tags, or category. |
| `getSkillStats` | Summarize the skills in the library and how often they are used. |
| `getStorageSummary` | Summarize indexed locations, stored items, and recently scanned containers. |
| `getTeamStatus` | Show the status of all active bots on the team. |
| `getWorldState` | Inspect time, weather, biome, dimension, light level, and nearby danger. |
| `giveItemToSomeone` | Give an item to another player. |
| `goHome` | Navigate to a saved home location. |
| `goToKnownLocation` | Navigate to specific coordinates in the world. |
| `goToSomeone` | Navigate to another player in the game. |
| `goToSurface` | Move toward the surface, digging if needed. |
| `guardArea` | Patrol and defend an area from hostile mobs. |
| `harvestMatureCrops` | Harvest mature crops and optionally replant. |
| `indexNearbyStorage` | Scan and index nearby chests, barrels, and other storage containers. |
| `joinGame` | Connect a new bot to a Minecraft server. |
| `jump` | Make the bot jump for a specified duration. |
| `labelStorage` | Assign a label to a storage container or look up a labeled container. |
| `leaveGame` | Disconnect one bot or all bots. |
| `listAllRecipes` | List all available recipes with filters. |
| `listBiomes` | List biome types and their characteristics. |
| `listBrewingRecipes` | List brewing recipes for potions. |
| `listBuildingTemplates` | List available building templates. |
| `listEnchantments` | List possible enchantments for an item and nearby enchanting setup. |
| `listGoals` | List all goals with status and progress. |
| `listInventory` | List items in the bot inventory. |
| `listMemories` | List all stored memories. |
| `listRecipes` | List recipes for a specific item. |
| `listTrades` | List available trades from a villager. |
| `lookAround` | Return a deprecation notice directing clients to `scanArea`. |
| `lookAt` | Make the bot look at specific coordinates. |
| `mineResource` | Mine blocks by name, with support for clusters. |
| `moveInDirection` | Move in a specific direction for a duration. |
| `openInventory` | List the items in the bot inventory. |
| `openNearbyChest` | Open a nearby chest and list its contents. |
| `pickupItem` | Pick up a dropped item entity near the bot. |
| `pickupLootWithinRadius` | Collect dropped items within a radius. |
| `placeBlockAt` | Place a block at specific coordinates. |
| `placeItemNearYou` | Place an item at the nearest valid spot to the bot. |
| `planGoal` | Plan the Minecraft prerequisites and actions for a goal. |
| `plantSeedsWithinRadius` | Plant seeds on farmland within a radius. |
| `prepareLandForFarming` | Till dirt or grass blocks with a hoe to create farmland. |
| `readChat` | Read recent chat messages from the server. |
| `recall` | Retrieve a specific memory by key. |
| `recordOutcome` | Record a task result for pattern analysis. |
| `recordSkillOutcome` | Record whether a skill execution was successful. |
| `recoverItems` | Recover dropped items or inspect and update death-recovery records. |
| `remember` | Store a value in persistent memory. |
| `renameItem` | Rename an item at an anvil. |
| `repairItem` | Repair an item at an anvil using materials. |
| `rest` | Wait for a specified duration. |
| `retrieveFromBrewingStand` | Retrieve potions from a brewing stand. |
| `retrieveItemsFromNearbyFurnace` | Retrieve output items from a nearby furnace. |
| `returnToLastDeathLocation` | Navigate back to where the bot last died and attempt to pick up dropped items. |
| `runAway` | Run away from nearby threats. |
| `saveSkill` | Save a successful tool sequence as a reusable skill. |
| `scanArea` | Scan the area around the bot for blocks, entities, and dropped items. |
| `sendChat` | Send a chat message or a command allowed by the chat filter. |
| `setHome` | Save the current position or a set of coordinates as a named home. |
| `sleepInNearbyBed` | Try to sleep in a nearby bed or set the bot's spawn point. |
| `smeltItem` | Smelt items using the best available device. |
| `smeltWithBlastFurnace` | Smelt ores using a blast furnace. |
| `statusDashboard` | Summarize bot health, environment, threats, resources, and goals. |
| `stopAllTasks` | Stop navigation, combat, and the current task for one bot or all bots. |
| `stopFollow` | Stop following a player. |
| `suggestCurriculum` | Suggest tasks based on bot state, saved skills, and recorded outcomes. |
| `suggestNextGoals` | Suggest goals whose prerequisites match the bot's inventory. |
| `swimToLand` | Navigate to the nearest land when in water. |
| `tameAnimal` | Tame a wolf, cat, horse, or other tameable animal. |
| `throwEyeOfEnder` | Throw an Eye of Ender to help locate a stronghold. |
| `tradeWithVillager` | Trade with a villager. |
| `triangulateStronghold` | Estimate a stronghold's position from multiple Eye of Ender throws. |
| `updateGoal` | Update a goal's progress, status, or details. |
| `useItemOnBlockOrEntity` | Activate a block at coordinates or interact with a player entity. |
| `usePortal` | Enter a Nether or End portal to travel between dimensions. |
| `whatCanICraft` | List all items that can be crafted from your current inventory. |
| `withdrawItemsFromNearbyChest` | Withdraw items from a nearby chest. |

## Architecture

- [Startup](src/main.ts) loads configuration and creates the bot manager and tool registry.
- The [stdio server](src/server/index.ts) handles MCP tool discovery and calls. The [registry](src/tools/registry.ts) dispatches each call by name.
- [Tool classes](src/tools/base-tool.ts) validate input with Zod and call [bot services](src/services/) for game actions and state. The [bot manager](src/bot/bot-manager.ts) tracks connections by username.

## Tests

```sh
npm run lint
npm run typecheck
npm test
```

The offline Vitest suite has 1,265 tests across 57 files. It covers configuration, bot services, and local integration workflows with mocked bots. The type check also covers the chat and whisper response types.

The [CI workflow](.github/workflows/ci.yml) runs these checks, builds the project, and checks the MCP handshake and tool registration. Live Minecraft gameplay requires a separate server test.

## License

All rights reserved. See the [repository license](LICENSE). Third-party dependencies retain their own licenses.
