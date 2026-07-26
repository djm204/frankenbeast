import {
  TokenCounter,
  CostCalculator,
  CircuitBreaker,
  LoopDetector,
  DEFAULT_PRICING,
  TraceContext,
  SpanLifecycle,
  CompactionMetrics,
} from '@franken/observer';
import type { CompactionEventAdapter, Trace, Span } from '@franken/observer';
import { makeTokenSpend, isoNow } from '@franken/types';
import type { IObserverModule, SpanHandle, TokenSpendData } from '../deps.js';
import type { ContextWindowUsage, ObserverDeps } from '../skills/cli-skill-executor.js';
import type { ReplayContentStoreLike, ReplayRecord, ReplayRecordKind } from '../replay/replay-content-store.js';

export interface CliObserverBridgeConfig {
  budgetLimitUsd: number;
  sessionId?: string | undefined;
  replayStore?: ReplayContentStoreLike | undefined;
  compactionAdapter?: (CompactionEventAdapter & {
    close?: (() => void | Promise<void>) | undefined;
  }) | undefined;
  traceAdapter?: { flush(trace: Trace): Promise<void> } | undefined;
}

interface ReplayCaptureRecord {
  readonly kind: ReplayRecordKind;
  readonly runId: string;
  readonly provider?: string | undefined;
  readonly model?: string | undefined;
  readonly toolName?: string | undefined;
  readonly content: string;
}

function createDisabledTrace(traceId: string): Trace {
  return {
    id: traceId,
    goal: 'tracing-disabled',
    status: 'completed',
    startedAt: Date.now(),
    spans: [],
  };
}

function createDisabledSpan(traceId: string, opts: { name: string; parentSpanId?: string }): Span {
  return {
    id: `tracing-disabled:${opts.name}`,
    traceId,
    ...(opts.parentSpanId ? { parentSpanId: opts.parentSpanId } : {}),
    name: opts.name,
    status: 'completed',
    startedAt: Date.now(),
    metadata: {},
    thoughtBlocks: [],
  };
}

export class CliObserverBridge implements IObserverModule {
  private readonly counter: TokenCounter;
  private readonly costCalc: CostCalculator;
  private readonly breaker: CircuitBreaker;
  private readonly loopDet: LoopDetector;
  private readonly replayStore?: ReplayContentStoreLike | undefined;
  private readonly compactionMetrics?: CompactionMetrics | undefined;
  private readonly compactionAdapter?: CliObserverBridgeConfig['compactionAdapter'];
  private readonly traceAdapter?: CliObserverBridgeConfig['traceAdapter'];
  private readonly replayManifest: ReplayRecord[] = [];
  private trace: Trace | undefined;
  private activeSessionId: string | undefined;

  constructor(config: CliObserverBridgeConfig) {
    this.counter = new TokenCounter();
    this.costCalc = new CostCalculator(DEFAULT_PRICING);
    this.breaker = new CircuitBreaker({ limitUsd: config.budgetLimitUsd });
    this.loopDet = new LoopDetector();
    this.replayStore = config.replayStore;
    this.activeSessionId = config.sessionId;
    this.compactionAdapter = config.compactionAdapter;
    this.traceAdapter = config.traceAdapter;
    this.compactionMetrics = config.compactionAdapter
      ? new CompactionMetrics(config.compactionAdapter)
      : undefined;
  }

  startTrace(sessionId: string): void {
    this.activeSessionId = sessionId;
    const trace = TraceContext.createTrace(sessionId);
    trace.id = sessionId;
    this.trace = trace;
  }

  getActiveSessionId(): string | undefined {
    return this.activeSessionId;
  }

  startSpan(name: string): SpanHandle {
    const trace = this.requireTrace();
    const span = TraceContext.startSpan(trace, { name });
    return {
      end: (metadata?: Record<string, unknown>) => {
        if (metadata) {
          SpanLifecycle.setMetadata(span, metadata);
        }
        TraceContext.endSpan(span);
      },
    };
  }

  async getTokenSpend(_sessionId: string): Promise<TokenSpendData> {
    const totals = this.counter.grandTotal();
    const entries = this.counter.allModels().map((m) => {
      const t = this.counter.totalsFor(m);
      return {
        model: m,
        promptTokens: t.promptTokens,
        completionTokens: t.completionTokens,
        cacheReadTokens: t.cacheReadTokens,
        cacheCreationTokens: t.cacheCreationTokens,
        ...(t.cacheCreation1hTokens !== undefined
          ? { cacheCreation1hTokens: t.cacheCreation1hTokens }
          : {}),
      };
    });
    const estimatedCostUsd = this.costCalc.totalCost(entries);
    // Route through the validating factory so the orchestrator boundary rejects
    // negative/unsafe totals instead of forwarding poisoned spend downstream.
    const totalInputTokens = totals.totalTokens - totals.completionTokens;
    return makeTokenSpend(totalInputTokens, totals.completionTokens, estimatedCostUsd);
  }

