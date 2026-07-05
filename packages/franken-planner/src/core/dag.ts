import type { Task, TaskId } from './types.js';
import { CyclicDependencyError, DuplicateTaskError, TaskNotFoundError } from './errors.js';

export type { CyclicDependencyError, DuplicateTaskError, TaskNotFoundError };

export interface PlanVersion {
  version: number;
  graph: PlanGraph;
  reason: string;
  timestamp: Date;
}

export interface PlanGraphFromTasksOptions {
  version?: number;
  reason?: string;
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

  /**
   * Builds a graph from tasks in any order, using each task's dependsOn field.
   * Dependencies are validated before topological sorting so callers can hand
   * unsorted task arrays to the graph without duplicating DAG logic.
   */
  static fromTasks(tasks: Task[], options: PlanGraphFromTasksOptions = {}): PlanGraph {
    const nodes = new Map<TaskId, Task>();
    const edges = new Map<TaskId, Set<TaskId>>();

    for (const task of tasks) {
      if (nodes.has(task.id)) {
        throw new DuplicateTaskError(task.id);
      }
      nodes.set(task.id, task);
    }

    for (const task of tasks) {
      for (const depId of task.dependsOn) {
        if (!nodes.has(depId)) {
          throw new Error(`Dependency '${depId}' not found in graph`);
        }
      }
      edges.set(task.id, new Set(task.dependsOn));
    }

    const graph = new PlanGraph(nodes, edges, options.version ?? 0, options.reason ?? 'from tasks');
    const { sorted } = graph._kahn();
    if (sorted.length !== nodes.size) {
      const sortedIds = new Set(sorted);
      const stuck = Array.from(nodes.keys())
        .filter((id) => !sortedIds.has(id))
        .join(', ');
      throw new CyclicDependencyError(
        `Cannot build graph — ${nodes.size - sorted.length} task(s) have unresolvable dependencies (cycle): ${stuck}`
      );
    }

    const sortedNodes = new Map<TaskId, Task>();
    const sortedEdges = new Map<TaskId, Set<TaskId>>();

    for (const id of sorted) {
      sortedNodes.set(id, nodes.get(id) as Task);
      sortedEdges.set(id, new Set(edges.get(id) ?? []));
    }

    return new PlanGraph(
      sortedNodes,
      sortedEdges,
      options.version ?? 0,
      options.reason ?? 'from tasks'
    );
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
