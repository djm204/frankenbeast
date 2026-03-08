# Chunk 06: Wire ProgressLlmClient into runPlan()

## Objective

Add spinner progress feedback to the plan decomposition phase (`runPlan()`) so the user sees a spinner while the LLM decomposes the design doc into execution chunks.

Depends on chunks 01-02 (Spinner + ProgressLlmClient).

## Files

- **Modify**: `franken-orchestrator/src/cli/session.ts` (`runPlan()` method only)

## Context

Read `franken-orchestrator/src/cli/session.ts` — the `runPlan()` method creates an `AdapterLlmClient` and passes it to `LlmGraphBuilder`. The change is a single-line wrap.

## Success Criteria

- [ ] `runPlan()` wraps `adapterLlm` with `ProgressLlmClient` using label `'Decomposing design...'`
- [ ] `LlmGraphBuilder` receives the wrapped `progressLlm` client
- [ ] Revision path also goes through the wrapped client (it already does via `llmGraphBuilder`)
- [ ] Full test suite passes (no regressions)
- [ ] `npx tsc --noEmit` passes in `franken-orchestrator/`

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run
```

## Implementation

In `runPlan()`, change:

```typescript
const adapterLlm = new AdapterLlmClient(cliLlmAdapter);
const llmGraphBuilder = new LlmGraphBuilder(adapterLlm);
```

To:

```typescript
const adapterLlm = new AdapterLlmClient(cliLlmAdapter);
const progressLlm = new ProgressLlmClient(adapterLlm, { label: 'Decomposing design...' });
const llmGraphBuilder = new LlmGraphBuilder(progressLlm);
```

The `ProgressLlmClient` import should already be present from chunk 05.

## Hardening Requirements

- This is a 2-line change — do NOT refactor anything else in `runPlan()`
- Do NOT change any test expectations — the spinner is transparent to the API contract
- The revision callback in `runPlan()` calls `llmGraphBuilder.build()` which already uses the wrapped client — no additional changes needed for the revision path
