/**
 * In-memory port implementations for E2E testing.
 * These maintain real state (unlike vi.fn() stubs) so the full Beast Loop
 * can execute with observable side effects.
 */

import type {
  IFirewallModule,
  FirewallResult,
  ISkillsModule,
  SkillDescriptor,
  SkillInput,
  SkillResult,
  IMemoryModule,
  MemoryContext,
  EpisodicEntry,
  IPlannerModule,
  PlanGraph,
  PlanIntent,
  IObserverModule,
  SpanHandle,
  TokenSpendData,
  ICritiqueModule,
  CritiqueResult,
  IGovernorModule,
  ApprovalPayload,
  ApprovalOutcome,
  IHeartbeatModule,
  ILogger,
} from '../../src/deps.js';

// ── Firewall ──

export interface InMemoryFirewallOptions {
  /** Words that trigger injection block. */
  blockedPatterns?: RegExp[];
  /** Words/patterns that get redacted (replaced with [REDACTED]). */
  piiPatterns?: RegExp[];
}

export class InMemoryFirewall implements IFirewallModule {
  readonly processedInputs: string[] = [];
  private readonly blockedPatterns: RegExp[];
  private readonly piiPatterns: RegExp[];

  constructor(options: InMemoryFirewallOptions = {}) {
    this.blockedPatterns = options.blockedPatterns ?? [/ignore previous/i, /system prompt/i];
    this.piiPatterns = options.piiPatterns ?? [
      /\b\d{3}-\d{2}-\d{4}\b/g,  // SSN
      /\b[\w.+-]+@[\w-]+\.[\w.]+\b/g,  // Email
    ];
  }

  async runPipeline(input: string): Promise<FirewallResult> {
    this.processedInputs.push(input);

    // Check for injection
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(input)) {
        return {
          sanitizedText: input,
          violations: [{ rule: 'injection', severity: 'block', detail: `Matched: ${pattern}` }],
          blocked: true,
        };
      }
    }

    // PII redaction
    let sanitized = input;
    const warnings: FirewallResult['violations'] = [];
    for (const pattern of this.piiPatterns) {
      const matches = sanitized.match(pattern);
      if (matches) {
        sanitized = sanitized.replace(pattern, '[REDACTED]');
        warnings.push({ rule: 'pii', severity: 'warn' as const, detail: `Redacted ${matches.length} match(es)` });
      }
    }

    return { sanitizedText: sanitized, violations: warnings, blocked: false };
  }
}

// ── Skills ──

export class InMemorySkills implements ISkillsModule {
  readonly executions: Array<{ skillId: string; input: SkillInput }> = [];
  private readonly skills: SkillDescriptor[];

  constructor(skills?: SkillDescriptor[]) {
    this.skills = skills ?? [
      { id: 'code-gen', name: 'Code Generation', requiresHitl: false, executionType: 'function' },
      { id: 'file-write', name: 'File Write', requiresHitl: true, executionType: 'function' },
      { id: 'search', name: 'Search', requiresHitl: false, executionType: 'function' },
    ];
  }

  hasSkill(skillId: string): boolean {
    return this.skills.some(s => s.id === skillId);
  }

  getAvailableSkills(): readonly SkillDescriptor[] {
    return this.skills;
  }

  async execute(skillId: string, input: SkillInput): Promise<SkillResult> {
    if (!this.hasSkill(skillId)) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    this.executions.push({ skillId, input });
    return {
      output: `Executed ${skillId}: ${input.objective}`,
      tokensUsed: 0,
    };
  }
}

// ── Memory ──

export class InMemoryMemory implements IMemoryModule {
  readonly traces: EpisodicEntry[] = [];
  private context: MemoryContext;

  constructor(context?: Partial<MemoryContext>) {
    this.context = {
      adrs: context?.adrs ?? ['Use TypeScript strict mode'],
      knownErrors: context?.knownErrors ?? [],
      rules: context?.rules ?? ['No secrets in code'],
    };
  }

  async frontload(_projectId: string): Promise<void> {
    // No-op: in-memory context is always available
  }

  async getContext(_projectId: string): Promise<MemoryContext> {
    return this.context;
  }

  async recordTrace(trace: EpisodicEntry): Promise<void> {
    this.traces.push(trace);
  }
}

// ── Planner ──

export interface InMemoryPlannerOptions {
  /** Fixed plan to return, or a function that produces plans per call. */
  planFactory?: (intent: PlanIntent, callCount: number) => PlanGraph;
}

