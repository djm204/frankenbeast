# Chunk 7.3: Provider Switch Audit Integration

**Phase:** 7 — Observer Audit Trail
**Depends on:** Chunk 7.1 + Phase 3 (ProviderRegistry)
**Estimated size:** Small (~50 lines + tests)

---

## Purpose

Wire the `ProviderRegistry` to emit audit events when switching providers. The observer records provider switches with the brain snapshot hash so auditors can verify the handoff.

## Implementation

### Add observer hook to ProviderRegistry

```typescript
// Modify: packages/franken-orchestrator/src/providers/provider-registry.ts

export interface ProviderRegistryOptions {
  // ...existing options...
  onProviderSwitch?: (event: {
    from: string;
    to: string;
    reason: string;
    brainSnapshotHash: string;
  }) => void;
}

// In the execute() method, when switching providers:
if (i > 0 && this.options.onProviderSwitch) {
  const snapshot = this.brain.serialize();
  const snapshotJson = JSON.stringify(snapshot);
  const hash = 'sha256:' + createHash('sha256').update(snapshotJson).digest('hex');

  this.options.onProviderSwitch({
    from: this.providers[this.currentProviderIndex].name,
    to: provider.name,
    reason: lastError?.message ?? 'unknown',
    brainSnapshotHash: hash,
  });
}
```

### Wire to AuditTrail in orchestrator setup

```typescript
// In dep-factory.ts or Beast Loop setup
const auditTrail = new AuditTrail();
const registry = new ProviderRegistry(providers, brain, {
  onProviderSwitch: (event) => {
    auditTrail.append(createAuditEvent('provider.switch', event, {
      phase: currentPhase,
      provider: event.to,
    }));
  },
});
```

## Tests

```typescript
describe('Provider switch audit integration', () => {
  it('emits provider.switch audit event on failover', async () => {
    const auditTrail = new AuditTrail();
    const onSwitch = vi.fn((event) => {
      auditTrail.append(createAuditEvent('provider.switch', event, {
        phase: 'execution',
        provider: event.to,
      }));
    });

    const registry = new ProviderRegistry(
      [failingProvider, successProvider],
      brain,
      { onProviderSwitch: onSwitch },
    );

    for await (const _ of registry.execute(request)) { /* consume */ }

    expect(onSwitch).toHaveBeenCalledOnce();
    expect(onSwitch).toHaveBeenCalledWith(expect.objectContaining({
      from: 'primary',
      to: 'secondary',
      brainSnapshotHash: expect.stringMatching(/^sha256:/),
    }));

    const switchEvents = auditTrail.getByType('provider.switch');
    expect(switchEvents).toHaveLength(1);
    expect(switchEvents[0].payload).toMatchObject({
      from: 'primary',
      to: 'secondary',
    });
  });

  it('includes brain snapshot hash for verification', async () => {
    // Verify the hash matches the actual serialized brain state
  });

  it('does not emit event when no switch occurs', async () => {
    const onSwitch = vi.fn();
    const registry = new ProviderRegistry(
      [successProvider],
      brain,
      { onProviderSwitch: onSwitch },
    );

    for await (const _ of registry.execute(request)) { /* consume */ }
    expect(onSwitch).not.toHaveBeenCalled();
  });
});
```

## Files

- **Modify:** `packages/franken-orchestrator/src/providers/provider-registry.ts` — add `onProviderSwitch` callback
- **Add:** `packages/franken-orchestrator/tests/integration/providers/provider-switch-audit.test.ts`

## Exit Criteria

- `ProviderRegistry` emits `onProviderSwitch` callback when switching providers
- Callback includes from/to provider names, reason, and brain snapshot hash
- Audit trail records `provider.switch` events
- Brain snapshot hash is verifiable (SHA-256 of serialized snapshot)
- No event emitted when first provider succeeds (no switch)
