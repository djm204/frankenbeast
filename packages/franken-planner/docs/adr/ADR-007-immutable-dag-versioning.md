# ADR-007: Immutable DAG with Versioned Snapshots for Replanning

**Date:** 2026-02-19
**Status:** Accepted
**Deciders:** franken-planner team

---

## Context

Dynamic replanning (section 2.2 of the project outline) and the self-correction loop (section 6) require mutating the DAG — inserting "fix-it" subtasks, re-ordering, or pruning failed branches. Mutable in-place changes make it difficult to audit what changed between plan versions and can introduce subtle bugs where partial mutations leave the graph in an inconsistent state.

## Decision

`PlanGraph` is **immutable**. All mutation operations return a **new `PlanGraph`** instance. The `Planner` maintains an ordered `PlanVersion[]` array — a log of every graph snapshot with a reason for the change.

```typescript
interface PlanVersion {
  version: number;
  graph: PlanGraph;          // immutable snapshot
  reason: string;            // e.g., "recovery: inject fix-it for T-003 TypeError"
  timestamp: Date;
}

// Mutation API on PlanGraph — always returns a new instance
class PlanGraph {
  addTask(task: Task, dependsOn?: string[]): PlanGraph { ... }
  removeTask(taskId: string): PlanGraph { ... }
  insertFixItTask(afterTaskId: string, fixTask: Task): PlanGraph { ... }
  clone(): PlanGraph { ... }
}
```

The `Planner` holds the current version index and can reference any prior version for debugging or rollback.

## Alternatives Considered

| Option                            | Reason Rejected                                                     |
| --------------------------------- | ------------------------------------------------------------------- |
| Mutable in-place graph            | Hard to audit; risk of inconsistent state during partial mutations  |
| Copy-on-write only for mutations  | Same as this decision but less explicit about the versioning intent |
| Event sourcing (store diffs only) | Overkill for this scope; full snapshots are small enough            |

## Consequences

- **Positive:** Complete audit trail of every plan mutation — essential for a self-correcting agent.
- **Positive:** "Undo" / rollback to a prior plan version is trivial.
- **Positive:** No defensive copying needed in consumer code — graphs can be shared freely.
- **Negative:** Higher memory use than in-place mutation — acceptable given task graph sizes (tens to low hundreds of nodes).
- **Mitigation:** Snapshots share unchanged node references via structural sharing (shallow clone of `Map`).
