import { describe, it, expect } from 'vitest';
import { CliObserverBridge } from '../../src/adapters/cli-observer-bridge.js';
import {
  TokenCounter,
  CostCalculator,
  CircuitBreaker,
  LoopDetector,
} from '@frankenbeast/observer';

describe('CliObserverBridge', () => {
  const defaultConfig = { budgetLimitUsd: 1.0 };

  function createBridge(budgetLimitUsd = 1.0) {
    return new CliObserverBridge({ budgetLimitUsd });
  }

  describe('constructor', () => {
    it('creates internal TokenCounter, CostCalculator, CircuitBreaker, LoopDetector', () => {
      const bridge = createBridge();
      bridge.startTrace('test-session');
      const deps = bridge.observerDeps;

      expect(deps.counter).toBeInstanceOf(TokenCounter);
      expect(deps.costCalc).toBeInstanceOf(CostCalculator);
      expect(deps.breaker).toBeInstanceOf(CircuitBreaker);
      expect(deps.loopDetector).toBeInstanceOf(LoopDetector);
    });
  });

  describe('startTrace', () => {
    it('initializes a trace context', () => {
      const bridge = createBridge();
      bridge.startTrace('session-123');
      const deps = bridge.observerDeps;

      expect(deps.trace).toBeDefined();
      expect(deps.trace.id).toEqual(expect.any(String));
    });
  });

  describe('startSpan', () => {
    it('returns a SpanHandle with end() method', () => {
      const bridge = createBridge();
      bridge.startTrace('session-span');
      const handle = bridge.startSpan('test-span');

      expect(handle).toBeDefined();
      expect(typeof handle.end).toBe('function');
    });

    it('end() can be called with metadata', () => {
      const bridge = createBridge();
      bridge.startTrace('session-span-meta');
      const handle = bridge.startSpan('test-span-meta');

      expect(() => handle.end({ key: 'value' })).not.toThrow();
    });

    it('end() can be called without metadata', () => {
      const bridge = createBridge();
      bridge.startTrace('session-span-no-meta');
      const handle = bridge.startSpan('test-span-no-meta');

      expect(() => handle.end()).not.toThrow();
    });

    it('throws if startTrace has not been called', () => {
      const bridge = createBridge();
      expect(() => bridge.startSpan('test')).toThrow('No active trace');
    });
  });

  describe('getTokenSpend', () => {
    it('returns token totals from internal counter', async () => {
      const bridge = createBridge();
      bridge.startTrace('session-tokens');
      const deps = bridge.observerDeps;

      // Record tokens via a span
      const span = deps.startSpan(deps.trace, { name: 'token-test' });
      deps.recordTokenUsage(span, { promptTokens: 100, completionTokens: 200, model: 'gpt-4o' }, deps.counter);
      deps.endSpan(span);

      const spend = await bridge.getTokenSpend('session-tokens');
      expect(spend.inputTokens).toBe(100);
      expect(spend.outputTokens).toBe(200);
      expect(spend.totalTokens).toBe(300);
    });

    it('returns estimated cost from internal CostCalculator', async () => {
      const bridge = createBridge();
      bridge.startTrace('session-cost');
      const deps = bridge.observerDeps;

      const span = deps.startSpan(deps.trace, { name: 'cost-test' });
      deps.recordTokenUsage(span, { promptTokens: 1_000_000, completionTokens: 0, model: 'gpt-4o' }, deps.counter);
      deps.endSpan(span);

      const spend = await bridge.getTokenSpend('session-cost');
      // gpt-4o: promptPerMillion = 5.0, so 1M prompt tokens = $5.00
      expect(spend.estimatedCostUsd).toBeCloseTo(5.0, 2);
    });

    it('returns zeros when startTrace has not been called', async () => {
      const bridge = createBridge();
      const spend = await bridge.getTokenSpend('no-trace');

      expect(spend.inputTokens).toBe(0);
      expect(spend.outputTokens).toBe(0);
      expect(spend.totalTokens).toBe(0);
      expect(spend.estimatedCostUsd).toBe(0);
    });
  });

  describe('observerDeps', () => {
    it('exposes counter, costCalc, breaker, loopDetector properties', () => {
      const bridge = createBridge();
      bridge.startTrace('session-deps');
      const deps = bridge.observerDeps;

      expect(deps.counter).toBeDefined();
      expect(deps.costCalc).toBeDefined();
      expect(deps.breaker).toBeDefined();
      expect(deps.loopDetector).toBeDefined();
    });

    it('exposes trace', () => {
      const bridge = createBridge();
      bridge.startTrace('session-trace');
      const deps = bridge.observerDeps;

      expect(deps.trace).toBeDefined();
    });

    it('exposes startSpan, endSpan, recordTokenUsage, setMetadata methods', () => {
      const bridge = createBridge();
      bridge.startTrace('session-methods');
      const deps = bridge.observerDeps;

      expect(typeof deps.startSpan).toBe('function');
      expect(typeof deps.endSpan).toBe('function');
      expect(typeof deps.recordTokenUsage).toBe('function');
      expect(typeof deps.setMetadata).toBe('function');
    });

    it('throws when startTrace has not been called', () => {
      const bridge = createBridge();
      expect(() => bridge.observerDeps).toThrow('No active trace');
    });

    it('breaker.check() returns tripped: true when spend exceeds budget', () => {
      const bridge = createBridge(0.50);
      bridge.startTrace('session-breaker');
      const deps = bridge.observerDeps;

      const result = deps.breaker.check(1.00);
      expect(result.tripped).toBe(true);
    });

    it('breaker.check() returns tripped: false when spend is within budget', () => {
      const bridge = createBridge(1.0);
      bridge.startTrace('session-breaker-ok');
      const deps = bridge.observerDeps;

      const result = deps.breaker.check(0.50);
      expect(result.tripped).toBe(false);
    });

    it('recordTokenUsage delegates to counter.record()', () => {
      const bridge = createBridge();
      bridge.startTrace('session-record');
      const deps = bridge.observerDeps;

      const span = deps.startSpan(deps.trace, { name: 'record-test' });
      deps.recordTokenUsage(span, { promptTokens: 50, completionTokens: 75, model: 'gpt-4o' }, deps.counter);
      deps.endSpan(span);

      const totals = deps.counter.grandTotal();
      expect(totals.promptTokens).toBe(50);
      expect(totals.completionTokens).toBe(75);
      expect(totals.totalTokens).toBe(125);
    });

    it('startSpan creates a child span on the trace', () => {
      const bridge = createBridge();
      bridge.startTrace('session-child-span');
      const deps = bridge.observerDeps;

      const parentSpan = deps.startSpan(deps.trace, { name: 'parent' });
      const childSpan = deps.startSpan(deps.trace, { name: 'child', parentSpanId: parentSpan.id });

      expect(childSpan).toBeDefined();
      expect(childSpan.id).not.toBe(parentSpan.id);

      deps.endSpan(childSpan);
      deps.endSpan(parentSpan);
    });
  });

  describe('integration: token spend with real pricing', () => {
    it('record 1000 tokens, getTokenSpend() returns non-zero cost', async () => {
      const bridge = createBridge();
      bridge.startTrace('session-1000-tokens');
      const deps = bridge.observerDeps;

      const span = deps.startSpan(deps.trace, { name: 'big-call' });
      deps.recordTokenUsage(span, { promptTokens: 500, completionTokens: 500, model: 'gpt-4o' }, deps.counter);
      deps.endSpan(span);

      const spend = await bridge.getTokenSpend('session-1000-tokens');
      expect(spend.totalTokens).toBe(1000);
      expect(spend.estimatedCostUsd).toBeGreaterThan(0);
      // gpt-4o: (500/1M)*5 + (500/1M)*15 = 0.0025 + 0.0075 = 0.01
      expect(spend.estimatedCostUsd).toBeCloseTo(0.01, 4);
    });

    it('record tokens exceeding budget, breaker.check() returns tripped: true', async () => {
      const bridge = createBridge(0.005); // $0.005 budget
      bridge.startTrace('session-over-budget');
      const deps = bridge.observerDeps;

      // Record enough tokens to exceed the $0.005 budget
      const span = deps.startSpan(deps.trace, { name: 'expensive-call' });
      deps.recordTokenUsage(span, { promptTokens: 500, completionTokens: 500, model: 'gpt-4o' }, deps.counter);
      deps.endSpan(span);

      // Compute the actual cost via getTokenSpend
      const spend = await bridge.getTokenSpend('session-over-budget');
      expect(spend.estimatedCostUsd).toBeGreaterThan(0.005);

      // Check breaker with the actual cost
      const result = deps.breaker.check(spend.estimatedCostUsd);
      expect(result.tripped).toBe(true);
    });
  });
});
