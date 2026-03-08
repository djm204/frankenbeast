import { CyclicDependencyError, DuplicateTaskError, TaskNotFoundError } from './errors.js';
export class PlanGraph {
    _nodes;
    _edges;
    version;
    reason;
    constructor(_nodes, _edges, version, reason) {
        this._nodes = _nodes;
        this._edges = _edges;
        this.version = version;
        this.reason = reason;
    }
    // ─── Factories ─────────────────────────────────────────────────────────────
    static empty() {
        return new PlanGraph(new Map(), new Map(), 0, 'initial');
    }
    /** Escape hatch for testing — builds a graph without validation (e.g. to force a cycle). */
    static createWithRawEdges(nodes, edges, version = 0, reason = 'test') {
        return new PlanGraph(nodes, edges, version, reason);
    }
    // ─── Queries ───────────────────────────────────────────────────────────────
    getTask(taskId) {
        return this._nodes.get(taskId);
    }
    getTasks() {
        return Array.from(this._nodes.values());
    }
    getDependencies(taskId) {
        return Array.from(this._edges.get(taskId) ?? []);
    }
    size() {
        return this._nodes.size;
    }
    hasCycle() {
        return this._kahn().sorted.length !== this._nodes.size;
    }
    // ─── Topological Sort ──────────────────────────────────────────────────────
    /**
     * Returns tasks ordered so every prerequisite appears before its dependents.
     * Throws CyclicDependencyError if the graph contains a cycle.
     */
    topoSort() {
        const { sorted } = this._kahn();
        if (sorted.length !== this._nodes.size) {
            throw new CyclicDependencyError(`Graph contains a cycle — ${this._nodes.size - sorted.length} task(s) unresolvable`);
        }
        return sorted.map((id) => this._nodes.get(id));
    }
    // ─── Mutations (all return new PlanGraph — immutable) ──────────────────────
    addTask(task, dependsOn = []) {
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
    removeTask(taskId) {
        if (!this._nodes.has(taskId)) {
            throw new TaskNotFoundError(taskId);
        }
        const newNodes = new Map(this._nodes);
        newNodes.delete(taskId);
        const newEdges = new Map();
        for (const [id, deps] of this._edges) {
            if (id === taskId)
                continue;
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
    insertFixItTask(failedTaskId, fixTask) {
        if (!this._nodes.has(failedTaskId)) {
            throw new TaskNotFoundError(failedTaskId);
        }
        const failedDeps = this._edges.get(failedTaskId) ?? new Set();
        const newNodes = new Map(this._nodes);
        newNodes.set(fixTask.id, fixTask);
        const newEdges = new Map();
        for (const [id, deps] of this._edges) {
            newEdges.set(id, new Set(deps));
        }
        newEdges.set(fixTask.id, new Set(failedDeps));
        newEdges.set(failedTaskId, new Set([fixTask.id]));
        return new PlanGraph(newNodes, newEdges, this.version + 1, `recovery: fix-it injected before '${failedTaskId}'`);
    }
    clone() {
        const nodes = new Map(this._nodes);
        const edges = new Map();
        for (const [id, deps] of this._edges) {
            edges.set(id, new Set(deps));
        }
        return new PlanGraph(nodes, edges, this.version, this.reason);
    }
    // ─── Private helpers ───────────────────────────────────────────────────────
    /** Kahn's BFS topological sort. Returns sorted ids (may be shorter than nodes if cyclic). */
    _kahn() {
        const inDegree = new Map();
        const dependents = new Map();
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
        const queue = [];
        for (const [id, deg] of inDegree) {
            if (deg === 0)
                queue.push(id);
        }
        const sorted = [];
        while (queue.length > 0) {
            const current = queue.shift();
            sorted.push(current);
            for (const dependent of dependents.get(current) ?? []) {
                const newDeg = (inDegree.get(dependent) ?? 0) - 1;
                inDegree.set(dependent, newDeg);
                if (newDeg === 0)
                    queue.push(dependent);
            }
        }
        return { sorted };
    }
}
export function createPlanVersion(graph, reason) {
    return { version: graph.version, graph, reason, timestamp: new Date() };
}
//# sourceMappingURL=dag.js.map