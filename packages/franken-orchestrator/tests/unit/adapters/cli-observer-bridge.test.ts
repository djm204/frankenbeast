import { describe, it, expect } from 'vitest';
import {
  TokenCounter,
  CostCalculator,
  CircuitBreaker,
  LoopDetector,
} from '@frankenbeast/observer';
import { CliObserverBridge } from '../../../src/adapters/cli-observer-bridge.js';
import type { IObserverModule } from '../../../src/deps.js';

describe('CliObserverBridge', () => {
  const defaultConfig = { budgetLimitUsd: 5.0 };

  describe('constructor', () => {
    it('creates internal TokenCounter, CostCalculator, CircuitBreaker, LoopDetector', () => {
      const bridge = new CliObserverBridge(defaultConfig);
      bridge.startTrace('test-session');
      const deps = bridge.observerDeps;

      expect(deps.counter).toBeInstanceOf(TokenCounter);
      expect(deps.costCalc).toBeInstanceOf(CostCalculator);
      expect(deps.breaker).toBeInstanceOf(CircuitBreaker);
      expect(deps.loopDetector).toBeInstanceOf(LoopDetector);
    });
  });

  describe('IObserverModule conformance', () => {
    it('implements IObserverModule', () => {
      const bridge: IObserverModule = new CliObserverBridge(defaultConfig);
      expect(bridge.startTrace).toBeTypeOf('function');
      expect(bridge.startSpan).toBeTypeOf('function');
      expect(bridge.getTokenSpend).toBeTypeOf('function');
    });
  });

  describe('startTrace()', () => {
    it('initializes a trace context', () => {
      const bridge = new CliObserverBridge(defaultConfig);
      bridge.startTrace('session-1');

      // After starting a trace, the bridge's internal trace should exist
      // and observerDeps.trace should reference it
      const deps = bridge.observerDeps;
      expect(deps.trace).toBeDefined();
      expect(deps.trace.id).toBeTypeOf('string');
      expect(deps.trace.id.length).toBeGreaterThan(0);
    });
  });

  describe('startSpan()', () => {
    it('returns a SpanHandle with end() method', () => {
      const bridge = new CliObserverBridge(defaultConfig);
      bridge.startTrace('session-1');

      const handle = bridge.startSpan('test-span');
      expect(handle).toBeDefined();
      expect(handle.end).toBeTypeOf('function');

      // Should not throw when ending
      expect(() => handle.end()).not.toThrow();
    });
  });

  describe('getTokenSpend()', () => {
    it('returns token totals from internal counter', async () => {
      const bridge = new CliObserverBridge(defaultConfig);
      bridge.startTrace('session-1');

      const spend = await bridge.getTokenSpend('session-1');
      expect(spend.inputTokens).toBe(0);
      expect(spend.outputTokens).toBe(0);
      expect(spend.totalTokens).toBe(0);
    });

    it('returns estimated cost from internal CostCalculator', async () => {
      const bridge = new CliObserverBridge(defaultConfig);
      bridge.startTrace('session-1');

      const spend = await bridge.getTokenSpend('session-1');
      expect(spend.estimatedCostUsd).toBeTypeOf('number');
      expect(spend.estimatedCostUsd).toBeGreaterThanOrEqual(0);
    });

    it('reflects token usage recorded through observerDeps', async () => {
      const bridge = new CliObserverBridge(defaultConfig);
      bridge.startTrace('session-1');

      const deps = bridge.observerDeps;
      const span = deps.startSpan(deps.trace, { name: 'work' });
      deps.recordTokenUsage(span, {
        promptTokens: 100,
        completionTokens: 50,
        model: 'claude-opus-4-6',
      }, deps.counter);
      deps.endSpan(span, { status: 'completed' });

      const spend = await bridge.getTokenSpend('session-1');
      expect(spend.inputTokens).toBe(100);
      expect(spend.outputTokens).toBe(50);
      expect(spend.totalTokens).toBe(150);
      expect(spend.estimatedCostUsd).toBeGreaterThan(0);
    });
  });

  describe('observerDeps', () => {
    it('exposes counter, costCalc, breaker, loopDetector properties', () => {
      const bridge = new CliObserverBridge(defaultConfig);
      bridge.startTrace('session-1');
      const deps = bridge.observerDeps;

      // counter should have grandTotal, allModels, totalsFor
      expect(deps.counter.grandTotal).toBeTypeOf('function');
      expect(deps.counter.allModels).toBeTypeOf('function');
      expect(deps.counter.totalsFor).toBeTypeOf('function');

      // costCalc should have totalCost
      expect(deps.costCalc.totalCost).toBeTypeOf('function');

      // breaker should have check
      expect(deps.breaker.check).toBeTypeOf('function');

      // loopDetector should have check
      expect(deps.loopDetector.check).toBeTypeOf('function');
    });

    it('breaker.check(spendUsd) returns { tripped: true } when spend exceeds budget', () => {
      const bridge = new CliObserverBridge({ budgetLimitUsd: 1.0 });
      bridge.startTrace('session-1');
      const deps = bridge.observerDeps;

      const result = deps.breaker.check(2.0);
      expect(result.tripped).toBe(true);
      expect(result.limitUsd).toBe(1.0);
      expect(result.spendUsd).toBe(2.0);
    });

    it('breaker.check(spendUsd) returns { tripped: false } when under budget', () => {
      const bridge = new CliObserverBridge({ budgetLimitUsd: 5.0 });
      bridge.startTrace('session-1');
      const deps = bridge.observerDeps;

      const result = deps.breaker.check(1.0);
      expect(result.tripped).toBe(false);
      expect(result.limitUsd).toBe(5.0);
      expect(result.spendUsd).toBe(1.0);
    });

    it('recordTokenUsage delegates to counter.record()', () => {
      const bridge = new CliObserverBridge(defaultConfig);
      bridge.startTrace('session-1');
      const deps = bridge.observerDeps;

      const span = deps.startSpan(deps.trace, { name: 'record-span' });
      deps.recordTokenUsage(
        span,
        { promptTokens: 200, completionTokens: 100, model: 'gpt-4o' },
        deps.counter,
      );
      deps.endSpan(span);

      const totals = deps.counter.grandTotal();
      expect(totals.promptTokens).toBe(200);
      expect(totals.completionTokens).toBe(100);
      expect(totals.totalTokens).toBe(300);
    });

    it('startSpan creates a child span on the trace', () => {
      const bridge = new CliObserverBridge(defaultConfig);
      bridge.startTrace('session-1');
      const deps = bridge.observerDeps;

      const span = deps.startSpan(deps.trace, { name: 'child-span' });
      expect(span).toBeDefined();
      expect(span.id).toBeTypeOf('string');
      expect(span.id.length).toBeGreaterThan(0);

      deps.endSpan(span);
    });

    it('requests compaction when usage reaches 85 percent', () => {
      const bridge = new CliObserverBridge(defaultConfig);
      bridge.startTrace('session-1');

      const usage = bridge.estimateContextWindow({
        renderedPrompt: 'x'.repeat(4000),
        provider: 'claude',
        maxTokens: 1000,
      });

      expect(usage.usageRatio).toBeGreaterThanOrEqual(0.85);
      expect(usage.shouldCompact).toBe(true);
    });
  });

  // ── Hardening ──

  describe('hardening', () => {
    it('getTokenSpend returns zeros when startTrace has not been called', async () => {
      const bridge = new CliObserverBridge(defaultConfig);
      const spend = await bridge.getTokenSpend('session-1');

      expect(spend.inputTokens).toBe(0);
      expect(spend.outputTokens).toBe(0);
      expect(spend.totalTokens).toBe(0);
      expect(spend.estimatedCostUsd).toBe(0);
    });

    it('startSpan throws when startTrace has not been called', () => {
      const bridge = new CliObserverBridge(defaultConfig);
      expect(() => bridge.startSpan('my-span')).toThrow('No active trace');
    });

    it('observerDeps throws when startTrace has not been called', () => {
      const bridge = new CliObserverBridge(defaultConfig);
      expect(() => bridge.observerDeps).toThrow('No active trace');
    });
  });

  // ── Integration (chunk 05) ──

  describe('integration', () => {
    it('records 1000 tokens and getTokenSpend returns non-zero cost', async () => {
      const bridge = new CliObserverBridge(defaultConfig);
      bridge.startTrace('session-1');
      const deps = bridge.observerDeps;

      const span = deps.startSpan(deps.trace, { name: 'cost-span' });
      deps.recordTokenUsage(
        span,
        { promptTokens: 1000, completionTokens: 0, model: 'claude-sonnet-4-6' },
        deps.counter,
      );
      deps.endSpan(span);

      const spend = await bridge.getTokenSpend('session-1');

      expect(spend.inputTokens).toBe(1000);
      expect(spend.totalTokens).toBe(1000);
      expect(spend.estimatedCostUsd).toBeGreaterThan(0);
      // claude-sonnet-4-6: 1000 / 1_000_000 * 3.0 = 0.003
      expect(spend.estimatedCostUsd).toBeCloseTo(0.003, 5);
    });

    it('records tokens exceeding budget and breaker.check() returns tripped: true', async () => {
      const bridge = new CliObserverBridge({ budgetLimitUsd: 0.001 });
      bridge.startTrace('session-1');
      const deps = bridge.observerDeps;

      // claude-opus-4-6: 1000 / 1_000_000 * 15.0 = $0.015 > $0.001
      const span = deps.startSpan(deps.trace, { name: 'expensive-span' });
      deps.recordTokenUsage(
        span,
        { promptTokens: 1000, completionTokens: 0, model: 'claude-opus-4-6' },
        deps.counter,
      );
      deps.endSpan(span);

      const spend = await bridge.getTokenSpend('session-1');
      const result = deps.breaker.check(spend.estimatedCostUsd);

      expect(spend.estimatedCostUsd).toBeGreaterThan(0.001);
      expect(result.tripped).toBe(true);
    });
  });
});
