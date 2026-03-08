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

export type PulseResultPort =
  | { status: 'HEARTBEAT_OK' }
  | { status: 'FLAGS_FOUND'; flags: { source: string; description: string; severity: string }[] };

export interface ReflectionResultPort {
  patterns: string[];
  improvements: { target: string; description: string; priority: string }[];
  techDebt: { location: string; description: string; effort: string }[];
}

export interface HeartbeatPortAdapterDeps {
  pulseOrchestrator: PulseOrchestratorPort;
}

export class HeartbeatPortAdapter implements IHeartbeatModule {
  private readonly pulseOrchestrator: PulseOrchestratorPort;

  constructor(deps: HeartbeatPortAdapterDeps) {
    this.pulseOrchestrator = deps.pulseOrchestrator;
  }

  async pulse(): Promise<HeartbeatPulseResult> {
    try {
      const report = await this.pulseOrchestrator.run();
      const improvements = report.reflection?.improvements.map(i => i.description) ?? [];
      const techDebt = report.reflection?.techDebt.map(td => `${td.location}: ${td.description}`) ?? [];

      return {
        improvements,
        techDebt,
        summary: buildSummary(report.pulseResult, improvements.length),
      };
    } catch (error) {
      throw new Error(`HeartbeatPortAdapter failed: ${errorMessage(error)}`, { cause: error });
    }
  }
}

function buildSummary(pulseResult: PulseResultPort, improvementCount: number): string {
  if (pulseResult.status === 'HEARTBEAT_OK') {
    return 'Heartbeat OK';
  }

  const count = pulseResult.flags.length;
  const improvementSuffix = improvementCount > 0 ? ` with ${improvementCount} improvements` : '';
  return `Heartbeat flags found (${count})${improvementSuffix}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
