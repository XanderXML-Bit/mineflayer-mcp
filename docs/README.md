# Documentation

Use the [project README](../README.md) to install the server and connect an MCP client.

## Use the server

- [Basic usage](examples/basic-usage.md) shows how to connect a bot, inspect its surroundings, and call movement and inventory tools.
- [Multiple bots](examples/multi-bot.md) explains how to select a bot by username and disconnect one or all bots.
- [Skill library](SKILL-LIBRARY.md) covers saving and retrieving tool sequences and recording their results.

## Work on the server

- [Custom tools](examples/custom-tools.md) shows how to define, register, and check a new tool.
- [Service cleanup](solutions/code-quality/stateful-service-resource-cleanup.md) describes how bot services release timers and listeners.
- [Configuration schema](../src/config/schema.ts) defines the accepted settings.
