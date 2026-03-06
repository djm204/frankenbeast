# Chunk 02: ChunkFileGraphBuilder

## Objective

Create a `GraphBuilder` implementation that reads numbered `.md` chunk files from a directory and produces a `PlanGraph` with impl+harden task pairs. This is Mode 1 (pre-written chunks) — no LLM needed.

## Files

- **Create**: `franken-orchestrator/src/planning/chunk-file-graph-builder.ts`
- **Create**: `franken-orchestrator/tests/unit/chunk-file-graph-builder.test.ts`
- **Modify**: `franken-orchestrator/src/index.ts` — export `ChunkFileGraphBuilder`

## Key Reference Files

- `franken-planner/src/planners/types.ts` — `GraphBuilder` interface: `build(intent: Intent): Promise<PlanGraph>`
- `franken-planner/src/core/dag.ts` — `PlanGraph` class: `.addTask(task, dependsOn)`
- `franken-planner/src/core/types.ts` — `Task`, `Intent` types
- `plan-beast-runner/build-runner.ts` lines 322-328 — existing `discoverChunks()` logic
- `franken-orchestrator/src/skills/cli-types.ts` — `CliSkillConfig`

## Design

```typescript
class ChunkFileGraphBuilder implements GraphBuilder {
  constructor(private readonly chunkDir: string) {}

  async build(intent: Intent): Promise<PlanGraph> {
    // 1. Discover .md files matching /^\d{2}/ pattern (exclude 00_)
    // 2. Sort alphabetically
    // 3. For each chunk file, create two tasks:
    //    - impl:<chunkId> with requiredSkills: ['cli:<chunkId>']
    //      executionType: 'cli', objective: impl prompt from chunk content
    //    - harden:<chunkId> with requiredSkills: ['cli:<chunkId>']
    //      executionType: 'cli', objective: harden prompt from chunk content
    // 4. Wire dependencies:
    //    - impl:01 depends on nothing
    //    - harden:01 depends on impl:01
    //    - impl:02 depends on harden:01
    //    - harden:02 depends on impl:02
    //    - ... and so on
    // 5. Return PlanGraph
  }
}
```

## Success Criteria

- [ ] `ChunkFileGraphBuilder` implements `GraphBuilder` interface from franken-planner
- [ ] Discovers `.md` files matching `^\d{2}` pattern, excludes `00_` prefix
- [ ] Sorts files alphabetically (natural chunk ordering)
- [ ] Creates two `PlanTask` entries per chunk: `impl:<chunkId>` and `harden:<chunkId>`
- [ ] Impl task objective contains the chunk file content as the implementation prompt
- [ ] Harden task objective contains the chunk file content as the hardening prompt
- [ ] Dependencies wired correctly: `harden:N` depends on `impl:N`, `impl:N+1` depends on `harden:N`
- [ ] `requiredSkills` includes `cli:<chunkId>` with `executionType: 'cli'`
- [ ] Empty directory produces empty `PlanGraph`
- [ ] Test with mock filesystem (tmp directory with sample chunk files)
- [ ] All tests pass: `cd franken-orchestrator && npx vitest run tests/unit/chunk-file-graph-builder.test.ts`
- [ ] `npx tsc --noEmit` passes

## Verification Command

```bash
cd franken-orchestrator && npx vitest run tests/unit/chunk-file-graph-builder.test.ts && npx tsc --noEmit
```

## Hardening Requirements

- Must handle directories that don't exist (throw descriptive error)
- Must handle directories with no matching `.md` files (return empty PlanGraph)
- Chunk file content is read with `readFileSync` — no async filesystem ops needed
- Prompt templates for impl and harden should match the build-runner's existing prompts
- Do NOT import from `franken-planner` directly — use the interfaces re-exported via `@franken/types` or define locally compatible types
- Use `.js` extensions in all import paths (NodeNext)
- Do NOT modify any existing phase files in this chunk
