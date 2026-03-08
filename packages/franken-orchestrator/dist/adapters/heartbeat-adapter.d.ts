import type { IHeartbeatModule, HeartbeatPulseResult } from '../deps.js';
export interface PulseOrchestratorPort {
    run(): Promise<HeartbeatReportPort>;
}
export interface HeartbeatReportPort {
    timestamp: string;
    pulseResult: PulseResultPort;
    reflection?: ReflectionResultPort;
    actions: unknown[];
}
export type PulseResultPort = {
    status: 'HEARTBEAT_OK';
} | {
    status: 'FLAGS_FOUND';
    flags: {
        source: string;
        description: string;
        severity: string;
    }[];
};
export interface ReflectionResultPort {
    patterns: string[];
    improvements: {
        target: string;
        description: string;
        priority: string;
    }[];
    techDebt: {
        location: string;
        description: string;
        effort: string;
    }[];
}
export interface HeartbeatPortAdapterDeps {
    pulseOrchestrator: PulseOrchestratorPort;
}
export declare class HeartbeatPortAdapter implements IHeartbeatModule {
    private readonly pulseOrchestrator;
    constructor(deps: HeartbeatPortAdapterDeps);
    pulse(): Promise<HeartbeatPulseResult>;
}
//# sourceMappingURL=heartbeat-adapter.d.ts.map