  estimateContextWindow(input: {
    renderedPrompt: string;
    provider: string;
    maxTokens: number;
    threshold?: number;
  }): ContextWindowUsage {
    const divisor = input.provider === 'codex' ? 16 : 4;
    const usedTokens = Math.ceil(input.renderedPrompt.length / divisor);
    const threshold = input.threshold ?? 0.85;
    const usageRatio = input.maxTokens > 0 ? usedTokens / input.maxTokens : 1;

    return {
      usedTokens,
      maxTokens: input.maxTokens,
      usageRatio,
      threshold,
      shouldCompact: usageRatio >= threshold,
    };
  }

  get observerDeps(): ObserverDeps {
    const trace = this.requireTrace();
    return {
      trace,
      counter: this.counter,
      costCalc: this.costCalc,
      breaker: this.breaker,
      loopDetector: this.loopDet,
      estimateContextWindow: (input) => this.estimateContextWindow(input),
      startSpan: (t: Trace, opts: { name: string; parentSpanId?: string }) =>
        TraceContext.startSpan(t, opts),
      endSpan: (span: Span, opts?: { status?: string; errorMessage?: string }, loopDetector?: LoopDetector) =>
        TraceContext.endSpan(span, opts as { status?: 'completed' | 'error'; errorMessage?: string }, loopDetector),
      recordTokenUsage: (span: Span, usage: { promptTokens: number; completionTokens: number; cacheReadTokens?: number; cacheCreationTokens?: number; cacheCreation1hTokens?: number; model?: string }, counter?: TokenCounter) =>
        SpanLifecycle.recordTokenUsage(span, usage, counter),
      setMetadata: (span: Span, data: Record<string, unknown>) =>
        SpanLifecycle.setMetadata(span, data),
      recordReplay: (record) => this.recordReplay(record),
    };
  }

  get disabledObserverDeps(): ObserverDeps {
    const traceId = this.activeSessionId ?? 'tracing-disabled';
    const trace = createDisabledTrace(traceId);

    return {
      trace,
      counter: this.counter,
      costCalc: this.costCalc,
      breaker: this.breaker,
      loopDetector: this.loopDet,
      estimateContextWindow: (input) => this.estimateContextWindow(input),
      startSpan: (_t: Trace, opts: { name: string; parentSpanId?: string }) =>
        createDisabledSpan(traceId, opts),
      endSpan: () => {},
      recordTokenUsage: (_span: Span, usage: { promptTokens: number; completionTokens: number; cacheReadTokens?: number; cacheCreationTokens?: number; cacheCreation1hTokens?: number; model?: string }, counter?: TokenCounter) => {
        (counter ?? this.counter).record({
          model: usage.model ?? 'unknown',
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          ...(usage.cacheReadTokens !== undefined
            ? { cacheReadTokens: usage.cacheReadTokens }
            : {}),
          ...(usage.cacheCreationTokens !== undefined
            ? { cacheCreationTokens: usage.cacheCreationTokens }
            : {}),
          ...(usage.cacheCreation1hTokens !== undefined
            ? { cacheCreation1hTokens: usage.cacheCreation1hTokens }
            : {}),
        });
      },
      setMetadata: () => {},
      recordReplay: (record) => this.recordReplay(record),
    };
  }

  recordReplay(record: ReplayCaptureRecord): void {
    if (!this.replayStore) {
      return;
    }
    const contentRef = this.replayStore.put(record.content);
    this.replayManifest.push({
      version: 1,
      kind: record.kind,
      runId: record.runId,
      timestamp: isoNow(),
      ...(record.provider ? { provider: record.provider } : {}),
      ...(record.model ? { model: record.model } : {}),
      ...(record.toolName ? { toolName: record.toolName } : {}),
      contentRef,
    });
  }

  getReplayManifest(): readonly ReplayRecord[] {
    return [...this.replayManifest];
  }

  async recordCompaction(event: Omit<import('@franken/observer').CompactionEvent, 'runId'>): Promise<void> {
    if (!this.compactionMetrics) return;
    if (!this.activeSessionId) {
      throw new Error('No active observer session for compaction telemetry. Call startTrace() first.');
    }
    await this.compactionMetrics.record({
      ...event,
      runId: this.activeSessionId,
    });
  }

  async close(): Promise<void> {
    try {
      if (this.trace?.status === 'active') {
        for (const span of this.trace.spans) {
          if (span.status === 'active') {
            TraceContext.endSpan(span, {
              status: 'error',
              errorMessage: 'Span was still active during observer shutdown',
            });
          }
        }
        TraceContext.endTrace(this.trace);
      }
      if (this.trace) {
        await this.traceAdapter?.flush(this.trace);
      }
      await this.compactionAdapter?.close?.();
    } catch {
      // Observer shutdown is best-effort and must not fail a completed run.
    }
  }

  private requireTrace(): Trace {
    if (!this.trace) {
      throw new Error('No active trace. Call startTrace() first.');
    }
    return this.trace;
  }
}
