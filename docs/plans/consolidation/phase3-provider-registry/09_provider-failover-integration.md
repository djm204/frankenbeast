# Chunk 3.9: Provider Failover Integration Test

**Phase:** 3 — Provider Registry + Adapters
**Depends on:** Chunk 3.2 (ProviderRegistry) + at least 2 adapter implementations
**Estimated size:** Medium (integration test only)

---

## Purpose

Prove that the `ProviderRegistry` correctly handles failover between providers, including brain state serialization and handoff context injection. This is the critical integration test for the entire provider-agnostic architecture.

## Test Scenarios

```typescript
// packages/franken-orchestrator/tests/integration/providers/provider-failover.test.ts

describe('Provider failover integration', () => {
  // Helper: create a mock provider that fails after N events
  function createFailingProvider(name: string, failAfter: number, error: string, retryable: boolean): ILlmProvider { ... }

  // Helper: create a mock provider that succeeds
  function createSuccessProvider(name: string): ILlmProvider { ... }

  describe('basic failover', () => {
    it('uses first provider when it succeeds', async () => {
      const registry = new ProviderRegistry(
        [createSuccessProvider('primary')],
        new SqliteBrain(),
      );
      const events = [];
      for await (const event of registry.execute(request)) {
        events.push(event);
      }
      expect(events.some(e => e.type === 'done')).toBe(true);
    });

    it('fails over to second provider on non-retryable error', async () => {
      const provider1 = createFailingProvider('primary', 0, 'auth failed', false);
      const provider2 = createSuccessProvider('secondary');

      const registry = new ProviderRegistry(
        [provider1, provider2],
        new SqliteBrain(),
      );

      const events = [];
      for await (const event of registry.execute(request)) {
        events.push(event);
      }
      expect(events.some(e => e.type === 'done')).toBe(true);
    });

    it('retries before failover on retryable error', async () => {
      const provider1 = createFailingProvider('primary', 0, 'rate limit', true);
      const provider2 = createSuccessProvider('secondary');

      const registry = new ProviderRegistry(
        [provider1, provider2],
        new SqliteBrain(),
        { maxRetriesPerProvider: 2 },
      );

      const events = [];
      for await (const event of registry.execute(request)) {
        events.push(event);
      }
      // provider1 should have been tried 3 times (1 + 2 retries)
      // Then failover to provider2
    });
  });

  describe('brain state handoff', () => {
    it('serializes brain state before switching providers', async () => {
      const brain = new SqliteBrain();
      brain.working.set('task', 'fix auth');
      brain.episodic.record({
        type: 'decision',
        summary: 'Decided to refactor auth module',
        createdAt: new Date().toISOString(),
      });

      const provider1 = createFailingProvider('primary', 0, 'crashed', false);
      const provider2 = createSuccessProvider('secondary');
      // Spy on provider2.formatHandoff

      const registry = new ProviderRegistry([provider1, provider2], brain);
      for await (const _ of registry.execute(request)) { /* consume */ }

      // Verify provider2.formatHandoff was called with a snapshot containing:
      // - working memory with task='fix auth'
      // - episodic events with the decision
      // - metadata.lastProvider = 'primary'
      // - metadata.switchReason containing 'crashed'
    });

    it('injects handoff context into systemPrompt', async () => {
      const brain = new SqliteBrain();
      brain.working.set('progress', 0.7);

      const provider1 = createFailingProvider('primary', 0, 'error', false);
      const provider2 = createSuccessProvider('secondary');

      const registry = new ProviderRegistry([provider1, provider2], brain);
      // Capture the request passed to provider2.execute()
      // Verify systemPrompt contains the handoff context

      for await (const _ of registry.execute({
        systemPrompt: 'Original prompt',
        messages: [],
      })) { /* consume */ }

      // provider2 should receive systemPrompt that includes:
      // 'Original prompt\n\n--- BRAIN STATE HANDOFF ---'
    });
  });

  describe('three-provider chain', () => {
    it('tries all three providers, third succeeds', async () => {
      const provider1 = createFailingProvider('claude', 0, 'rate limit', true);
      const provider2 = createFailingProvider('codex', 0, 'timeout', false);
      const provider3 = createSuccessProvider('gemini');

      const registry = new ProviderRegistry(
        [provider1, provider2, provider3],
        new SqliteBrain(),
        { maxRetriesPerProvider: 1 },
      );

      const events = [];
      for await (const event of registry.execute(request)) {
        events.push(event);
      }
      expect(events.some(e => e.type === 'done')).toBe(true);
    });
  });

  describe('all providers exhausted', () => {
    it('checkpoints brain and throws', async () => {
      const brain = new SqliteBrain();
      brain.working.set('task', 'important work');

      const provider1 = createFailingProvider('primary', 0, 'error1', false);
      const provider2 = createFailingProvider('secondary', 0, 'error2', false);

      const registry = new ProviderRegistry([provider1, provider2], brain);

      await expect(async () => {
        for await (const _ of registry.execute(request)) { /* consume */ }
      }).rejects.toThrow(/All providers exhausted/);

      // Verify brain checkpoint was created
      const checkpoint = brain.recovery.lastCheckpoint();
      expect(checkpoint).not.toBeNull();
      expect(checkpoint?.phase).toBe('provider-failover');
    });
  });

  describe('snapshot truncation on handoff', () => {
    it('truncates oversized BrainSnapshot to fit maxHandoffTokens', async () => {
      const brain = new SqliteBrain();
      // Fill brain with enough data to exceed a small context window
      for (let i = 0; i < 100; i++) {
        brain.episodic.record({
          type: 'observation',
          summary: `Step ${i}: ${'x'.repeat(500)}`,
          createdAt: new Date().toISOString(),
        });
      }

      const provider1 = createFailingProvider('primary', 0, 'error', false);
      const provider2 = createSuccessProvider('secondary');
      // Set secondary's maxHandoffTokens to something small
      (provider2 as any).capabilities.maxHandoffTokens = 2000;

      const registry = new ProviderRegistry([provider1, provider2], brain);
      for await (const _ of registry.execute(request)) { /* consume */ }

      // Verify formatHandoff was called with a truncated snapshot
      const snapshot = (provider2.formatHandoff as Mock).mock.calls[0][0];
      expect(snapshot.episodic.length).toBeLessThan(100);
      // Verify truncated snapshot is still valid (version, working, metadata intact)
      expect(snapshot.version).toBe(1);
      expect(snapshot.metadata.lastProvider).toBe('primary');
    });
  });

  describe('provider reordering', () => {
    it('uses new order after setOrder()', async () => {
      const provider1 = createSuccessProvider('claude');
      const provider2 = createSuccessProvider('codex');

      const registry = new ProviderRegistry([provider1, provider2], new SqliteBrain());
      expect(registry.currentProvider.name).toBe('claude');

      registry.setOrder(['codex', 'claude']);
      expect(registry.currentProvider.name).toBe('codex');
    });
  });
});
```

## Files

- **Add:** `packages/franken-orchestrator/tests/integration/providers/provider-failover.test.ts`

## Exit Criteria

- Basic failover works (first fails, second succeeds)
- Retry logic works (retryable errors trigger retries before failover)
- Brain state is serialized and passed to next provider via `formatHandoff()`
- Handoff context is injected into the `systemPrompt` of the fallback request
- Three-provider chain works (first two fail, third succeeds)
- All providers exhausted → brain checkpoint + descriptive error
- **Oversized snapshot truncation:** when `BrainSnapshot` exceeds a provider's `maxHandoffTokens` capability, `formatHandoff()` truncates episodic events (oldest first) and working memory (largest values first) to fit. Integration test verifies truncation produces a valid snapshot that still hydrates correctly.
- Provider reordering works via `setOrder()`
- Integration test uses real `SqliteBrain` (in-memory) with mock providers
