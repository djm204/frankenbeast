import { GovernorCritiqueAdapter } from './governor-critique-adapter.js';
import { GovernorAuditRecorder } from '../audit/audit-recorder.js';
import { CliChannel } from '../channels/cli-channel.js';
import { defaultConfig } from '../core/config.js';
export function createGovernor(options) {
    const config = defaultConfig();
    const channel = new CliChannel({
        readline: options.readline,
        operatorName: options.operatorName ?? config.operatorName,
    });
    const auditRecorder = new GovernorAuditRecorder(options.memoryPort);
    return new GovernorCritiqueAdapter({
        channel,
        auditRecorder,
        evaluators: options.evaluators ?? [],
        projectId: options.projectId ?? 'default',
    });
}
//# sourceMappingURL=governor-factory.js.map