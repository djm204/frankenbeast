import { makeTokenSpend } from '@franken/types';
import type { IObserverModule, SpanHandle, TokenSpendData } from '../deps.js';

export interface TraceContextPort<Trace = TracePort, Span = SpanPort> {
  createTrace(goal: string): Trace;
  startSpan(trace: Trace, options: { name: string; parentSpanId?: string }): Span;
  endSpan(span: Span, options?: { status?: 'completed' | 'error'; errorMessage?: string }): void;
}

export interface CostCalculatorPort {
  calculate(entry: { model: string; promptTokens: number; completionTokens: number }): number;
}

export interface TracePort {
  id: string;
  goal: string;
  status: 'active' | 'completed' | 'error';
  startedAt: number;
  endedAt?: number;
  spans: SpanPort[];
}

export interface SpanPort {
  id: string;
  traceId: string;
  name: string;
  status: 'active' | 'completed' | 'error';
  startedAt: number;
  endedAt?: number;
  metadata: Record<string, unknown>;
}

export interface ObserverPortAdapterDeps {
  traceContext: TraceContextPort;
  costCalculator: CostCalculatorPort;
}

const DEFAULT_SESSION_ID = '__default__';

export class ObserverPortAdapter implements IObserverModule {
  private readonly traceContext: TraceContextPort;
  private readonly costCalculator: CostCalculatorPort;
  private readonly traces = new Map<string, TracePort>();
  private currentSessionId: string | undefined;

  constructor(deps: ObserverPortAdapterDeps) {
    this.traceContext = deps.traceContext;
    this.costCalculator = deps.costCalculator;
  }

  startTrace(sessionId: string): void {
    try {
      const trace = this.traceContext.createTrace(sessionId);
      this.traces.set(sessionId, trace);
      this.currentSessionId = sessionId;
    } catch (error) {
      throw new Error(`ObserverPortAdapter failed: ${errorMessage(error)}`, { cause: error });
    }
  }

  startSpan(name: string): SpanHandle {
    let trace = this.currentSessionId ? this.traces.get(this.currentSessionId) : undefined;

    if (!trace) {
      const fallbackId = this.currentSessionId ?? DEFAULT_SESSION_ID;
      try {
        trace = this.traceContext.createTrace(fallbackId) as TracePort;
      } catch (error) {
        throw new Error(`ObserverPortAdapter failed: ${errorMessage(error)}`, { cause: error });
      }
      this.traces.set(fallbackId, trace);
      this.currentSessionId = fallbackId;
    }

    let span: SpanPort;
    try {
      span = this.traceContext.startSpan(trace, { name }) as SpanPort;
    } catch (error) {
      throw new Error(`ObserverPortAdapter failed: ${errorMessage(error)}`, { cause: error });
    }

    return {
      end: (metadata?: Record<string, unknown>) => {
        const { endOptions, rest } = splitEndOptions(metadata);
        Object.assign(span.metadata, rest);
        try {
          this.traceContext.endSpan(span, endOptions);
        } catch (error) {
          throw new Error(`ObserverPortAdapter failed: ${errorMessage(error)}`, { cause: error });
        }
      },
    };
  }

  async getTokenSpend(sessionId: string): Promise<TokenSpendData> {
    const trace = this.traces.get(sessionId);
    if (!trace) {
      return { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };
    }

    let inputTokens = 0;
    let outputTokens = 0;
    let estimatedCostUsd = 0;

    for (const span of trace.spans) {
      // Validate each span's token counts before aggregating. A negative or
      // unsafe per-span value would otherwise cancel against other spans and
      // slip past makeTokenSpend's aggregate check, reporting inconsistent
      // tokens/cost. Missing/non-numeric metadata is treated as zero.
      const promptTokens = tokenCountFromMetadata(span.metadata.promptTokens, 'promptTokens', span.id);
      const completionTokens = tokenCountFromMetadata(span.metadata.completionTokens, 'completionTokens', span.id);
      inputTokens += promptTokens;
      outputTokens += completionTokens;

      const model = span.metadata.model;
      if (typeof model === 'string' && (promptTokens > 0 || completionTokens > 0)) {
        estimatedCostUsd += this.costCalculator.calculate({
          model,
          promptTokens,
          completionTokens,
        });
      }
    }

    // Route through the validating factory so corrupt/overflowing span metadata
    // surfaces loudly at the boundary instead of forwarding poisoned spend.
    return makeTokenSpend(inputTokens, outputTokens, estimatedCostUsd);
  }
}

function tokenCountFromMetadata(value: unknown, label: string, spanId: string): number {
  // Absent or non-numeric metadata means "no tokens recorded" → zero.
  if (typeof value !== 'number') return 0;
  // A numeric token count must be a non-negative safe integer; anything else is
  // corrupt span metadata and is surfaced loudly rather than silently coerced.
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      `ObserverPortAdapter: span ${spanId} has invalid ${label} metadata: ${value}`,
    );
  }
  return value;
}

function splitEndOptions(metadata?: Record<string, unknown>): {
  endOptions: { status?: 'completed' | 'error'; errorMessage?: string } | undefined;
  rest: Record<string, unknown>;
} {
  if (!metadata) {
    return { endOptions: undefined, rest: {} };
  }

  const { status, errorMessage, ...rest } = metadata;
  const endOptions: { status?: 'completed' | 'error'; errorMessage?: string } = {};

  if (status === 'completed' || status === 'error') {
    endOptions.status = status;
  }
  if (typeof errorMessage === 'string') {
    endOptions.errorMessage = errorMessage;
  }

  return { endOptions: Object.keys(endOptions).length > 0 ? endOptions : undefined, rest };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
