# Chunk 04: IssueGraphBuilder — PlanGraph from Issues

## Objective

Implement `IssueGraphBuilder` that creates a `PlanGraph` for a single issue. One-shot issues get a single `impl:issue-<N>` + `harden:issue-<N>` task pair. Chunked issues use `LlmGraphBuilder`-style decomposition to produce multiple task pairs.

## Files

- **Create**: `franken-orchestrator/src/issues/issue-graph-builder.ts`
- **Modify**: `franken-orchestrator/src/issues/index.ts` (add export)
- **Test**: `franken-orchestrator/tests/unit/issues/issue-graph-builder.test.ts`

## Success Criteria

- [ ] `IssueGraphBuilder` class with `buildForIssue(issue: GithubIssue, triage: TriageResult): Promise<PlanGraph>` method
- [ ] One-shot path: creates 2 tasks — `impl:issue-<N>` (objective = issue body) and `harden:issue-<N>` (depends on impl)
- [ ] Chunked path: calls LLM to decompose issue into `ChunkDefinition[]`, then builds paired tasks per chunk
- [ ] Chunked task IDs follow pattern: `impl:issue-<N>/chunk-<M>`, `harden:issue-<N>/chunk-<M>`
- [ ] Chunked tasks have linear dependency chain (chunk 2 depends on chunk 1's harden, etc.)
- [ ] Constructor accepts LLM completion function for decomposition (same pattern as chunk 03)
- [ ] Decomposition prompt includes issue title, body, and acceptance criteria
- [ ] Reuses `parseResponse()` logic from `LlmGraphBuilder` for JSON chunk extraction
- [ ] All tests pass with mocked LLM
- [ ] `npx tsc --noEmit` passes

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run tests/unit/issues/issue-graph-builder.test.ts
```

## Hardening Requirements

- Reuse the `ChunkDefinition` interface from `franken-orchestrator/src/cli/file-writer.ts` — do NOT redefine it
- The decomposition prompt for chunked issues must be distinct from `LlmGraphBuilder.buildDecompositionPrompt()` — it takes an issue body, not a design doc
- One-shot impl task objective should include the full issue body (title + body + acceptance criteria if present)
- One-shot harden task objective: "Review and verify the fix for issue #N. Run tests. Check acceptance criteria."
- Do NOT create cross-issue dependencies — each issue's graph is independent
- PlanGraph construction: use `PlanGraph` from `@frankenbeast/planner` (same import as `LlmGraphBuilder`)
