# Creating Custom Tools

This guide shows how to create custom tools for the Minecraft MCP server.

## Tool Architecture

All tools extend the `BaseTool` class and implement:
- `name`: Unique tool identifier
- `description`: Tool description for MCP clients
- `category`: Tool category for organization
- `inputSchema`: Zod schema for input validation
- `execute()`: Tool logic

## Basic Tool Template

```typescript
import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';
import type { ToolContext } from '../base-tool.js';

// Define input schema (extends BaseInputSchema which includes username)
const InputSchema = BaseInputSchema.extend({
  myParam: z.string().describe('Description of this parameter'),
  optionalParam: z.number().optional().describe('Optional parameter'),
});

type Input = z.infer<typeof InputSchema>;

// Define output interface
interface Output {
  success: boolean;
  message: string;
}

export class MyCustomTool extends BaseTool<Input, Output> {
  readonly name = 'myCustomTool';
  readonly description = 'Does something custom in Minecraft';
  readonly category = 'utility' as const;
  readonly inputSchema = InputSchema;

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    // Access input parameters
    const { myParam, optionalParam } = input;

    // Use bot instance
    bot.chat(`Executing with param: ${myParam}`);

    // Access configuration
    const config = this.getConfig();

    // Log for debugging
    this.log.info('Executing custom tool', { myParam });

    return {
      success: true,
      message: `Completed with ${myParam}`,
    };
  }
}
```

## Registering Custom Tools

Add your tool to the appropriate category's `index.ts`:

```typescript
// src/tools/utility/index.ts
import { MyCustomTool } from './my-custom-tool.js';

export function createUtilityTools(context: ToolContext) {
  return [
    // ... existing tools
    new MyCustomTool(context),
  ];
}
```

## Using Task Mutex

For tools that perform long-running operations:

```typescript
export class LongRunningTool extends BaseTool<Input, Output> {
  // ... name, description, etc.

  async run(rawInput: unknown) {
    // Use runWithTask instead of run for mutex protection
    return this.runWithTask(rawInput);
  }

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    // Long-running operation
    await bot.pathfinder.goto(goal);
    return { success: true };
  }
}
```

Or use the `createTool` helper:

```typescript
import { createTool, BaseInputSchema } from '../base-tool.js';

const MyTool = createTool({
  name: 'myTool',
  description: 'A simple tool',
  category: 'utility',
  inputSchema: BaseInputSchema.extend({
    target: z.string(),
  }),
  requiresTask: true, // Enables task mutex
  execute: async (input, bot, context) => {
    return { result: 'done' };
  },
});
```

## Accessing Bot Status

Tools automatically track bot status:

```typescript
protected async execute(input: Input, bot: Bot): Promise<Output> {
  // The base class captures status before and after
  // and includes it in the result

  // Access current values directly
  const health = bot.health;
  const food = bot.food;
  const position = bot.entity.position;

  return { health, food };
}
```

## Tool Categories

Available categories:
- `connection` - Joining/leaving servers
- `observation` - Looking around, finding blocks/entities
- `communication` - Chat, reading messages
- `movement` - Navigation, following, running
- `combat` - Attacking, hunting
- `inventory` - Managing items
- `mining` - Digging blocks
- `crafting` - Making items
- `cooking` - Smelting, cooking
- `storage` - Chests, containers
- `farming` - Harvesting, planting
- `building` - Placing blocks
- `utility` - General utilities

## Example: Find and Collect Tool

```typescript
import { z } from 'zod';
import type { Bot } from 'mineflayer';
import { BaseTool, BaseInputSchema } from '../base-tool.js';

const InputSchema = BaseInputSchema.extend({
  itemName: z.string().describe('Name of item to find and collect'),
  maxDistance: z.number().default(32).describe('Maximum search distance'),
});

type Input = z.infer<typeof InputSchema>;

interface Output {
  collected: number;
  itemName: string;
}

export class FindAndCollectTool extends BaseTool<Input, Output> {
  readonly name = 'findAndCollect';
  readonly description = 'Find dropped items and collect them';
  readonly category = 'utility' as const;
  readonly inputSchema = InputSchema;

  async run(rawInput: unknown) {
    return this.runWithTask(rawInput);
  }

  protected async execute(input: Input, bot: Bot): Promise<Output> {
    const { itemName, maxDistance } = input;

    // Find dropped items
    const items = Object.values(bot.entities).filter(
      (entity) =>
        entity.name === 'item' &&
        entity.metadata?.some((m: any) => m?.itemId?.includes(itemName)) &&
        entity.position.distanceTo(bot.entity.position) <= maxDistance
    );

    let collected = 0;

    for (const item of items) {
      try {
        await bot.pathfinder.goto(new goals.GoalNear(
          item.position.x,
          item.position.y,
          item.position.z,
          1
        ));
        collected++;
      } catch (e) {
        this.log.warn('Failed to collect item', { error: e });
      }
    }

    return { collected, itemName };
  }
}
```

## Testing Custom Tools

```typescript
import { describe, it, expect, vi } from 'vitest';
import { MyCustomTool } from './my-custom-tool.js';

describe('MyCustomTool', () => {
  it('should execute successfully', async () => {
    const mockBot = {
      username: 'TestBot',
      chat: vi.fn(),
      // ... other mocked properties
    };

    const context = {
      getBotOrThrow: () => mockBot,
      getAllBots: () => new Map([['TestBot', mockBot]]),
      config: defaultConfig,
    };

    const tool = new MyCustomTool(context);
    const result = await tool.run({ myParam: 'test' });

    expect(result.ok).toBe(true);
    expect(mockBot.chat).toHaveBeenCalledWith('Executing with param: test');
  });
});
```
