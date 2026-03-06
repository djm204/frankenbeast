# Chunk 07: LlmGraphBuilder — Design Doc Decomposition

## Objective

Create a `GraphBuilder` implementation that uses `ILlmClient.complete()` to decompose a design document into a `PlanGraph` with ordered impl+harden task pairs. This is Mode 2 (design-doc input).

## Files

- **Create**: `franken-orchestrator/src/planning/llm-graph-builder.ts`
- **Create**: `franken-orchestrator/tests/unit/llm-graph-builder.test.ts`
- **Modify**: `franken-orchestrator/src/index.ts` — export `LlmGraphBuilder`
- **Modify**: `plan-beast-runner/build-runner.ts` — wire `--mode design-doc` to `LlmGraphBuilder`

## Key Reference Files

- `franken-orchestrator/src/planning/chunk-file-graph-builder.ts` — chunk 02 (same output shape)
- `franken-planner/src/planners/types.ts` — `GraphBuilder` interface
- `franken-types/src/llm.ts` — `ILlmClient` interface: `complete(prompt: string): Promise<string>`
- `franken-planner/src/core/dag.ts` — `PlanGraph` class

## Design

```typescript
class LlmGraphBuilder implements GraphBuilder {
  constructor(
    private readonly llm: ILlmClient,
    private readonly options?: { maxChunks?: number },
  ) {}

  async build(intent: Intent): Promise<PlanGraph> {
    // 1. Build decomposition prompt from intent.goal (the design doc content)
    //    - Include instructions to produce JSON array of chunks
    //    - Each chunk: { id, objective, files, successCriteria, verificationCommand, dependencies }
    //    - Enforce TDD, atomic commits, context-aware sizing
    // 2. Call llm.complete(prompt)
    // 3. Parse JSON response (extract from markdown code fences if needed)
    // 4. Validate: no cycles, dependencies reference existing chunks
    // 5. For each chunk, create impl+harden task pair (same as ChunkFileGraphBuilder)
    // 6. Return PlanGraph
  }
}
```

**Decomposition prompt structure:**
- System context: project conventions, TDD mandate, chunk sizing rules
- Design doc content (from `intent.goal`)
- Output format: JSON array with required fields
- Constraints: max N chunks (default 12), each completable in 2-5 minutes

## Success Criteria

- [ ] `LlmGraphBuilder` implements `GraphBuilder` interface
- [ ] Sends decomposition prompt to `ILlmClient.complete()`
- [ ] Parses JSON response into chunk definitions
- [ ] Creates impl+harden task pairs per chunk (same shape as `ChunkFileGraphBuilder`)
- [ ] Dependencies wired correctly in PlanGraph
- [ ] Handles JSON wrapped in markdown code fences (```json ... ```)
- [ ] Validates no cyclic dependencies
- [ ] Throws descriptive error on unparseable LLM response
- [ ] Test with mock `ILlmClient` returning known JSON responses
- [ ] Test with malformed LLM responses (invalid JSON, cycles, missing fields)
- [ ] `--mode design-doc` in build-runner reads design doc file and uses `LlmGraphBuilder`
- [ ] All tests pass: `cd franken-orchestrator && npx vitest run tests/unit/llm-graph-builder.test.ts`
- [ ] `npx tsc --noEmit` passes

## Verification Command

```bash
cd franken-orchestrator && npx vitest run tests/unit/llm-graph-builder.test.ts && npx tsc --noEmit
```

## Hardening Requirements

- LLM response parsing must be defensive — handle extra whitespace, code fences, trailing commas
- Chunk IDs must be sanitized for use as git branch names (alphanumeric + underscores + hyphens)
- Maximum chunk count enforced (default 12) — if LLM produces more, truncate with warning
- Do NOT call a real LLM in tests — use mock `ILlmClient` with canned responses
- The decomposition prompt should reference the project's CLAUDE.md conventions (TDD, atomic commits)
- Do NOT import from `franken-brain` directly — use `ILlmClient` from `@franken/types`
- Use `.js` extensions in all import paths (NodeNext)
