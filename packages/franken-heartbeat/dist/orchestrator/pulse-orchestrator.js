import { DeterministicChecker } from '../checker/deterministic-checker.js';
import { ReflectionEngine } from '../reflection/reflection-engine.js';
import { ActionDispatcher } from '../reporter/action-dispatcher.js';
import { parseChecklist } from '../checklist/parser.js';
import { writeChecklist } from '../checklist/writer.js';
export class PulseOrchestrator {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    async run() {
        const timestamp = this.deps.clock().toISOString();
        // Phase 1: Read and parse checklist
        const checklistContent = await this.deps.readFile(this.deps.config.heartbeatFilePath);
        const checklist = parseChecklist(checklistContent);
        // Phase 2: Deterministic check (cheap)
        const checker = new DeterministicChecker({
            observability: this.deps.observability,
            gitStatusExecutor: this.deps.gitStatusExecutor,
            clock: this.deps.clock,
            config: this.deps.config,
        });
        const pulseResult = await checker.check(checklist.watchlist);
        // If no flags, return early (zero LLM cost)
        if (pulseResult.status === 'HEARTBEAT_OK') {
            return { timestamp, pulseResult, actions: [] };
        }
        // Phase 3: Self-reflection (expensive)
        const engine = new ReflectionEngine({
            llm: this.deps.llm,
            memory: this.deps.memory,
            observability: this.deps.observability,
            maxReflectionTokens: this.deps.config.maxReflectionTokens,
        });
        const reflectionResult = await engine.reflect(this.deps.projectId);
        if (!reflectionResult.ok) {
            return { timestamp, pulseResult, actions: [] };
        }
        const reflection = reflectionResult.value;
        // Phase 4: Critique audit
        const audit = await this.deps.critique.auditConclusions(reflection);
        if (!audit.passed) {
            return { timestamp, pulseResult, reflection, actions: [] };
        }
        // Phase 5: Build actions and dispatch
        const actions = [
            { type: 'morning_brief', payload: {} },
            ...reflection.improvements.map((imp) => ({
                type: 'skill_proposal',
                payload: { description: imp.description, priority: imp.priority },
            })),
        ];
        const report = { timestamp, pulseResult, reflection, actions };
        const dispatcher = new ActionDispatcher({
            planner: this.deps.planner,
            hitl: this.deps.hitl,
        });
        await dispatcher.dispatch(actions, report);
        // Phase 6: Write updated checklist
        await this.deps.writeFile(this.deps.config.heartbeatFilePath, writeChecklist(checklist));
        return report;
    }
}
//# sourceMappingURL=pulse-orchestrator.js.map