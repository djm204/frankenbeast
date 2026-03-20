# Chunk 8.5: End-to-End Integration Test

**Phase:** 8 — Wire Everything Together
**Depends on:** Chunks 8.1–8.4 plus Chunks 8.6–8.8, including Chunk 8.7 (final verification after all Phase 8 functional work)
**Estimated size:** Medium (~150 lines)

---

## Purpose

Prove the entire consolidated stack works end-to-end as the **last Phase 8 verification pass**: Beast Loop execution through multiple providers with failover, brain state preserved across switches, audit trail capturing the full execution including provider switches, and dashboard SSE receiving all events after the UI/API wiring is complete.

## Implementation

```typescript
// packages/franken-orchestrator/tests/integration/e2e/full-beast-loop.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createBeastDependencies } from '../../../src/beasts/dep-factory.js';
import { runBeastLoop } from '../../../src/beasts/beast-loop.js';
import { SqliteBrain } from '@frankenbeast/brain';
import type { RunConfig } from '../../../src/cli/run-config-loader.js';

describe('Full Beast Loop E2E', () => {
  let tempDbPath: string;

  beforeAll(async () => {
    tempDbPath = path.join(os.tmpdir(), `frankenbeast-e2e-${Date.now()}.db`);
  });

  afterAll(async () => {
    // Cleanup temp DB
    try { await fs.unlink(tempDbPath); } catch { /* ignore */ }
  });

  it('executes through primary provider successfully', async () => {
    const config: RunConfig = {
      providers: [
        { name: 'mock-primary', type: 'mock', responses: ['Hello from primary'] },
      ],
      brain: { dbPath: tempDbPath },
      security: { profile: 'standard' },
    };

    const deps = createBeastDependencies(config);
    const result = await runBeastLoop(deps, 'test objective');

    // Verify execution completed
    expect(result.status).toBe('completed');

    // Verify brain has execution state
    const snapshot = deps.brain.serialize();
    expect(snapshot.working.get('lastExecution')).toBeDefined();

    // Verify audit trail recorded all phases
    const phaseStarts = deps.auditTrail.getByType('phase.start');
    expect(phaseStarts.map(e => e.payload.phase)).toEqual([
      'ingestion', 'planning', 'execution', 'closure',
    ]);
  });

  it('fails over to secondary provider on rate limit', async () => {
    const config: RunConfig = {
      providers: [
        {
          name: 'mock-primary',
          type: 'mock',
          behavior: 'rate-limit-on-first-call',
        },
        {
          name: 'mock-secondary',
          type: 'mock',
          responses: ['Hello from secondary'],
        },
      ],
      brain: { dbPath: ':memory:' },
      security: { profile: 'standard' },
    };

    const deps = createBeastDependencies(config);
    const result = await runBeastLoop(deps, 'test objective with failover');

    // Verify execution completed via secondary
    expect(result.status).toBe('completed');

    // Verify provider switch was recorded
    const switchEvents = deps.auditTrail.getByType('provider.switch');
    expect(switchEvents).toHaveLength(1);
    expect(switchEvents[0].payload).toMatchObject({
      from: 'mock-primary',
      to: 'mock-secondary',
      reason: expect.stringContaining('rate'),
    });
  });

  it('preserves brain state across provider switch', async () => {
    // Pre-populate brain with working memory
    const brain = new SqliteBrain(':memory:');
    brain.working.set('context', 'important context data');
    brain.episodic.record({
      type: 'prior-execution',
      content: 'Previous work summary',
      metadata: {},
    });

    const snapshot = brain.serialize();

    const config: RunConfig = {
      providers: [
        { name: 'mock-primary', type: 'mock', behavior: 'rate-limit-on-first-call' },
        { name: 'mock-secondary', type: 'mock', responses: ['completed with context'] },
      ],
      brain: { dbPath: ':memory:', snapshot },
      security: { profile: 'standard' },
    };

    const deps = createBeastDependencies(config);
    const result = await runBeastLoop(deps, 'use existing context');

    // Verify brain state survived the switch
    const finalSnapshot = deps.brain.serialize();
    expect(finalSnapshot.working.get('context')).toBe('important context data');

    // Verify provider switch event includes brain snapshot hash
    const switchEvents = deps.auditTrail.getByType('provider.switch');
    expect(switchEvents[0].payload.brainSnapshotHash).toMatch(/^sha256:/);
  });

  it('handles all providers exhausted gracefully', async () => {
    const config: RunConfig = {
      providers: [
        { name: 'mock-primary', type: 'mock', behavior: 'always-fail' },
        { name: 'mock-secondary', type: 'mock', behavior: 'always-fail' },
      ],
      brain: { dbPath: ':memory:' },
      security: { profile: 'standard' },
    };

    const deps = createBeastDependencies(config);
    const result = await runBeastLoop(deps, 'doomed objective');

    // Verify graceful failure
    expect(result.status).toBe('failed');
    expect(result.error).toContain('All providers exhausted');

    // Verify brain checkpoint was saved for recovery
    const checkpoints = deps.brain.recovery.listCheckpoints();
    expect(checkpoints.length).toBeGreaterThan(0);
  });

  it('applies security middleware to request and response', async () => {
    const config: RunConfig = {
      providers: [
        {
          name: 'mock-primary',
          type: 'mock',
          responses: ['Response with user@email.com PII'],
        },
      ],
      brain: { dbPath: ':memory:' },
      security: { profile: 'strict' },  // strict enables PII masking
    };

    const deps = createBeastDependencies(config);
    const result = await runBeastLoop(deps, 'test security');

    // Verify PII was masked in the response
    const executionEvents = deps.auditTrail.getByType('llm.text');
    const responseText = executionEvents.map(e => e.payload.text).join('');
    expect(responseText).not.toContain('user@email.com');
    expect(responseText).toContain('[EMAIL]');
  });

  it('three-provider failover chain', async () => {
    const config: RunConfig = {
      providers: [
        { name: 'provider-a', type: 'mock', behavior: 'rate-limit-on-first-call' },
        { name: 'provider-b', type: 'mock', behavior: 'rate-limit-on-first-call' },
        { name: 'provider-c', type: 'mock', responses: ['Finally succeeded'] },
      ],
      brain: { dbPath: ':memory:' },
      security: { profile: 'standard' },
    };

    const deps = createBeastDependencies(config);
    const result = await runBeastLoop(deps, 'triple failover test');

    expect(result.status).toBe('completed');

    const switchEvents = deps.auditTrail.getByType('provider.switch');
    expect(switchEvents).toHaveLength(2);
    expect(switchEvents[0].payload).toMatchObject({ from: 'provider-a', to: 'provider-b' });
    expect(switchEvents[1].payload).toMatchObject({ from: 'provider-b', to: 'provider-c' });
  });

  it('audit trail captures complete execution timeline', async () => {
    const config: RunConfig = {
      providers: [
        { name: 'mock-primary', type: 'mock', responses: ['Test response'] },
      ],
      brain: { dbPath: ':memory:' },
      security: { profile: 'standard' },
    };

    const deps = createBeastDependencies(config);
    await runBeastLoop(deps, 'audit trail test');

    // Verify audit trail is complete and ordered
    const allEvents = deps.auditTrail.getAll();
    expect(allEvents.length).toBeGreaterThan(0);

    // Every event has required fields
    for (const event of allEvents) {
      expect(event.eventId).toBeDefined();
      expect(event.timestamp).toBeDefined();
      expect(event.phase).toBeDefined();
      expect(event.provider).toBeDefined();
      expect(event.type).toBeDefined();
    }

    // Phase events are in order
    const phaseStarts = allEvents
      .filter(e => e.type === 'phase.start')
      .map(e => e.payload.phase);
    expect(phaseStarts).toEqual(['ingestion', 'planning', 'execution', 'closure']);

    // Replay produces valid timeline
    const replayer = new ExecutionReplayer();
    const timeline = replayer.replay(deps.auditTrail);
    expect(timeline.phases).toHaveLength(4);
    expect(timeline.totalDurationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('Dashboard SSE E2E', () => {
  it('dashboard receives all beast events via SSE', async () => {
    // Start chat server
    const app = createChatApp(testConfig);
    const server = serve({ fetch: app.fetch, port: 0 });
    const port = (server.address() as AddressInfo).port;

    // Connect SSE client
    const events: any[] = [];
    const eventSource = new EventSource(`http://localhost:${port}/api/beasts/test-run/events`);
    eventSource.onmessage = (e) => events.push(JSON.parse(e.data));

    // Start a beast run
    const response = await fetch(`http://localhost:${port}/api/beasts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objective: 'SSE test' }),
    });
    expect(response.status).toBe(201);

    // Wait for completion
    await waitForEvent(events, 'phase.end', { phase: 'closure' });

    // Verify SSE received all phase events
    const phaseStarts = events.filter(e => e.type === 'phase.start');
    expect(phaseStarts.map(e => e.payload.phase)).toEqual([
      'ingestion', 'planning', 'execution', 'closure',
    ]);

    eventSource.close();
    server.close();
  });
});
```

## Mock Provider

The E2E tests use a `MockProvider` that implements `ILlmProvider` for deterministic testing:

```typescript
// packages/franken-orchestrator/tests/helpers/mock-provider.ts

export class MockProvider implements ILlmProvider {
  name: string;
  private behavior: 'success' | 'rate-limit-on-first-call' | 'always-fail';
  private responses: string[];
  private callCount = 0;

  constructor(config: MockProviderConfig) {
    this.name = config.name;
    this.behavior = config.behavior ?? 'success';
    this.responses = config.responses ?? ['mock response'];
  }

  async isAvailable(): Promise<boolean> { return true; }

  capabilities(): ProviderCapabilities {
    return { streaming: true, mcp: false, skillDiscovery: false, maxContextTokens: 100_000 };
  }

  async *execute(request: LlmRequest): AsyncGenerator<LlmStreamEvent> {
    this.callCount++;

    if (this.behavior === 'always-fail') {
      throw new ProviderError('Mock failure', { retryable: false });
    }

    if (this.behavior === 'rate-limit-on-first-call' && this.callCount === 1) {
      throw new ProviderError('Rate limited', { retryable: true, retryAfterMs: 0 });
    }

    const response = this.responses[this.callCount - 1] ?? this.responses[0];
    yield { type: 'text', text: response };
    yield { type: 'stop', reason: 'end_turn', usage: { inputTokens: 10, outputTokens: 5 } };
  }
}
```

## Files

- **Add:** `packages/franken-orchestrator/tests/integration/e2e/full-beast-loop.test.ts`
- **Add:** `packages/franken-orchestrator/tests/helpers/mock-provider.ts`

## Exit Criteria

- Full Beast Loop executes through single provider successfully
- Provider failover works: primary rate-limits → secondary takes over
- Three-provider failover chain works
- Brain state preserved across provider switch (working memory + episodic memory survive)
- All-providers-exhausted produces graceful failure with recovery checkpoint
- Security middleware applies to request and response (PII masking verified)
- Audit trail captures complete execution with all phase events in order
- Audit trail is replayable via `ExecutionReplayer`
- Dashboard SSE receives all beast events
- Provider switch events include brain snapshot hash
