import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { createGovernorApp } from '../../../src/server/app.js';
import { ApprovalGateway } from '../../../src/gateway/approval-gateway.js';
import { ApprovalWaiterRegistry } from '../../../src/gateway/approval-waiter-registry.js';
import { HttpApprovalChannel } from '../../../src/channels/http-channel.js';
import { defaultConfig } from '../../../src/core/config.js';
import type { GovernorConfig } from '../../../src/core/config.js';
import type { ApprovalRequest } from '../../../src/core/types.js';
import { ApprovalTimeoutError } from '../../../src/errors/index.js';

/**
 * Regression coverage for issue #411: the standalone governor HTTP app used
 * to store pending approvals with a placeholder `resolve: () => {}`, so
 * `POST /v1/approval/respond` reported "resolved" without ever waking a
 * caller that was actually awaiting the approval via `ApprovalGateway`.
 */
describe('standalone governor HTTP app wired to real approval waiters', () => {
  function makeRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
    return {
      requestId: 'req-http-1',
      taskId: 'task-1',
      projectId: 'proj-1',
      trigger: { triggered: true, triggerId: 'budget', reason: 'Over budget', severity: 'high' },
      summary: 'Deploy to production',
      timestamp: new Date('2026-01-01'),
      ...overrides,
    };
  }

  it('unblocks a caller awaiting ApprovalGateway.requestApproval() when POST /v1/approval/respond resolves it', async () => {
    const registry = new ApprovalWaiterRegistry();
    const app = createGovernorApp({ registry, allowUnsignedApprovalsForTests: true });
    const channel = new HttpApprovalChannel({ registry });
    const gateway = new ApprovalGateway({
      channel,
      auditRecorder: { record: async () => {} },
      config: defaultConfig(),
    });

    const outcomePromise = gateway.requestApproval(makeRequest());

    // The waiter must be visible via the HTTP app's own introspection before
    // it is resolved.
    const health = await (await app.request('/health')).json();
    expect(health.pendingApprovals).toBe(1);

    const res = await app.request('/v1/approval/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: 'req-http-1', decision: 'APPROVE' }),
    });
    expect(res.status).toBe(200);

    const outcome = await outcomePromise;
    expect(outcome.decision).toBe('APPROVE');

    const healthAfter = await (await app.request('/health')).json();
    expect(healthAfter.pendingApprovals).toBe(0);
  });

  it('propagates REGEN feedback from the HTTP response back to the awaiting caller', async () => {
    const registry = new ApprovalWaiterRegistry();
    const app = createGovernorApp({ registry, allowUnsignedApprovalsForTests: true });
    const channel = new HttpApprovalChannel({ registry });
    const gateway = new ApprovalGateway({
      channel,
      auditRecorder: { record: async () => {} },
      config: defaultConfig(),
    });

    const outcomePromise = gateway.requestApproval(makeRequest({ requestId: 'req-http-2' }));

    const res = await app.request('/v1/approval/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: 'req-http-2',
        decision: 'REGEN',
        feedback: 'Please add rollback plan',
      }),
    });
    expect(res.status).toBe(200);

    const outcome = await outcomePromise;
    expect(outcome.decision).toBe('REGEN');
    if (outcome.decision === 'REGEN') {
      expect(outcome.feedback).toBe('Please add rollback plan');
    }
  });

  /**
   * Regression coverage for a Codex review follow-up on PR #452: the
   * response handed to the registry never carried a `signature`, so a
   * caller using `ApprovalGateway` with `config.requireSignedApprovals:
   * true` would unblock only to immediately throw
   * `SignatureVerificationError` instead of producing an outcome.
   */
  it('propagates a verified signature so requireSignedApprovals accepts the HTTP response', async () => {
    const secret = 'shared-governor-secret';
    const registry = new ApprovalWaiterRegistry();
    const app = createGovernorApp({ registry, signingSecret: secret });
    const channel = new HttpApprovalChannel({ registry });
    const config: GovernorConfig = { ...defaultConfig(), requireSignedApprovals: true, signingSecret: secret };
    const gateway = new ApprovalGateway({
      channel,
      auditRecorder: { record: async () => {} },
      config,
    });

    const outcomePromise = gateway.requestApproval(makeRequest({ requestId: 'req-signed-1' }));

    const payload = JSON.stringify({ requestId: 'req-signed-1', decision: 'APPROVE' });
    const signature = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;

    const res = await app.request('/v1/approval/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-governor-signature': signature },
      body: payload,
    });
    expect(res.status).toBe(200);

    // Previously this rejected with SignatureVerificationError instead of
    // resolving, because the registry's ApprovalResponse never carried a
    // signature.
    await expect(outcomePromise).resolves.toMatchObject({ decision: 'APPROVE' });
  });

  it('rejects duplicate real waiters without orphaning the original requestId waiter', async () => {
    const registry = new ApprovalWaiterRegistry();

    const firstWaiter = registry.waitFor('req-duplicate-1', 'task-1', 'First approval');

    await expect(
      registry.waitFor('req-duplicate-1', 'task-2', 'Duplicate approval'),
    ).rejects.toThrow('Approval waiter already registered for requestId req-duplicate-1');

    expect(registry.size).toBe(1);

    const response = {
      requestId: 'req-duplicate-1',
      decision: 'APPROVE' as const,
      respondedBy: 'operator',
      respondedAt: new Date('2026-01-01T00:00:00Z'),
    };

    expect(registry.resolve('req-duplicate-1', response)).toBe(true);
    await expect(firstWaiter).resolves.toBe(response);
    expect(registry.size).toBe(0);
  });

  it('allows a real waiter to replace a placeholder and preserves it across later placeholder refreshes', async () => {
    const registry = new ApprovalWaiterRegistry();

    registry.register('req-placeholder-1', 'task-placeholder', 'Placeholder approval');
    const waiter = registry.waitFor('req-placeholder-1', 'task-real', 'Real approval');

    registry.register('req-placeholder-1', 'task-refreshed', 'Refreshed approval');

    expect(registry.get('req-placeholder-1')).toEqual({
      taskId: 'task-refreshed',
      summary: 'Refreshed approval',
    });

    const response = {
      requestId: 'req-placeholder-1',
      decision: 'REGEN' as const,
      feedback: 'Add tests',
      respondedBy: 'operator',
      respondedAt: new Date('2026-01-01T00:00:00Z'),
    };

    expect(registry.resolve('req-placeholder-1', response)).toBe(true);
    await expect(waiter).resolves.toBe(response);
  });

  /**
   * Regression coverage for a Codex review follow-up on PR #452:
   * `ApprovalGateway`'s own timeout fired without telling the channel, so
   * the registry entry (and thus `/health`'s pending count, and a late
   * inbound HTTP response) outlived the caller that gave up waiting.
   */
  it('purges the registry entry when ApprovalGateway times out, so late responses 404', async () => {
    const registry = new ApprovalWaiterRegistry();
    const app = createGovernorApp({ registry, allowUnsignedApprovalsForTests: true });
    const channel = new HttpApprovalChannel({ registry });
    const config: GovernorConfig = { ...defaultConfig(), timeoutMs: 20 };
    const gateway = new ApprovalGateway({
      channel,
      auditRecorder: { record: async () => {} },
      config,
    });

    await expect(
      gateway.requestApproval(makeRequest({ requestId: 'req-timeout-1' })),
    ).rejects.toThrow(ApprovalTimeoutError);

    // The abandoned request must no longer be visible or resolvable.
    const health = await (await app.request('/health')).json();
    expect(health.pendingApprovals).toBe(0);

    const res = await app.request('/v1/approval/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: 'req-timeout-1', decision: 'APPROVE' }),
    });
    expect(res.status).toBe(404);
  });
});
