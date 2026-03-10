import type { Task, TaskId } from './types.js';
import { CyclicDependencyError, DuplicateTaskError, TaskNotFoundError } from './errors.js';

export type { CyclicDependencyError, DuplicateTaskError, TaskNotFoundError };

export interface PlanVersion {
  version: number;
  graph: PlanGraph;
  reason: string;
  timestamp: Date;
}

export class PlanGraph {
  private constructor(
    private readonly _nodes: ReadonlyMap<TaskId, Task>,
    private readonly _edges: ReadonlyMap<TaskId, ReadonlySet<TaskId>>,
    readonly version: number,
    readonly reason: string
  ) {}

  // ─── Factories ─────────────────────────────────────────────────────────────

  static empty(): PlanGraph {
    return new PlanGraph(new Map(), new Map(), 0, 'initial');
  }

  /** Escape hatch for testing — builds a graph without validation (e.g. to force a cycle). */
  static createWithRawEdges(
    nodes: Map<TaskId, Task>,
    edges: Map<TaskId, Set<TaskId>>,
    version = 0,
    reason = 'test'
  ): PlanGraph {
    return new PlanGraph(nodes, edges, version, reason);
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  getTask(taskId: TaskId): Task | undefined {
    return this._nodes.get(taskId);
  }

  getTasks(): Task[] {
    return Array.from(this._nodes.values());
  }

  getDependencies(taskId: TaskId): TaskId[] {
    return Array.from(this._edges.get(taskId) ?? []);
  }

  size(): number {
    return this._nodes.size;
  }

  hasCycle(): boolean {
    return this._kahn().sorted.length !== this._nodes.size;
  }

  // ─── Topological Sort ──────────────────────────────────────────────────────

  /**
   * Returns tasks ordered so every prerequisite appears before its dependents.
   * Throws CyclicDependencyError if the graph contains a cycle.
   */
  topoSort(): Task[] {
    const { sorted } = this._kahn();
    if (sorted.length !== this._nodes.size) {
      throw new CyclicDependencyError(
        `Graph contains a cycle — ${this._nodes.size - sorted.length} task(s) unresolvable`
      );
    }
    return sorted.map((id) => this._nodes.get(id) as Task);
  }

  // ─── Mutations (all return new PlanGraph — immutable) ──────────────────────

  addTask(task: Task, dependsOn: TaskId[] = []): PlanGraph {
    if (this._nodes.has(task.id)) {
      throw new DuplicateTaskError(task.id);
    }
    for (const depId of dependsOn) {
      if (!this._nodes.has(depId)) {
        throw new Error(`Dependency '${depId}' not found in graph`);
      }
    }
    const newNodes = new Map(this._nodes);
    newNodes.set(task.id, task);
    const newEdges = new Map(this._edges);
    newEdges.set(task.id, new Set(dependsOn));
    return new PlanGraph(newNodes, newEdges, this.version, this.reason);
  }

  removeTask(taskId: TaskId): PlanGraph {
    if (!this._nodes.has(taskId)) {
      throw new TaskNotFoundError(taskId);
    }
    const newNodes = new Map(this._nodes);
    newNodes.delete(taskId);
    const newEdges = new Map<TaskId, Set<TaskId>>();
    for (const [id, deps] of this._edges) {
      if (id === taskId) continue;
      const cleaned = new Set(deps);
      cleaned.delete(taskId);
      newEdges.set(id, cleaned);
    }
    return new PlanGraph(newNodes, newEdges, this.version, this.reason);
  }

  /**
   * Inserts `fixTask` as a prerequisite for `failedTaskId`:
   *   - fixTask inherits failedTask's current dependencies
   *   - failedTask's dependencies become {fixTask.id}
   * Increments version and sets a recovery reason.
   */
  insertFixItTask(failedTaskId: TaskId, fixTask: Task): PlanGraph {
    if (!this._nodes.has(failedTaskId)) {
      throw new TaskNotFoundError(failedTaskId);
    }
    const failedDeps = this._edges.get(failedTaskId) ?? new Set<TaskId>();

    const newNodes = new Map(this._nodes);
    newNodes.set(fixTask.id, fixTask);

    const newEdges = new Map<TaskId, Set<TaskId>>();
    for (const [id, deps] of this._edges) {
      newEdges.set(id, new Set(deps));
    }
    newEdges.set(fixTask.id, new Set(failedDeps));
    newEdges.set(failedTaskId, new Set([fixTask.id]));

    return new PlanGraph(
      newNodes,
      newEdges,
      this.version + 1,
      `recovery: fix-it injected before '${failedTaskId}'`
    );
  }

  clone(): PlanGraph {
    const nodes = new Map(this._nodes);
    const edges = new Map<TaskId, Set<TaskId>>();
    for (const [id, deps] of this._edges) {
      edges.set(id, new Set(deps));
    }
    return new PlanGraph(nodes, edges, this.version, this.reason);
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /** Kahn's BFS topological sort. Returns sorted ids (may be shorter than nodes if cyclic). */
  private _kahn(): { sorted: TaskId[] } {
    const inDegree = new Map<TaskId, number>();
    const dependents = new Map<TaskId, Set<TaskId>>();

    for (const id of this._nodes.keys()) {
      inDegree.set(id, 0);
      dependents.set(id, new Set());
    }
    for (const [id, deps] of this._edges) {
      inDegree.set(id, deps.size);
      for (const dep of deps) {
        dependents.get(dep)?.add(id);
      }
    }

    const queue: TaskId[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const sorted: TaskId[] = [];
    while (queue.length > 0) {
      const current = queue.shift() as TaskId;
      sorted.push(current);
      for (const dependent of dependents.get(current) ?? []) {
        const newDeg = (inDegree.get(dependent) ?? 0) - 1;
        inDegree.set(dependent, newDeg);
        if (newDeg === 0) queue.push(dependent);
      }
    }

    return { sorted };
  }
}

export function createPlanVersion(graph: PlanGraph, reason: string): PlanVersion {
  return { version: graph.version, graph, reason, timestamp: new Date() };
}
