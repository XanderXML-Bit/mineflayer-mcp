# Basic usage

[Connect an MCP client](../../README.md#connect-an-mcp-client) before calling tools. The JSON blocks below are parameters for the MCP `tools/call` request.

## Connect a bot

Use a server you own or are authorized to use. Replace the example host and port with the server's address. The username must contain three to 16 letters, digits, or underscores.

```json
{"name":"joinGame","arguments":{"username":"MyBot","host":"localhost","port":25565}}
```

The server returns the tool result as JSON inside a text content item. Check `ok` before using `data`. For a successful connection, `data` includes the bot's username, server address, Minecraft version, and game mode.

## Inspect the world and move

Read the bot's coordinates with `getPosition`.

```json
{"name":"getPosition","arguments":{"username":"MyBot"}}
```

Scan nearby blocks, entities, and dropped items with `scanArea`.

```json
{"name":"scanArea","arguments":{"username":"MyBot","radius":6}}
```

Replace the coordinates below with a reachable location. Set `noBlockBreaking` to keep pathfinding from digging through blocks.

```json
{"name":"goToKnownLocation","arguments":{"username":"MyBot","x":100,"y":64,"z":-200,"noBlockBreaking":true}}
```

To follow a player, pass that player's username as `playerName`.

```json
{"name":"followPlayer","arguments":{"username":"MyBot","playerName":"Steve"}}
```

Call `stopFollow` with the bot's username to stop following.

## Send chat

Use `sendChat` to send a message from the selected bot.

```json
{"name":"sendChat","arguments":{"username":"MyBot","message":"Hello from MyBot"}}
```

## Mine and craft

Use `mineResource` with a block name. The bot needs a suitable tool for blocks such as iron ore.

```json
{"name":"mineResource","arguments":{"username":"MyBot","blockName":"iron_ore","count":10}}
```

Use `listRecipes` to check the ingredients before asking the bot to craft an item.

```json
{"name":"listRecipes","arguments":{"username":"MyBot","itemName":"iron_pickaxe"}}
```

Once you have the ingredients and a nearby crafting table, call `craftItems`.

```json
{"name":"craftItems","arguments":{"username":"MyBot","itemName":"iron_pickaxe","count":1}}
```

Use `listInventory` to check that the item is present. Call `equipItem` to move it to the bot's hand.

```json
{"name":"equipItem","arguments":{"username":"MyBot","itemName":"iron_pickaxe","destination":"hand"}}
```

## Stop tasks and disconnect

Use `stopAllTasks` to stop navigation or abort the bot's current foreground task.

```json
{"name":"stopAllTasks","arguments":{"username":"MyBot"}}
```

To disconnect the bot, call `leaveGame`.

```json
{"name":"leaveGame","arguments":{"username":"MyBot"}}
```

See [Multiple bots](multi-bot.md) for commands that target more than one bot.
