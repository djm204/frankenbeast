import type { BeastContext } from '../context/franken-context.js';
import type { ISkillsModule, IGovernorModule, IMemoryModule, IObserverModule, PlanTask, IMcpModule, ILogger, ICheckpointStore } from '../deps.js';
import type { TaskOutcome } from '../types.js';
import type { CliSkillExecutor } from '../skills/cli-skill-executor.js';
export declare class HitlRejectedError extends Error {
    readonly taskId: string;
    readonly reason: string;
    constructor(taskId: string, reason: string);
}
/**
 * Beast Loop Phase 3: Validated Execution
 * Executes tasks from the plan in topological order.
 * For each task: check HITL → governor approval → execute → record trace → emit span.
 */
export declare function runExecution(ctx: BeastContext, skills: ISkillsModule, governor: IGovernorModule, memory: IMemoryModule, observer: IObserverModule, mcp?: IMcpModule, logger?: ILogger, cliExecutor?: CliSkillExecutor, checkpoint?: ICheckpointStore, refreshPlanTasks?: () => Promise<readonly PlanTask[]>): Promise<readonly TaskOutcome[]>;
//# sourceMappingURL=execution.d.ts.map