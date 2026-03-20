# Chunk 6.2: Reflection Runtime Trigger

**Phase:** 6 — Absorb Reflection into Critique
**Depends on:** Chunk 6.1 (ReflectionEvaluator)
**Estimated size:** Medium (~120 lines + tests)

---

## Purpose

Restore heartbeat's lost "periodic self-assessment" behavior through the existing orchestrator heartbeat port. Defining `ReflectionEvaluator` is not enough; the system also needs a runtime hook controlled by an explicit config flag so reflection actually runs during a beast loop.

## Implementation

### 1. Extend run config

Add an explicit flag back to `RunConfig`:

```typescript
export interface RunConfig {
  // existing fields...
  reflection?: boolean;
}
```

Config example:

```yaml
reflection: true
```

### 2. Add a phase-boundary trigger helper

```typescript
// packages/franken-orchestrator/src/beast-loop.ts

private async maybeRunReflection(stage: 'after-planning' | 'after-execution'): Promise<void> {
  if (!this.runConfig.reflection) return;

  const pulse = await this.deps.heartbeat.pulse();

  this.deps.logger.info('reflection', {
    stage,
    summary: pulse.summary,
    improvements: pulse.improvements.length,
    techDebt: pulse.techDebt.length,
  });

  this.deps.observer.startSpan(`reflection:${stage}`).end({
    summary: pulse.summary,
    improvements: pulse.improvements,
    techDebt: pulse.techDebt,
  });
}
```

### 3. Invoke it at phase boundaries

Call `maybeRunReflection()`:
- after planning completes
- after execution completes

This satisfies the ADR's "periodic self-assessment" requirement without rewriting execution internals. v1 is intentionally conservative: phase boundaries, not per-step reflection.

### 4. Failure handling

Reflection is advisory in v1:
- reflection failures do not fail the whole run
- log and observe the failure
- continue execution

### 5. Forward compatibility with Phase 8

This chunk uses the existing `deps.heartbeat` port. In Phase 8, `ReflectionHeartbeatAdapter` becomes the implementation behind that port. The runtime trigger remains unchanged.

## Tests

```typescript
describe('reflection runtime trigger', () => {
  it('does not call heartbeat when reflection flag is absent', async () => { ... });
  it('calls heartbeat after planning when reflection=true', async () => { ... });
  it('calls heartbeat after execution when reflection=true', async () => { ... });
  it('records reflection output through logger/observer', async () => { ... });
  it('swallows reflection errors and continues the run', async () => { ... });
});
```

## Files

- **Modify:** `packages/franken-orchestrator/src/cli/run-config-loader.ts` — add `reflection?: boolean`
- **Modify:** `packages/franken-orchestrator/src/beast-loop.ts` — add `maybeRunReflection()` and invoke at phase boundaries
- **Add/Modify:** `packages/franken-orchestrator/tests/integration/beast-loop-reflection.test.ts`

## Exit Criteria

- `reflection: true` is a supported run-config field
- Reflection runs after planning and after execution through `deps.heartbeat`
- Reflection results are logged/observed
- Reflection failures are non-fatal
- Tests prove enabled/disabled behavior and phase-boundary triggering
