import {
  TokenCounter,
  CostCalculator,
  CircuitBreaker,
  LoopDetector,
  DEFAULT_PRICING,
  TraceContext,
  SpanLifecycle,
} from '@frankenbeast/observer';
import type { Trace, Span } from '@frankenbeast/observer';
import { makeTokenSpend } from '@franken/types';
import type { IObserverModule, SpanHandle, TokenSpendData } from '../deps.js';
import type { ContextWindowUsage, ObserverDeps } from '../skills/cli-skill-executor.js';
import type { ReplayContentStoreLike, ReplayRecord, ReplayRecordKind } from '../replay/replay-content-store.js';

export interface CliObserverBridgeConfig {
  budgetLimitUsd: number;
  replayStore?: ReplayContentStoreLike | undefined;
}

interface ReplayCaptureRecord {
  readonly kind: ReplayRecordKind;
  readonly runId: string;
  readonly provider?: string | undefined;
  readonly model?: string | undefined;
  readonly toolName?: string | undefined;
  readonly content: string;
}

export class CliObserverBridge implements IObserverModule {
  private readonly counter: TokenCounter;
  private readonly costCalc: CostCalculator;
  private readonly breaker: CircuitBreaker;
  private readonly loopDet: LoopDetector;
  private readonly replayStore?: ReplayContentStoreLike | undefined;
  private readonly replayManifest: ReplayRecord[] = [];
  private trace: Trace | undefined;
  private activeSessionId: string | undefined;

  constructor(config: CliObserverBridgeConfig) {
    this.counter = new TokenCounter();
    this.costCalc = new CostCalculator(DEFAULT_PRICING);
    this.breaker = new CircuitBreaker({ limitUsd: config.budgetLimitUsd });
    this.loopDet = new LoopDetector();
    this.replayStore = config.replayStore;
  }

  startTrace(sessionId: string): void {
    this.activeSessionId = sessionId;
    this.trace = TraceContext.createTrace(sessionId);
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
      return { model: m, promptTokens: t.promptTokens, completionTokens: t.completionTokens };
    });
    const estimatedCostUsd = this.costCalc.totalCost(entries);
    // Route through the validating factory so the orchestrator boundary rejects
    // negative/unsafe totals instead of forwarding poisoned spend downstream.
    return makeTokenSpend(totals.promptTokens, totals.completionTokens, estimatedCostUsd);
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
      recordTokenUsage: (span: Span, usage: { promptTokens: number; completionTokens: number; model?: string }, counter?: TokenCounter) =>
        SpanLifecycle.recordTokenUsage(span, usage, counter),
      setMetadata: (span: Span, data: Record<string, unknown>) =>
        SpanLifecycle.setMetadata(span, data),
      recordReplay: (record) => this.recordReplay(record),
    };
  }

  get disabledObserverDeps(): ObserverDeps {
    const trace = {
      id: this.activeSessionId ?? 'tracing-disabled',
      sessionId: this.activeSessionId ?? 'tracing-disabled',
      spans: [],
    } as unknown as Trace;

    return {
      trace,
      counter: this.counter,
      costCalc: this.costCalc,
      breaker: this.breaker,
      loopDetector: this.loopDet,
      estimateContextWindow: (input) => this.estimateContextWindow(input),
      startSpan: (_t: Trace, opts: { name: string; parentSpanId?: string }) => ({
        id: `tracing-disabled:${opts.name}`,
        name: opts.name,
      }) as unknown as Span,
      endSpan: () => {},
      recordTokenUsage: (_span: Span, usage: { promptTokens: number; completionTokens: number; model?: string }, counter?: TokenCounter) => {
        (counter ?? this.counter).record({
          model: usage.model ?? 'unknown',
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
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
      timestamp: new Date().toISOString(),
      ...(record.provider ? { provider: record.provider } : {}),
      ...(record.model ? { model: record.model } : {}),
      ...(record.toolName ? { toolName: record.toolName } : {}),
      contentRef,
    });
  }

  getReplayManifest(): readonly ReplayRecord[] {
    return [...this.replayManifest];
  }

  private requireTrace(): Trace {
    if (!this.trace) {
      throw new Error('No active trace. Call startTrace() first.');
    }
    return this.trace;
  }
}
