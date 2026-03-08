import { GovernorCritiqueAdapter } from './governor-critique-adapter.js';
import { type ReadlineAdapter } from '../channels/cli-channel.js';
import type { GovernorMemoryPort } from '../audit/governor-memory-port.js';
import type { TriggerEvaluator } from '../triggers/trigger-evaluator.js';
export interface CreateGovernorOptions {
    readonly readline: ReadlineAdapter;
    readonly memoryPort: GovernorMemoryPort;
    readonly evaluators?: ReadonlyArray<TriggerEvaluator>;
    readonly projectId?: string;
    readonly operatorName?: string;
}
export declare function createGovernor(options: CreateGovernorOptions): GovernorCritiqueAdapter;
//# sourceMappingURL=governor-factory.d.ts.map