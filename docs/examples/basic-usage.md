# Basic Usage Examples

This guide shows common usage patterns for the Minecraft MCP server.

## Connecting a Bot

**Username requirements:**
- 3-16 characters
- Only letters, numbers, and underscores allowed
- Examples: `MyBot`, `Bot_123`, `MiningBot1`

```json
{
  "tool": "joinGame",
  "input": {
    "username": "MyBot",
    "host": "localhost",
    "port": 25565
  }
}
```

Response:
```json
{
  "ok": true,
  "data": {
    "username": "MyBot",
    "host": "localhost",
    "port": 25565,
    "version": "1.20.4",
    "gameMode": "survival"
  },
  "bot": "MyBot",
  "status": {
    "health": 20,
    "food": 20,
    "position": { "x": 0, "y": 64, "z": 0 }
  }
}
```

## Getting Bot Position

```json
{
  "tool": "getPosition",
  "input": {
    "username": "MyBot"
  }
}
```

Response:
```json
{
  "ok": true,
  "data": {
    "position": {
      "x": 100.5,
      "y": 64.0,
      "z": -50.3
    }
  },
  "bot": "MyBot",
  "status": { ... }
}
```

## Looking Around

Get environment information:

```json
{
  "tool": "lookAround",
  "input": {
    "username": "MyBot"
  }
}
```

## Sending Chat Messages

```json
{
  "tool": "sendChat",
  "input": {
    "username": "MyBot",
    "message": "Hello, world!"
  }
}
```

## Movement

### Go to a Location

```json
{
  "tool": "goToKnownLocation",
  "input": {
    "username": "MyBot",
    "x": 100,
    "y": 64,
    "z": -200
  }
}
```

### Follow a Player

```json
{
  "tool": "followPlayer",
  "input": {
    "username": "MyBot",
    "playerName": "Steve"
  }
}
```

### Stop Following

```json
{
  "tool": "stopFollow",
  "input": {
    "username": "MyBot"
  }
}
```

## Mining Resources

```json
{
  "tool": "mineResource",
  "input": {
    "username": "MyBot",
    "blockName": "iron_ore",
    "count": 10
  }
}
```

## Crafting Items

### List Available Recipes

```json
{
  "tool": "listRecipes",
  "input": {
    "username": "MyBot",
    "itemName": "iron_pickaxe"
  }
}
```

### Craft an Item

```json
{
  "tool": "craftItems",
  "input": {
    "username": "MyBot",
    "itemName": "iron_pickaxe",
    "count": 1
  }
}
```

## Inventory Management

### List Inventory

```json
{
  "tool": "listInventory",
  "input": {
    "username": "MyBot"
  }
}
```

### Equip an Item

```json
{
  "tool": "equipItem",
  "input": {
    "username": "MyBot",
    "itemName": "iron_pickaxe",
    "destination": "hand"
  }
}
```

## Stopping Tasks

Stop all running tasks (navigation, combat, etc.):

```json
{
  "tool": "stopAllTasks",
  "input": {
    "username": "MyBot"
  }
}
```

Stop tasks for all bots:

```json
{
  "tool": "stopAllTasks",
  "input": {
    "stopAll": true
  }
}
```

## Disconnecting

Disconnect a specific bot:

```json
{
  "tool": "leaveGame",
  "input": {
    "username": "MyBot"
  }
}
```

Disconnect all bots:

```json
{
  "tool": "leaveGame",
  "input": {
    "all": true
  }
}
```