export class InMemoryPlanner implements IPlannerModule {
  readonly intents: PlanIntent[] = [];
  private readonly planFactory: (intent: PlanIntent, callCount: number) => PlanGraph;
  private callCount = 0;

  constructor(options: InMemoryPlannerOptions = {}) {
    this.planFactory = options.planFactory ?? (() => ({
      tasks: [
        { id: 'task-1', objective: 'Implement feature', requiredSkills: ['code-gen'], dependsOn: [] },
        { id: 'task-2', objective: 'Write tests', requiredSkills: ['code-gen'], dependsOn: ['task-1'] },
      ],
    }));
  }

  async createPlan(intent: PlanIntent): Promise<PlanGraph> {
    this.intents.push(intent);
    this.callCount++;
    return this.planFactory(intent, this.callCount);
  }
}

// ── Observer ──

export interface SpanRecord {
  readonly name: string;
  readonly startedAt: number;
  endedAt?: number;
  metadata?: Record<string, unknown>;
}

export class InMemoryObserver implements IObserverModule {
  readonly traceIds: string[] = [];
  readonly spans: SpanRecord[] = [];
  private tokenSpend: TokenSpendData = {
    inputTokens: 500,
    outputTokens: 200,
    totalTokens: 700,
    estimatedCostUsd: 0.01,
  };

  setTokenSpend(spend: TokenSpendData): void {
    this.tokenSpend = spend;
  }

  startTrace(sessionId: string): void {
    this.traceIds.push(sessionId);
  }

  startSpan(name: string): SpanHandle {
    const record: SpanRecord = { name, startedAt: Date.now() };
    this.spans.push(record);
    return {
      end(metadata?: Record<string, unknown>) {
        record.endedAt = Date.now();
        record.metadata = metadata;
      },
    };
  }

  async getTokenSpend(_sessionId: string): Promise<TokenSpendData> {
    return this.tokenSpend;
  }
}

// ── Critique ──

export interface InMemoryCritiqueOptions {
  /** Sequence of results: first call returns results[0], etc. Loops on last. */
  results?: CritiqueResult[];
}

export class InMemoryCritique implements ICritiqueModule {
  readonly reviewedPlans: PlanGraph[] = [];
  private readonly results: CritiqueResult[];
  private callCount = 0;

  constructor(options: InMemoryCritiqueOptions = {}) {
    this.results = options.results ?? [
      { verdict: 'pass', findings: [], score: 0.95 },
    ];
  }

  async reviewPlan(plan: PlanGraph): Promise<CritiqueResult> {
    this.reviewedPlans.push(plan);
    const idx = Math.min(this.callCount, this.results.length - 1);
    this.callCount++;
    return this.results[idx]!;
  }
}

// ── Governor ──

export interface InMemoryGovernorOptions {
  /** Default decision for all requests. */
  defaultDecision?: ApprovalOutcome['decision'];
  /** Per-task overrides. */
  taskOverrides?: Record<string, ApprovalOutcome>;
}

export class InMemoryGovernor implements IGovernorModule {
  readonly requests: ApprovalPayload[] = [];
  private readonly defaultDecision: ApprovalOutcome['decision'];
  private readonly taskOverrides: Record<string, ApprovalOutcome>;

  constructor(options: InMemoryGovernorOptions = {}) {
    this.defaultDecision = options.defaultDecision ?? 'approved';
    this.taskOverrides = options.taskOverrides ?? {};
  }

  async requestApproval(request: ApprovalPayload): Promise<ApprovalOutcome> {
    this.requests.push(request);
    if (this.taskOverrides[request.taskId]) {
      return this.taskOverrides[request.taskId]!;
    }
    return { decision: this.defaultDecision };
  }
}

// ── Heartbeat ──

export class InMemoryHeartbeat implements IHeartbeatModule {
  pulseCalled = false;

  async pulse() {
    this.pulseCalled = true;
    return {
      improvements: ['Consider adding retry logic'],
      techDebt: [],
      summary: 'System healthy',
    };
  }
}

// ── Logger ──

export class InMemoryLogger implements ILogger {
  readonly entries: Array<{ level: string; msg: string; data?: unknown }> = [];

  info(msg: string, data?: unknown): void {
    this.entries.push({ level: 'info', msg, data });
  }

  debug(msg: string, data?: unknown): void {
    this.entries.push({ level: 'debug', msg, data });
  }

  warn(msg: string, data?: unknown): void {
    this.entries.push({ level: 'warn', msg, data });
  }

  error(msg: string, data?: unknown): void {
    this.entries.push({ level: 'error', msg, data });
  }
}
