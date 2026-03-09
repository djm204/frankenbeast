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
import type { IObserverModule, SpanHandle, TokenSpendData } from '../deps.js';
import type { ContextWindowUsage, ObserverDeps } from '../skills/cli-skill-executor.js';

export interface CliObserverBridgeConfig {
  budgetLimitUsd: number;
}

export class CliObserverBridge implements IObserverModule {
  private readonly counter: TokenCounter;
  private readonly costCalc: CostCalculator;
  private readonly breaker: CircuitBreaker;
  private readonly loopDet: LoopDetector;
  private trace: Trace | undefined;

  constructor(config: CliObserverBridgeConfig) {
    this.counter = new TokenCounter();
    this.costCalc = new CostCalculator(DEFAULT_PRICING);
    this.breaker = new CircuitBreaker({ limitUsd: config.budgetLimitUsd });
    this.loopDet = new LoopDetector();
  }

  startTrace(sessionId: string): void {
    this.trace = TraceContext.createTrace(sessionId);
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
    return {
      inputTokens: totals.promptTokens,
      outputTokens: totals.completionTokens,
      totalTokens: totals.totalTokens,
      estimatedCostUsd,
    };
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
    };
  }

  private requireTrace(): Trace {
    if (!this.trace) {
      throw new Error('No active trace. Call startTrace() first.');
    }
    return this.trace;
  }
}
