# ADR-002: DAG as Custom Adjacency List (No External Graph Library)

**Date:** 2026-02-19
**Status:** Accepted
**Deciders:** franken-planner team

---

## Context

The planner's core data structure is a Directed Acyclic Graph where nodes are `Task` objects and directed edges represent "must complete before" dependencies. We need: construction, cycle detection, topological sort, and mutation (inserting fix-it subtasks during replanning).

## Decision

Implement a custom `PlanGraph` class using a `Map<string, Set<string>>` adjacency list. No external graph library.

```typescript
// Conceptual shape
interface Task {
  id: string;
  objective: string;
  requiredSkills: string[];
  status: TaskStatus;
  metadata?: Record<string, unknown>;
}

class PlanGraph {
  private nodes: Map<string, Task>;
  private edges: Map<string, Set<string>>; // id -> Set of dependency ids
}
```

Topological sort uses **Kahn's algorithm** (BFS-based), which naturally detects cycles via remaining in-degree > 0 after sort.

## Alternatives Considered

| Option                        | Reason Rejected                                                    |
| ----------------------------- | ------------------------------------------------------------------ |
| `@dagrejs/graphlib`           | Adds a dependency; API surface is JS-era, not typed for our domain |
| Adjacency matrix              | Sparse graphs waste memory; O(n²) for task counts we expect        |
| Flat array with `dependsOn[]` | No O(1) edge lookup; harder to do cycle detection                  |

## Consequences

- **Positive:** Zero external graph dependency. Full control over node schema.
- **Positive:** Kahn's algorithm is well-understood and easily unit-tested.
- **Negative:** Must maintain the implementation ourselves — but the scope is small and stable.
- **Note:** For ADR-007, mutations produce a new `PlanGraph` snapshot (immutable), so `PlanGraph` is designed as a value type with a `clone()` method.
