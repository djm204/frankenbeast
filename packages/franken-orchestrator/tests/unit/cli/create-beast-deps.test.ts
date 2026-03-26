import { describe, it, expect, vi } from 'vitest';
import { createBeastDeps, type BeastDepsConfig, type ExistingDeps } from '../../../src/cli/create-beast-deps.js';
import { MiddlewareChainFirewallAdapter } from '../../../src/adapters/middleware-firewall-adapter.js';
import { SqliteBrainMemoryAdapter } from '../../../src/adapters/brain-memory-adapter.js';
import { ReflectionHeartbeatAdapter } from '../../../src/adapters/reflection-heartbeat-adapter.js';
import { SkillManagerAdapter } from '../../../src/adapters/skill-manager-adapter.js';
import { AuditTrailObserverAdapter } from '../../../src/adapters/audit-observer-adapter.js';

function mockExistingDeps(): ExistingDeps {
  return {
    planner: { createPlan: vi.fn().mockResolvedValue({ tasks: [] }) },
    critique: { reviewPlan: vi.fn().mockResolvedValue({ verdict: 'pass', findings: [], score: 1 }) },
    governor: { requestApproval: vi.fn().mockResolvedValue({ decision: 'approved' }) },
    observer: {
      startTrace: vi.fn(),
      startSpan: vi.fn(() => ({ end: vi.fn() })),
      getTokenSpend: vi.fn().mockResolvedValue({ inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 }),
    },
    logger: {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
}

const minimalConfig: BeastDepsConfig = {
  providers: [{ name: 'claude', type: 'claude-cli' }],
};

describe('createBeastDeps()', () => {
  it('returns valid BeastLoopDeps with all required fields', () => {
    const deps = createBeastDeps(minimalConfig, mockExistingDeps());
    expect(deps.firewall).toBeDefined();
    expect(deps.skills).toBeDefined();
    expect(deps.memory).toBeDefined();
    expect(deps.planner).toBeDefined();
    expect(deps.observer).toBeDefined();
    expect(deps.critique).toBeDefined();
    expect(deps.governor).toBeDefined();
    expect(deps.heartbeat).toBeDefined();
    expect(deps.logger).toBeDefined();
    expect(deps.clock).toBeDefined();
  });

  it('adapts firewall to MiddlewareChainFirewallAdapter', () => {
    const deps = createBeastDeps(minimalConfig, mockExistingDeps());
    expect(deps.firewall).toBeInstanceOf(MiddlewareChainFirewallAdapter);
  });

  it('adapts memory to SqliteBrainMemoryAdapter', () => {
    const deps = createBeastDeps(minimalConfig, mockExistingDeps());
    expect(deps.memory).toBeInstanceOf(SqliteBrainMemoryAdapter);
  });

  it('adapts heartbeat to ReflectionHeartbeatAdapter', () => {
    const deps = createBeastDeps(minimalConfig, mockExistingDeps());
    expect(deps.heartbeat).toBeInstanceOf(ReflectionHeartbeatAdapter);
  });

  it('adapts skills to SkillManagerAdapter', () => {
    const deps = createBeastDeps(minimalConfig, mockExistingDeps());
    expect(deps.skills).toBeInstanceOf(SkillManagerAdapter);
  });

  it('wraps observer with AuditTrailObserverAdapter', () => {
    const deps = createBeastDeps(minimalConfig, mockExistingDeps());
    expect(deps.observer).toBeInstanceOf(AuditTrailObserverAdapter);
  });

  it('provides direct access to new components', () => {
    const deps = createBeastDeps(minimalConfig, mockExistingDeps());
    expect(deps.providerRegistry).toBeDefined();
    expect(deps.sqliteBrain).toBeDefined();
    expect(deps.auditTrail).toBeDefined();
    expect(deps.middlewareChain).toBeDefined();
    expect(deps.skillManager).toBeDefined();
  });

  it('builds multiple providers from config', () => {
    const deps = createBeastDeps({
      providers: [
        { name: 'primary', type: 'claude-cli' },
        { name: 'fallback', type: 'anthropic-api', apiKey: 'sk-test' },
      ],
    }, mockExistingDeps());
    expect(deps.providerRegistry!.getProviders()).toHaveLength(2);
  });

  it('throws helpful error when no providers configured', () => {
    expect(() =>
      createBeastDeps({ providers: [] }, mockExistingDeps()),
    ).toThrow(/frankenbeast provider add/);
  });

  it('passes through existing deps unchanged', () => {
    const existing = mockExistingDeps();
    const deps = createBeastDeps(minimalConfig, existing);
    expect(deps.planner).toBe(existing.planner);
    expect(deps.critique).toBe(existing.critique);
    expect(deps.governor).toBe(existing.governor);
    expect(deps.logger).toBe(existing.logger);
  });

  it('creates SqliteBrain with default :memory:', () => {
    const deps = createBeastDeps(minimalConfig, mockExistingDeps());
    expect(deps.sqliteBrain).toBeDefined();
    deps.sqliteBrain!.close();
  });

  it('creates AuditTrail', () => {
    const deps = createBeastDeps(minimalConfig, mockExistingDeps());
    expect(deps.auditTrail!.getAll()).toHaveLength(0);
  });

  it('creates SkillManager with default directory', () => {
    const deps = createBeastDeps(minimalConfig, mockExistingDeps());
    expect(deps.skillManager).toBeDefined();
  });
});
