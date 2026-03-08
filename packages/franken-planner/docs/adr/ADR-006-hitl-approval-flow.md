# ADR-006: HITL via Markdown Checklist Export + Async Promise Approval

**Date:** 2026-02-19
**Status:** Accepted
**Deciders:** franken-planner team

---

## Context

For "0 to 1" builds, the Planner must pause and present the full plan to the user before execution. The user may: approve, modify a specific task, or abort. This loop must be non-blocking and portable across different UIs (CLI, web, IDE extension).

## Decision

The HITL flow has two components:

### 1. Plan Export (Markdown Checklist)

`PlanExporter.toMarkdown(graph: PlanGraph): string` renders the DAG as a Markdown checklist ordered by topological sort:

```markdown
## Execution Plan

- [ ] **[T-001]** Define database schema
      _Skills: schema-designer_
      _Depends on: none_

- [ ] **[T-002]** Generate migration
      _Skills: db-migrator_
      _Depends on: T-001_
```

### 2. Async Approval Gate

`HITLGate` exposes a single async method:

```typescript
interface HITLGate {
  requestApproval(plan: string): Promise<ApprovalResult>;
}

type ApprovalResult =
  | { decision: 'approved' }
  | { decision: 'modified'; changes: TaskModification[] }
  | { decision: 'aborted'; reason: string };
```

The concrete implementation is injected (see ADR-005). The CLI adapter reads from stdin; a web adapter resolves via HTTP webhook. Tests use a stub that auto-approves.

## Alternatives Considered

| Option                              | Reason Rejected                                                    |
| ----------------------------------- | ------------------------------------------------------------------ |
| Synchronous blocking call           | Blocks the process; incompatible with async agent runtimes         |
| Custom JSON format for plan         | Markdown is human-readable without tooling; works in any interface |
| Embedding approval logic in Planner | Couples UI concerns to planning logic                              |

## Consequences

- **Positive:** Portable across any UI — CLI, web, IDE — by swapping the `HITLGate` adapter.
- **Positive:** Markdown export is immediately useful as documentation/audit trail.
- **Positive:** `ApprovalResult` discriminated union forces explicit handling of all three outcomes.
- **Negative:** Concrete `HITLGate` implementations must be built per deployment target — acceptable as they are thin adapters.
