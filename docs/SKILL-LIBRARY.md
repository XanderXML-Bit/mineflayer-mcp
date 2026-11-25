# Skill library

A skill stores a named sequence of MCP tool calls. The client reads the steps and decides which calls to make. The [skill library service](../src/services/skill-library.service.ts) stores skills in `data/skills.json` relative to the server's working directory.

## Save and reuse a skill

Connect a bot first. The skill tools use the same bot selection as [other tool calls](examples/multi-bot.md#select-a-bot).

1. Use `saveSkill` to store a sequence. Include a name, description, tags, and steps. Each step includes a tool name and an object of parameters.
2. Use `getSkills` to search by query text, tags, or category.
3. Use `getSkillDetails` with the saved name to read the steps. Check that the current bot and world match the stored prerequisites before making the calls.
4. Call `recordSkillOutcome` with `skillName` and `success` to update the skill's success rate. Use `getSkillStats` to check usage across the library.

This call saves a sequence for checking the bot's position and nearby blocks.

```json
{
  "name": "saveSkill",
  "arguments": {
    "name": "survey_location",
    "description": "Record the bot position and scan the surrounding blocks.",
    "tags": ["observation"],
    "steps": [
      {"tool": "getPosition", "parameters": {}},
      {"tool": "scanArea", "parameters": {"radius": 6}}
    ]
  }
}
```

## Plan tasks and inspect outcomes

Use `planGoal` to look up ordered prerequisites in the [goal planner](../src/services/goal-decomposition.service.ts). The client chooses which steps to run.

Use `recordOutcome` to save the result of a task. The [reflection service](../src/services/reflection.service.ts) classifies recorded failures and summarizes patterns. Read those summaries with `getInsights` and `getLessons`.
