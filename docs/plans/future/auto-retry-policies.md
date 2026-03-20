# Future Enhancement: Auto-Retry Policies

**Date:** 2026-03-16
**Status:** Documented for future implementation
**Prerequisite:** Plan 1 (Foundation) must be complete

---

## Problem

When an agent process crashes (non-zero exit), Plan 1 records the failure and notifies the operator. The operator must manually restart. For idempotent workflows (like `martin-loop` with checkpoint resume), automatic retry with backoff would reduce operator intervention.

## Proposed Design: Configurable Per-Definition Retry

Each `BeastDefinition` declares a retry policy:

```typescript
interface RetryPolicy {
  maxRetries: number;           // 0 = no retry (default)
  backoffMs: number;            // initial backoff delay
  backoffMultiplier: number;    // exponential backoff factor
  maxBackoffMs: number;         // backoff cap
  retryableExitCodes: number[]; // only retry these codes (empty = all non-zero)
}
```

**Example policies:**

| Definition | Policy | Rationale |
|-----------|--------|-----------|
| `martin-loop` | `{ maxRetries: 3, backoffMs: 5000, retryableExitCodes: [1] }` | Has checkpoint resume — safe to retry |
| `chunk-plan` | `{ maxRetries: 1, backoffMs: 10000, retryableExitCodes: [1] }` | Planning is mostly idempotent |
| `design-interview` | `{ maxRetries: 0 }` | Interactive — don't auto-retry |

**Execution flow:**

1. Agent exits non-zero
2. `ProcessBeastExecutor.handleProcessExit` checks `definition.retryPolicy`
3. If retries remaining and exit code is retryable:
   - Create new `BeastRunAttempt` (attempt number incremented)
   - Schedule spawn after backoff delay
   - Append `attempt.retry_scheduled` event with `{ attemptNumber, backoffMs, reason }`
4. If max retries exhausted:
   - Mark run as `failed` (same as Plan 1)
   - Append `attempt.retries_exhausted` event

**Dashboard:**
- Attempt history shown in detail panel (attempt 1: failed, attempt 2: failed, attempt 3: running)
- Each attempt has its own log file (already supported by `BeastLogStore` path structure)

## Alternative: Simple Retry (No Per-Definition Config)

Global retry policy applied to all definitions. Simpler but less safe — interactive workflows would get retried inappropriately.

**Rejected because:** The risk of retrying a non-idempotent workflow (duplicate work, corrupted state) outweighs the simplicity benefit.

## Why Deferred

- Plan 1's "record and notify" approach is safe and sufficient for initial release
- `martin-loop` already has internal retry/checkpoint logic — double-retrying at the process level could conflict
- Retry policies need careful testing with each workflow type to avoid surprising behavior
- Auto-retry without operator awareness can mask systemic issues (bad config, missing deps)
