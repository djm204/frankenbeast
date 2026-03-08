export class LinearPlanner {
    name = 'linear';
    /**
     * Executes tasks one-by-one in topological order.
     * Stops on the first failure and returns a 'failed' PlanResult.
     * All results accumulated up to and including the failing task are preserved.
     */
    async execute(graph, context) {
        const tasks = graph.topoSort();
        const taskResults = [];
        for (const task of tasks) {
            const result = await context.executor(task);
            taskResults.push(result);
            if (result.status === 'failure') {
                return {
                    status: 'failed',
                    taskResults,
                    failedTaskId: task.id,
                    error: result.error,
                };
            }
        }
        return { status: 'completed', taskResults };
    }
}
//# sourceMappingURL=linear.js.map