export class PlannerPortAdapter {
    llmClient;
    constructor(llmClient) {
        this.llmClient = llmClient;
    }
    async createPlan(intent) {
        const prompt = this.buildPrompt(intent);
        const response = await this.llmClient.complete(prompt);
        return this.parsePlan(response, intent);
    }
    buildPrompt(intent) {
        const context = intent.context ? JSON.stringify(intent.context) : '{}';
        return [
            'You are a planner. Decompose the goal into a task DAG.',
            `Goal: ${intent.goal}`,
            `Strategy: ${intent.strategy ?? 'none'}`,
            `Context: ${context}`,
            'Return ONLY valid JSON with shape:',
            '{"tasks":[{"id":"task-1","objective":"...","requiredSkills":["skill"],"dependsOn":[]}]}',
        ].join('\n');
    }
    parsePlan(response, intent) {
        const fallback = this.singleTaskPlan(intent.goal);
        try {
            const parsed = JSON.parse(response);
            if (!parsed || !Array.isArray(parsed.tasks)) {
                return fallback;
            }
            const tasks = parsed.tasks
                .map((task, index) => this.coerceTask(task, index, intent.goal))
                .filter(Boolean);
            if (tasks.length === 0) {
                return fallback;
            }
            return { tasks };
        }
        catch {
            return fallback;
        }
    }
    coerceTask(task, index, fallbackObjective) {
        const candidate = task;
        const id = typeof candidate?.id === 'string' && candidate.id.trim().length > 0
            ? candidate.id
            : `task-${index + 1}`;
        const objective = typeof candidate?.objective === 'string' && candidate.objective.trim().length > 0
            ? candidate.objective
            : fallbackObjective;
        const requiredSkills = Array.isArray(candidate?.requiredSkills)
            ? candidate?.requiredSkills.filter((s) => typeof s === 'string')
            : [];
        const dependsOn = Array.isArray(candidate?.dependsOn)
            ? candidate?.dependsOn.filter((s) => typeof s === 'string')
            : [];
        return { id, objective, requiredSkills, dependsOn };
    }
    singleTaskPlan(goal) {
        return {
            tasks: [
                {
                    id: 'task-1',
                    objective: goal,
                    requiredSkills: [],
                    dependsOn: [],
                },
            ],
        };
    }
}
//# sourceMappingURL=planner-adapter.js.map