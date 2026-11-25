# Custom tools

Use [`BaseTool` or `createTool`](../../src/tools/base-tool.ts) to define an MCP tool. `BaseInputSchema` supplies the optional `username` and `runInBackground` fields. The base class validates inputs, selects the bot, and wraps the result with bot status.

## Define a tool

Create `src/tools/utility/get-health.ts`. This tool reads the selected bot's health and food levels.

```typescript
import { BaseInputSchema, createTool } from '../base-tool.js';

export const GetHealthTool = createTool({
  name: 'getHealth',
  description: 'Get the selected bot\'s health and food levels.',
  category: 'utility',
  inputSchema: BaseInputSchema,
  execute: async (_input, bot) => ({
    health: bot.health,
    food: bot.food,
  }),
});
```

For a long-running tool that should hold the per-bot task lock, pass `requiresTask: true` to `createTool`. See the [task service](../../src/services/task.service.ts) for how the lock and death handling work.

## Register and check the tool

1. Import `GetHealthTool` from `./get-health.js` in [`src/tools/utility/index.ts`](../../src/tools/utility/index.ts).
2. Add `new GetHealthTool(context)` to the list returned by `createUtilityTools`.
3. Run `npm run typecheck` and `npm run build`.
4. Restart the MCP server and look for `getHealth` in your client's tool list.

See the [base tool tests](../../tests/unit/tools/base-tool.test.ts) for examples of mocking a bot and checking the result of `run`.
