import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BeastContext } from '../../../src/context/franken-context.js';
import { createContext } from '../../../src/context/context-factory.js';

describe('BeastContext', () => {
  it('initialises with correct defaults', () => {
    const ctx = new BeastContext('proj-1', 'sess-1', 'hello world');
    expect(ctx.projectId).toBe('proj-1');
    expect(ctx.sessionId).toBe('sess-1');
    expect(ctx.userInput).toBe('hello world');
    expect(ctx.phase).toBe('ingestion');
    expect(ctx.tokenSpend.totalTokens).toBe(0);
    expect(ctx.audit).toEqual([]);
    expect(ctx.sanitizedIntent).toBeUndefined();
    expect(ctx.plan).toBeUndefined();
  });

  it('adds audit entries', () => {
    const ctx = new BeastContext('proj-1', 'sess-1', 'test');
    ctx.addAudit('firewall', 'scan', { clean: true });
    ctx.addAudit('planner', 'plan:created', { tasks: 3 });

    expect(ctx.audit).toHaveLength(2);
    expect(ctx.audit[0]!.module).toBe('firewall');
    expect(ctx.audit[0]!.action).toBe('scan');
    expect(ctx.audit[0]!.detail).toEqual({ clean: true });
    expect(ctx.audit[1]!.module).toBe('planner');
  });

  it('tracks elapsed time', async () => {
    vi.useFakeTimers();
    try {
      const ctx = new BeastContext('p', 's', 'input');
      vi.advanceTimersByTime(500);
      expect(ctx.elapsedMs()).toBe(500);
    } finally {
      vi.useRealTimers();
    }
  });

  it('allows mutation of phase and tokenSpend', () => {
    const ctx = new BeastContext('p', 's', 'input');
    ctx.phase = 'planning';
    ctx.tokenSpend = {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      estimatedCostUsd: 0.02,
    };
    expect(ctx.phase).toBe('planning');
    expect(ctx.tokenSpend.totalTokens).toBe(150);
  });

  it('allows setting sanitizedIntent', () => {
    const ctx = new BeastContext('p', 's', 'input');
    ctx.sanitizedIntent = {
      goal: 'refactor module',
      strategy: 'linear',
    };
    expect(ctx.sanitizedIntent.goal).toBe('refactor module');
  });
});

describe('createContext', () => {
  it('creates context from BeastInput', () => {
    const ctx = createContext({
      projectId: 'my-project',
      userInput: 'do something',
      sessionId: 'custom-session',
    });
    expect(ctx.projectId).toBe('my-project');
    expect(ctx.sessionId).toBe('custom-session');
    expect(ctx.userInput).toBe('do something');
  });

  it('generates sessionId when not provided', () => {
    const ctx = createContext({
      projectId: 'proj',
      userInput: 'input',
    });
    expect(ctx.sessionId).toBeTruthy();
    expect(ctx.sessionId.length).toBeGreaterThan(10); // UUID
  });
});
