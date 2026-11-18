# Skill Library Architecture

## Overview

The Skill Library enables the AI agent to **learn from experience** by saving successful tool sequences as reusable "skills". This is inspired by [Voyager](https://voyager.minedojo.org/) and [Odyssey](https://github.com/zju-vipa/Odyssey), adapted for the MCP protocol.

## What is a Skill?

A skill is a **named, reusable sequence of tool calls** that accomplishes a specific goal.

```typescript
interface Skill {
  name: string;           // "smelt_iron_ore"
  description: string;    // "Smelt iron ore into ingots using a furnace"
  tags: string[];         // ["smelting", "iron", "furnace", "crafting"]
  steps: ToolCall[];      // The actual tool sequence
  prerequisites: string[]; // Required items/conditions
  outcomes: string[];     // What this skill produces
  successRate: number;    // How often it succeeds (0-1)
  timesUsed: number;      // Usage count
  lastUsed: number;       // Timestamp
}

interface ToolCall {
  tool: string;           // "smeltItem"
  parameters: object;     // { item: "iron_ore", count: 8 }
  expectedOutcome?: string;
}
```

## How It Works

### 1. Skill Creation (Learning)

When the LLM successfully completes a multi-step task:

```
User: "Smelt some iron ore"

LLM executes:
  → findBlock({ blockType: "furnace" })
  → goToKnownLocation({ x, y, z })
  → smeltItem({ item: "iron_ore", count: 8 })
  → retrieveFromFurnace()

LLM calls: saveSkill({
  name: "smelt_iron_ore",
  description: "Smelt iron ore into iron ingots",
  steps: [... the tool calls above ...]
})
```

### 2. Skill Retrieval (Recall)

When facing a similar task later:

```
User: "I need iron ingots"

LLM calls: getSkills({ query: "iron ingots smelting" })

Returns: [
  { name: "smelt_iron_ore", description: "...", successRate: 0.95 },
  { name: "mine_iron", description: "...", successRate: 0.87 }
]

LLM can now follow the saved steps or adapt them.
```

### 3. Skill Composition (Advanced)

Complex skills can reference simpler skills:

```typescript
{
  name: "get_iron_armor",
  description: "Obtain a full set of iron armor",
  steps: [
    { skill: "mine_iron", times: 24 },      // Reference another skill
    { skill: "smelt_iron_ore" },
    { tool: "craftItems", parameters: { item: "iron_helmet" } },
    { tool: "craftItems", parameters: { item: "iron_chestplate" } },
    // ...
  ]
}
```

## MCP Integration

### New Tools

| Tool | Purpose |
|------|---------|
| `saveSkill` | Save a new skill from recent tool calls |
| `getSkills` | Search skills by query/tags |
| `getSkillDetails` | Get full details of a specific skill |
| `executeSkill` | Execute a saved skill (LLM follows the steps) |
| `updateSkillOutcome` | Report success/failure to update stats |
| `deleteSkill` | Remove a skill |
| `listAllSkills` | List all saved skills |

### Storage

Skills are persisted in `data/skills.json` alongside the memory system.

- **Atomic writes**: Prevents file corruption on crash
- **Debounced saves**: Batches rapid updates for performance
- **JSON format**: Human-readable, easily exportable/importable

## Primitive vs Compositional Skills

Following Odyssey's hierarchy:

### Primitive Skills (36)
Direct tool wrappers with common parameters:
- `mine_wood` → mineResource({ resource: "wood", count: 10 })
- `craft_planks` → craftItems({ item: "planks", count: 4 })
- `find_water` → findBlock({ blockType: "water" })

### Compositional Skills (Built from primitives)
- `make_wooden_pickaxe` = mine_wood → craft_planks → craft_sticks → craft_wooden_pickaxe
- `setup_wheat_farm` = find_water → prepare_farmland → plant_seeds
- `get_diamond_pickaxe` = (entire tech tree progression)

## Comparison with Research Projects

| Feature | Voyager | Odyssey | This MCP |
|---------|---------|---------|----------|
| Skill storage | Code files | Structured | JSON/Tool sequences |
| Retrieval | Embeddings | Embeddings | Fuzzy search + synonyms |
| Execution | Code eval | Code eval | LLM follows steps |
| Learning | Automatic | Automatic | LLM-initiated |

**Key difference**: Research projects execute skill code directly. This MCP stores skills as **guidance for the LLM** - the LLM still makes all decisions and tool calls. This is safer and maintains MCP's architecture.

## Example Session

```
Human: Make me a stone pickaxe

AI: Let me check if I have a skill for this...
    [getSkills({ query: "stone pickaxe crafting" })]

    Found skill "craft_stone_pickaxe" with 92% success rate.
    Following the saved steps:

    Step 1: Check inventory for materials
    [listInventory()]

    I need cobblestone and sticks. Let me get those first.

    Step 2: Get wood (using saved skill "mine_wood")
    [mineResource({ resource: "wood", count: 3 })]

    Step 3: Craft planks and sticks
    [craftItems({ item: "oak_planks", count: 12 })]
    [craftItems({ item: "stick", count: 4 })]

    Step 4: Mine cobblestone (using saved skill "mine_stone")
    [mineResource({ resource: "cobblestone", count: 3 })]

    Step 5: Craft stone pickaxe
    [craftItems({ item: "stone_pickaxe", count: 1 })]

    Done! Updating skill success rate.
    [updateSkillOutcome({ skill: "craft_stone_pickaxe", success: true })]
```

## Future Enhancements

1. **Embedding-based retrieval** - Use OpenAI/local embeddings for semantic search
2. **Automatic skill extraction** - Detect successful patterns and suggest saving
3. **Skill versioning** - Track changes as skills evolve
4. **Skill sharing** - Export/import skill libraries between instances
5. **Prerequisite checking** - Validate requirements before execution
