# AI Learning System

## Overview

The AI Learning System enables the Minecraft bot to **learn from experience** across sessions. Inspired by [Voyager](https://voyager.minedojo.org/), [MindCraft](https://github.com/mindcraft-bots/mindcraft), and [Odyssey](https://github.com/zju-vipa/Odyssey).

## Components

### 1. Skill Library (`skill-library.service.ts`)

Store and retrieve successful tool sequences as reusable skills.

See [SKILL-LIBRARY.md](./SKILL-LIBRARY.md) for full documentation.

**Pre-loaded Primitives (36 skills):**
- Mining: wood, stone, coal, iron, gold, diamond, redstone, lapis, obsidian
- Crafting: planks, sticks, crafting table, furnace, pickaxes (4 tiers), swords (3 tiers)
- Utility: torch, chest, bucket, bed
- Farming: gather seeds, plant seeds, harvest crops
- Combat: attack hostile, defend self
- Navigation: go to surface, swim to land
- Other: fishing

**Key Tools:**
- `saveSkill` - Save a successful tool sequence
- `getSkills` - Search skills by query/tags
- `getSkillDetails` - Get full skill steps
- `recordSkillOutcome` - Track success/failure
- `getSkillStats` - View library statistics

### 2. Goal Decomposition (`goal-decomposition.service.ts`)

Break down high-level goals into ordered steps using Minecraft's tech tree.

**Tech Tree Coverage:**
- 98 nodes across 10 categories
- Categories: gathering, crafting, mining, smelting, combat, farming, brewing, enchanting, nether, exploration
- Full progression from wood to diamond gear
- Complete brewing system (potions, brewing stand, nether ingredients)
- Advanced enchanting setup (bookshelves, anvil, grindstone)
- Combat progression (melee, ranged, armor tiers)
- Exploration tools (compass, map, clock, spyglass)

**Key Tools:**
- `planGoal` - Decompose a goal into ordered steps
- `suggestNextGoals` - Get achievable goals based on inventory
- `suggestCurriculum` - Automatic task suggestions based on state and performance

**Example:**
```
> planGoal({ goal: "iron_pickaxe" })

Returns 12 steps:
1. Gather Wood Logs (gathering, difficulty 1)
2. Craft Planks (crafting, difficulty 1)
3. Craft Sticks (crafting, difficulty 1)
4. Craft Crafting Table (crafting, difficulty 1)
5. Craft Wooden Pickaxe (crafting, difficulty 1)
6. Mine Cobblestone (mining, difficulty 1)
7. Craft Furnace (crafting, difficulty 2)
8. Mine Coal (mining, difficulty 2)
9. Craft Stone Pickaxe (crafting, difficulty 2)
10. Mine Iron Ore (mining, difficulty 3)
11. Smelt Iron (smelting, difficulty 3)
12. Craft Iron Pickaxe (crafting, difficulty 3)

Total difficulty: 21, Estimated time: 18.5 minutes
```

### 3. Reflection Service (`reflection.service.ts`)

Learn from successes and failures by tracking outcomes and extracting patterns.

**Key Tools:**
- `recordOutcome` - Record task success/failure for learning
- `getInsights` - Get AI-generated insights from patterns
- `getLessons` - Retrieve lessons learned from experience

**Features:**
- Automatic failure categorization
- Pattern detection (resource issues, mob deaths, navigation problems)
- Lesson extraction and storage
- Actionable insights generation

**Failure Categories:**
| Category | Examples |
|----------|----------|
| `resource_missing` | "Don't have planks", "Need more iron" |
| `tool_broken` | "Pickaxe broke", "Durability ran out" |
| `mob_attack` | "Killed by creeper", "Skeleton damage" |
| `environmental` | "Fell in lava", "Drowned" |
| `navigation_failed` | "Couldn't find path", "Got stuck" |
| `timeout` | "Task timed out", "Took too long" |
| `inventory_full` | "No inventory space" |
| `target_not_found` | "Block not found nearby" |

**Insights Generation:**

The system analyzes patterns and generates actionable insights:

```
Warning: Overall success rate is low (45%). Consider reviewing failed tasks.

Pattern: Multiple failures due to missing resources. Consider gathering
materials before complex tasks.

Tip: Tools breaking during tasks. Check durability before starting and
craft backups.
```

## Data Flow

```
┌─────────────────┐     ┌──────────────────┐     ┌───────────────────┐
│  User Request   │────▶│  Goal Planning   │────▶│  Skill Lookup     │
│  "Get diamonds" │     │  (Decompose)     │     │  (Find relevant)  │
└─────────────────┘     └──────────────────┘     └───────────────────┘
                                │                         │
                                ▼                         ▼
                        ┌──────────────────┐     ┌───────────────────┐
                        │  Execute Steps   │◀────│  Follow Skill or  │
                        │  (Tool calls)    │     │  Create New Plan  │
                        └──────────────────┘     └───────────────────┘
                                │
                                ▼
                        ┌──────────────────┐
                        │  Record Outcome  │
                        │  (Reflection)    │
                        └──────────────────┘
                                │
                        ┌───────┴───────┐
                        ▼               ▼
                ┌──────────────┐ ┌──────────────────┐
                │  Save Skill  │ │  Update Insights │
                │  (if new)    │ │  (patterns)      │
                └──────────────┘ └──────────────────┘
```

## Storage

All learning data persists in the `data/` directory:

| File | Contents |
|------|----------|
| `data/skills.json` | Saved skills and success rates |
| `data/reflections.json` | Task outcomes and lessons |
| `data/memory.json` | Bot memory (locations, resources, goals) |

### Data Persistence

- **Atomic writes**: All data is written atomically to prevent corruption
- **Debounced saves**: Multiple rapid updates are batched together
- **JSON format**: Human-readable and easily exportable

### Memory Management

- **Lesson deduplication**: O(1) Set-based lookup prevents duplicate lessons
- **Goal ID lookup**: O(1) Map-based retrieval for fast goal operations
- **Exploration bounds**: LRU eviction at 10,000 chunks prevents unbounded growth

## Usage Example

```typescript
// 1. Plan a complex goal
const plan = await planGoal({ goal: "diamond_pickaxe" });
// Returns 14 steps with dependencies

// 2. Check for relevant skills
const skills = await getSkills({ query: "mine diamond" });
// Returns skills with success rates

// 3. Execute and record outcome
await mineResource({ resource: "diamond", count: 3 });
await recordSkillOutcome({
  name: "mine_diamond",
  success: true,
  duration: 180000
});

// 4. Save new skill if successful
await saveSkill({
  name: "mine_diamond_safe",
  description: "Mine diamonds with water bucket for lava protection",
  tags: ["mining", "diamond", "safety"],
  steps: [
    { tool: "equipItem", parameters: { item: "water_bucket" } },
    { tool: "mineResource", parameters: { resource: "diamond", count: 3 } }
  ]
});

// 5. Get suggestions for next goals
const suggestions = await suggestNextGoals({
  currentInventory: ["diamond_pickaxe", "iron_armor"]
});
// Returns: enchanting_table, nether_portal, etc.
```

## MCP Protocol Compliance

The AI Learning System maintains MCP architecture:

- **Skills are guidance, not code execution** - The LLM interprets steps and makes decisions
- **All actions go through MCP tools** - No direct Minecraft manipulation
- **Learning improves prompts** - Skills and insights help the LLM make better choices
- **Transparent operation** - All data is JSON, readable, and exportable

## Comparison with Research Projects

| Feature | Voyager | MindCraft | This MCP |
|---------|---------|-----------|----------|
| Skill Storage | JS Files | Memory | JSON |
| Execution | Code runner | Code Gen | LLM guidance |
| Learning | GPT-4 critic | Prompt-based | Pattern analysis |
| Safety | Limited | Limited | MCP sandboxed |
| Portability | Low | Low | High (JSON export) |
