import type { Task, TaskId } from './types.js';
import { CyclicDependencyError, DuplicateTaskError, TaskNotFoundError } from './errors.js';
import { now as deterministicNow } from '@franken/types';

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

function cloneUnknown<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (typeof value === 'function') {
    throw new TypeError('Task metadata cannot contain functions because they cannot be cloned safely');
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  const existing = seen.get(value);
  if (existing !== undefined) {
    return existing as T;
  }

  if (value instanceof ArrayBuffer) {
    return value.slice(0) as T;
  }

  if (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer) {
    throw new TypeError('Task metadata cannot contain SharedArrayBuffer values');
  }

  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    const copiedBuffer = bytes.slice().buffer;
    if (value instanceof DataView) {
      return new DataView(copiedBuffer) as T;
    }
    const TypedArray = value.constructor as new (buffer: ArrayBuffer) => ArrayBufferView;
    return new TypedArray(copiedBuffer) as T;
  }

  if (Array.isArray(value)) {
    const clone: unknown[] = [];
    seen.set(value, clone);
    for (const item of value) {
      clone.push(cloneUnknown(item, seen));
    }
    return clone as T;
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }

  if (value instanceof RegExp) {
    return new RegExp(value.source, value.flags) as T;
  }

  if (value instanceof Set) {
    const clone = new Set<unknown>();
    seen.set(value, clone);
    for (const item of value) {
      clone.add(cloneUnknown(item, seen));
    }
    return clone as T;
  }

  if (value instanceof Map) {
    const clone = new Map<unknown, unknown>();
    seen.set(value, clone);
    for (const [key, mapValue] of value) {
      clone.set(cloneUnknown(key, seen), cloneUnknown(mapValue, seen));
    }
    return clone as T;
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Task metadata contains an unsupported mutable object');
  }

  const clone: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  seen.set(value, clone);
  for (const [key, objectValue] of Object.entries(value as Record<string, unknown>)) {
    Object.defineProperty(clone, key, {
      value: cloneUnknown(objectValue, seen),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return clone as T;
}

function cloneTask(task: Task): Task {
  const cloned: Task = {
    ...task,
    requiredSkills: [...task.requiredSkills],
    dependsOn: [...task.dependsOn],
  };
  if (task.metadata !== undefined) {
    cloned.metadata = cloneUnknown(task.metadata);
  }
  return cloned;
}

function cloneTaskMap(nodes: ReadonlyMap<TaskId, Task>): Map<TaskId, Task> {
  const cloned = new Map<TaskId, Task>();
  for (const [id, task] of nodes) {
    cloned.set(id, cloneTask(task));
  }
  return cloned;
}

function cloneEdgeMap(edges: ReadonlyMap<TaskId, ReadonlySet<TaskId>>): Map<TaskId, Set<TaskId>> {
  const cloned = new Map<TaskId, Set<TaskId>>();
  for (const [id, deps] of edges) {
    cloned.set(id, new Set(deps));
  }
  return cloned;
}

export class PlanGraph {
  private readonly _nodes: ReadonlyMap<TaskId, Task>;
  private readonly _edges: ReadonlyMap<TaskId, ReadonlySet<TaskId>>;

  private constructor(
    nodes: ReadonlyMap<TaskId, Task>,
    edges: ReadonlyMap<TaskId, ReadonlySet<TaskId>>,
    readonly version: number,
    readonly reason: string
  ) {
    this._nodes = cloneTaskMap(nodes);
    this._edges = cloneEdgeMap(edges);
  }

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
          throw new TaskNotFoundError(depId);
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
    const task = this._nodes.get(taskId);
    return task === undefined ? undefined : cloneTask(task);
  }

  getTasks(): Task[] {
    return Array.from(this._nodes.values(), cloneTask);
  }

  getDependencies(taskId: TaskId): TaskId[] {
    return Array.from(this._edges.get(taskId) ?? []);
  }

  size(): number {
    return this._nodes.size;
  }

  hasCycle(): boolean {
    this._assertEdgesReferenceKnownNodes();
    return this._kahn().sorted.length !== this._nodes.size;
  }

  // ─── Topological Sort ──────────────────────────────────────────────────────

  /**
   * Returns tasks ordered so every prerequisite appears before its dependents.
   * Throws CyclicDependencyError if the graph contains a cycle.
   */
  topoSort(): Task[] {
    this._assertEdgesReferenceKnownNodes();
    const { sorted } = this._kahn();
    if (sorted.length !== this._nodes.size) {
      throw new CyclicDependencyError(
        `Graph contains a cycle — ${this._nodes.size - sorted.length} task(s) unresolvable`
      );
    }
    return sorted.map((id) => cloneTask(this._nodes.get(id) as Task));
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
    newNodes.set(task.id, { ...task, dependsOn: [...dependsOn] });
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
      const task = newNodes.get(id);
      if (task) {
        newNodes.set(id, { ...task, dependsOn: [...cleaned] });
      }
    }
    return new PlanGraph(newNodes, newEdges, this.version, this.reason);
  }

  /**
   * @deprecated Use recovery/insertFixItTask instead. This compatibility shim
   * preserves the existing public API while recovery code owns the domain logic.
   */
  insertFixItTask(failedTaskId: TaskId, fixTask: Task): PlanGraph {
    if (!this._nodes.has(failedTaskId)) {
      throw new TaskNotFoundError(failedTaskId);
    }
    if (this._nodes.has(fixTask.id)) {
      throw new DuplicateTaskError(fixTask.id);
    }

    const tasks = this.getTasks().map((task) => {
      if (task.id === failedTaskId) {
        return { ...task, dependsOn: [fixTask.id] };
      }
      return { ...task, dependsOn: this.getDependencies(task.id) };
    });

    const fixTaskDependencies = [
      ...new Set([...this.getDependencies(failedTaskId), ...fixTask.dependsOn]),
    ];

    return PlanGraph.fromTasks(
      [...tasks, { ...fixTask, dependsOn: fixTaskDependencies }],
      {
        version: this.version + 1,
        reason: `recovery: fix-it injected before '${failedTaskId}'`,
      }
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

  private _assertEdgesReferenceKnownNodes(): void {
    for (const [id, deps] of this._edges) {
      if (!this._nodes.has(id)) {
        throw new Error(`Graph edge references unknown task node '${id}'`);
      }
      for (const dep of deps) {
        if (!this._nodes.has(dep)) {
          throw new Error(`Task '${id}' depends on unknown dependency node '${dep}'`);
        }
      }
    }
  }

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
  return { version: graph.version, graph, reason, timestamp: new Date(deterministicNow()) };
}
