# Chunk 06: LLM Skill Handler & LLM Planner

## Objective

Implement a default LLM-powered skill handler that calls an `ILlmClient` and an LLM-powered planner that decomposes goals into task DAGs. These are the two components that make the system actually useful — without them, skills return canned strings and plans are hardcoded.

## Files

- Create: `franken-orchestrator/src/skills/llm-skill-handler.ts`
- Create: `franken-orchestrator/src/skills/llm-planner.ts`
- Create: `franken-orchestrator/tests/unit/skills/llm-skill-handler.test.ts`
- Create: `franken-orchestrator/tests/unit/skills/llm-planner.test.ts`

## Context

`ILlmClient` from `@franken/types`:
```typescript
interface ILlmClient {
  complete(prompt: string): Promise<string>;
}
```

The firewall adapters (`ClaudeAdapter`, `OpenAIAdapter`, `OllamaAdapter`) implement `IAdapter` with `transformRequest → execute → transformResponse`. We need a thin wrapper that implements `ILlmClient` by calling an `IAdapter`.

## Success Criteria

- [ ] `LlmSkillHandler` class with `execute(objective: string, context: MemoryContext): Promise<{ output: string; tokensUsed: number }>`
- [ ] `LlmSkillHandler` constructs a prompt from objective + context (ADRs, rules, known errors)
- [ ] `LlmSkillHandler` calls `ILlmClient.complete(prompt)` and returns the response
- [ ] `LlmSkillHandler` handles LLM errors gracefully (wraps in descriptive error)
- [ ] `LlmPlanner` class with `createPlan(intent: PlanIntent): Promise<PlanGraph>`
- [ ] `LlmPlanner` sends a structured prompt asking the LLM to decompose the goal into tasks
- [ ] `LlmPlanner` parses the LLM JSON response into a valid `PlanGraph`
- [ ] `LlmPlanner` handles malformed LLM responses (falls back to single-task plan)
- [ ] Unit tests for both using a mock `ILlmClient`
- [ ] TypeScript compiles

## Verification Command

```bash
cd franken-orchestrator && npx vitest run tests/unit/skills/ && npx tsc --noEmit
```

## Hardening Requirements

### LlmSkillHandler
- Prompt template must include: objective, ADRs from context, rules, known errors
- Response must be returned as-is (no parsing) — the skill output is the LLM's text
- `tokensUsed` can be estimated from prompt + response length (rough heuristic) since the ILlmClient doesn't return token counts
- Error from `ILlmClient.complete()` must be caught and re-thrown with context: `Skill execution failed for objective "${objective}": ${error.message}`

### LlmPlanner
- Prompt must ask for JSON output in this exact format:
  ```json
  { "tasks": [{ "id": "t1", "objective": "...", "requiredSkills": ["llm-generate"], "dependsOn": [] }] }
  ```
- Parse with `JSON.parse()` wrapped in try-catch
- If JSON parse fails, fall back to single task: `[{ id: "t1", objective: intent.goal, requiredSkills: ["llm-generate"], dependsOn: [] }]`
- All generated tasks should use `requiredSkills: ["llm-generate"]` as default skill
- Task IDs must be unique strings (use `t1`, `t2`, etc.)
- `dependsOn` chains must not create cycles (validate with simple check)

### ILlmClient Wrapper
- Create: `franken-orchestrator/src/adapters/adapter-llm-client.ts`
- Class `AdapterLlmClient` implements `ILlmClient` from `@franken/types`
- Constructor takes a firewall `IAdapter` (ClaudeAdapter, OpenAIAdapter, etc.)
- `complete(prompt)` calls `adapter.transformRequest() → adapter.execute() → adapter.transformResponse()` and returns the response text
- This bridges the firewall adapter interface to ILlmClient
