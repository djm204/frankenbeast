import type { HeartbeatReport, Action } from '../core/types.js';
import type { HeartbeatConfig } from '../core/config.js';
import type { IMemoryModule } from '../modules/memory.js';
import type { IObservabilityModule } from '../modules/observability.js';
import type { IPlannerModule } from '../modules/planner.js';
import type { ICritiqueModule } from '../modules/critique.js';
import type { IHitlGateway } from '../modules/hitl.js';
import type { ILlmClient } from '../reflection/types.js';
import type { GitStatusResult } from '../checker/deterministic-checker.js';
import { DeterministicChecker } from '../checker/deterministic-checker.js';
import { ReflectionEngine } from '../reflection/reflection-engine.js';
import { ActionDispatcher } from '../reporter/action-dispatcher.js';
import { parseChecklist } from '../checklist/parser.js';
import { writeChecklist } from '../checklist/writer.js';
import { buildMorningBrief } from '../reporter/morning-brief-builder.js';

export interface PulseOrchestratorDeps {
  readonly memory: IMemoryModule;
  readonly observability: IObservabilityModule;
  readonly planner: IPlannerModule;
  readonly critique: ICritiqueModule;
  readonly hitl: IHitlGateway;
  readonly llm: ILlmClient;
  readonly gitStatusExecutor: () => Promise<GitStatusResult>;
  readonly clock: () => Date;
  readonly config: HeartbeatConfig;
  readonly readFile: (path: string) => Promise<string>;
  readonly writeFile: (path: string, content: string) => Promise<void>;
  readonly projectId: string;
}

export class PulseOrchestrator {
  private readonly deps: PulseOrchestratorDeps;

  constructor(deps: PulseOrchestratorDeps) {
    this.deps = deps;
  }

  async run(): Promise<HeartbeatReport> {
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
    const actions: Action[] = [
      { type: 'morning_brief' as const, payload: {} },
      ...reflection.improvements.map((imp) => ({
        type: 'skill_proposal' as const,
        payload: { description: imp.description, priority: imp.priority },
      })),
    ];

    const report: HeartbeatReport = { timestamp, pulseResult, reflection, actions };

    const dispatcher = new ActionDispatcher({
      planner: this.deps.planner,
      hitl: this.deps.hitl,
    });
    await dispatcher.dispatch(actions, report);

    // Phase 6: Write updated checklist
    await this.deps.writeFile(
      this.deps.config.heartbeatFilePath,
      writeChecklist(checklist),
    );

    return report;
  }
}
