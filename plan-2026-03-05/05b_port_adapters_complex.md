# Chunk 05b: Port Adapters — Complex Modules + Barrel Export

## Objective

Create bridge adapters for the complex modules that require LLM or MCP integration: Skills, Planner, Critique. Add the barrel export index.

## Files

- Create: `franken-orchestrator/src/adapters/skills-adapter.ts`
- Create: `franken-orchestrator/src/adapters/planner-adapter.ts`
- Create: `franken-orchestrator/src/adapters/critique-adapter.ts`
- Create: `franken-orchestrator/src/adapters/index.ts`
- Create: `franken-orchestrator/tests/unit/adapters/skills-adapter.test.ts`
- Create: `franken-orchestrator/tests/unit/adapters/planner-adapter.test.ts`
- Create: `franken-orchestrator/tests/unit/adapters/critique-adapter.test.ts`

## Context

**MOD-02 Skills**: `franken-skills/src/registry/skill-registry.ts` — `SkillRegistry` class with `hasSkill(id)`, `getSkill(id)`, `getAll()`. No execute method — the adapter must implement execute().

**MOD-04 Planner**: `franken-planner/src/planner.ts` — `Planner` class with `plan(rawInput)`. For MVP: create a `SimplePlannerAdapter` that uses the LLM to decompose the user's goal into tasks.

**MOD-06 Critique**: `franken-critique/src/loop/critique-loop.ts` — `CritiqueLoop` with `run(input, config)`. `CritiquePipeline` composes evaluators.

Port interfaces from `franken-orchestrator/src/deps.ts`:
- `ISkillsModule`: `hasSkill(id)`, `getAvailableSkills()`, `execute(skillId, input): Promise<SkillResult>`
- `IPlannerModule`: `createPlan(intent): Promise<PlanGraph>`
- `ICritiqueModule`: `reviewPlan(plan, context?): Promise<CritiqueResult>`
- `IMcpModule`: `callTool(name, args)`, `getAvailableTools()`

Simple adapters from chunk 05a are already in `franken-orchestrator/src/adapters/`.

## Success Criteria

- [ ] `SkillsPortAdapter` implements `ISkillsModule` — wraps `SkillRegistry`, implements `execute()` by dispatching based on `executionType`
- [ ] `SkillsPortAdapter.execute()` dispatches: `'llm'` → `ILlmClient.complete()`, `'function'` → registered handler, `'mcp'` → `IMcpModule.callTool()`
- [ ] `SkillsPortAdapter` constructor takes `(registry: SkillRegistry, llmClient: ILlmClient, mcp?: IMcpModule)`
- [ ] `PlannerPortAdapter` implements `IPlannerModule` — uses `ILlmClient` to decompose goals into task DAGs (JSON prompt + parse)
- [ ] `PlannerPortAdapter` falls back to single-task plan on malformed LLM response
- [ ] `CritiquePortAdapter` implements `ICritiqueModule` — wraps `CritiqueLoop`, translates `PlanGraph → EvaluationInput` and `CritiqueLoopResult → CritiqueResult`
- [ ] Index barrel export from `franken-orchestrator/src/adapters/index.ts` exports all 8 adapters
- [ ] Unit tests for each adapter (mock the underlying module and ILlmClient)
- [ ] TypeScript compiles

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run tests/unit/adapters/
```

## Hardening Requirements

- `SkillsPortAdapter.execute()` is the critical one — it must:
  - Look up the skill descriptor to get `executionType`
  - For `executionType: 'llm'`: call `ILlmClient.complete()` with objective as prompt
  - For `executionType: 'function'`: call a registered handler function
  - For `executionType: 'mcp'`: delegate to `IMcpModule.callTool()`
  - Throw descriptive error if skill not found
- `PlannerPortAdapter` must produce valid `PlanGraph` with `tasks` array from LLM response
- `PlannerPortAdapter` JSON parse must be wrapped in try-catch with fallback to single task
- `CritiquePortAdapter` must translate between different module type conventions
- All adapters must be constructable with dependency injection (no global state)
- Barrel export must export everything from all adapter files
