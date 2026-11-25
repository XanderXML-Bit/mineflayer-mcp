# Multiple bots

One MCP server process can manage multiple bot connections. Use distinct usernames on a Minecraft server you own or are authorized to use.

## Connect two bots

Send one `joinGame` call per bot. These examples use a local Minecraft server.

```json
{"name":"joinGame","arguments":{"username":"Miner","host":"localhost","port":25565}}
```

```json
{"name":"joinGame","arguments":{"username":"Builder","host":"localhost","port":25565}}
```

## Select a bot

Pass the bot's `username` in calls that act on it. The [bot manager](../../src/bot/bot-manager.ts) selects the first active bot when you omit the username.

```json
{"name":"getPosition","arguments":{"username":"Miner"}}
```

```json
{"name":"listInventory","arguments":{"username":"Builder"}}
```

## Stop tasks or disconnect

Call `stopAllTasks` with a username to stop that bot's navigation and current foreground task. Set `stopAll` to `true` to apply it to every active bot.

```json
{"name":"stopAllTasks","arguments":{"stopAll":true}}
```

Call `leaveGame` with a username to disconnect that bot.

```json
{"name":"leaveGame","arguments":{"username":"Builder"}}
```

Set `all` to `true` to disconnect every active bot.

```json
{"name":"leaveGame","arguments":{"all":true}}
```
