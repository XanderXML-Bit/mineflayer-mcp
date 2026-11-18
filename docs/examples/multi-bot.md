# Multi-Bot Usage

This guide demonstrates how to manage multiple bots simultaneously.

## Connecting Multiple Bots

```json
// Connect first bot
{
  "tool": "joinGame",
  "input": {
    "username": "Miner",
    "host": "localhost"
  }
}

// Connect second bot
{
  "tool": "joinGame",
  "input": {
    "username": "Builder",
    "host": "localhost"
  }
}

// Connect third bot
{
  "tool": "joinGame",
  "input": {
    "username": "Guard",
    "host": "localhost"
  }
}
```

## Targeting Specific Bots

When multiple bots are connected, you **must** specify the `username` parameter:

```json
// Send Miner to mine iron
{
  "tool": "mineResource",
  "input": {
    "username": "Miner",
    "blockName": "iron_ore",
    "count": 32
  }
}

// Send Builder to a build location
{
  "tool": "goToKnownLocation",
  "input": {
    "username": "Builder",
    "x": 100,
    "y": 64,
    "z": 100
  }
}

// Have Guard follow a player
{
  "tool": "followPlayer",
  "input": {
    "username": "Guard",
    "playerName": "Steve"
  }
}
```

## Getting Status of Each Bot

```json
// Check Miner's position
{
  "tool": "getPosition",
  "input": {
    "username": "Miner"
  }
}

// Check Builder's inventory
{
  "tool": "listInventory",
  "input": {
    "username": "Builder"
  }
}

// Check Guard's surroundings
{
  "tool": "lookAround",
  "input": {
    "username": "Guard"
  }
}
```

## Stopping All Tasks

Stop tasks on all bots at once:

```json
{
  "tool": "stopAllTasks",
  "input": {
    "stopAll": true
  }
}
```

Stop tasks on a specific bot:

```json
{
  "tool": "stopAllTasks",
  "input": {
    "username": "Miner"
  }
}
```

## Coordinated Actions

Example: Have bots work together

```json
// 1. Miner collects resources
{
  "tool": "mineResource",
  "input": {
    "username": "Miner",
    "blockName": "cobblestone",
    "count": 64
  }
}

// 2. Miner gives items to Builder
{
  "tool": "giveItemToSomeone",
  "input": {
    "username": "Miner",
    "targetPlayer": "Builder",
    "itemName": "cobblestone",
    "count": 64
  }
}

// 3. Builder constructs something
{
  "tool": "buildSomething",
  "input": {
    "username": "Builder",
    "description": "a small cobblestone house"
  }
}
```

## Disconnecting Bots

Disconnect one bot:

```json
{
  "tool": "leaveGame",
  "input": {
    "username": "Guard"
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

## Error: Username Required

When multiple bots are active, omitting `username` returns an error:

```json
// This will fail with multiple bots
{
  "tool": "getPosition",
  "input": {}
}
```

Response:
```json
{
  "ok": false,
  "error": "Multiple bots active, specify username"
}
```
