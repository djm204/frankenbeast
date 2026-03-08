export class LlmPlanner {
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
            '{ "tasks": [{ "id": "t1", "objective": "...", "requiredSkills": ["llm-generate"], "dependsOn": [] }] }',
        ].join('\n');
    }
    parsePlan(response, intent) {
        const fallback = this.singleTaskPlan(intent.goal);
        try {
            const parsed = JSON.parse(response);
            if (!parsed || !Array.isArray(parsed.tasks)) {
                return fallback;
            }
            const rawTasks = parsed.tasks;
            if (rawTasks.length === 0) {
                return fallback;
            }
            const idMap = this.buildIdMap(rawTasks);
            const tasks = rawTasks.map((task, index) => this.coerceTask(task, index, intent.goal, idMap));
            if (this.hasCycle(tasks)) {
                return fallback;
            }
            return { tasks };
        }
        catch {
            return fallback;
        }
    }
    buildIdMap(rawTasks) {
        const idMap = new Map();
        rawTasks.forEach((task, index) => {
            const rawId = typeof task?.id === 'string' && task.id.trim().length > 0
                ? task.id.trim()
                : `t${index + 1}`;
            idMap.set(rawId, `t${index + 1}`);
        });
        return idMap;
    }
    coerceTask(raw, index, fallbackObjective, idMap) {
        const objective = typeof raw?.objective === 'string' && raw.objective.trim().length > 0
            ? raw.objective.trim()
            : fallbackObjective;
        const dependsOn = Array.isArray(raw?.dependsOn)
            ? raw.dependsOn
                .filter((dep) => typeof dep === 'string')
                .map(dep => idMap.get(dep))
                .filter((dep) => typeof dep === 'string')
            : [];
        return {
            id: `t${index + 1}`,
            objective,
            requiredSkills: ['llm-generate'],
            dependsOn,
        };
    }
    hasCycle(tasks) {
        const byId = new Map(tasks.map(task => [task.id, task]));
        const visiting = new Set();
        const visited = new Set();
        const visit = (id) => {
            if (visiting.has(id))
                return true;
            if (visited.has(id))
                return false;
            visiting.add(id);
            const task = byId.get(id);
            for (const dep of task?.dependsOn ?? []) {
                if (visit(dep))
                    return true;
            }
            visiting.delete(id);
            visited.add(id);
            return false;
        };
        for (const task of tasks) {
            if (visit(task.id)) {
                return true;
            }
        }
        return false;
    }
    singleTaskPlan(goal) {
        return {
            tasks: [
                {
                    id: 't1',
                    objective: goal,
                    requiredSkills: ['llm-generate'],
                    dependsOn: [],
                },
            ],
        };
    }
}
//# sourceMappingURL=llm-planner.js.map