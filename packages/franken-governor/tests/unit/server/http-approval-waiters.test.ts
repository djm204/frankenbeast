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

  it('exposes anomaly notices for pending HTTP operator approvals', async () => {
    const registry = new ApprovalWaiterRegistry();
    const app = createGovernorApp({ registry, allowUnsignedApprovalsForTests: true });
    const waiter = registry.waitFor(
      'req-anomaly-1',
      'task-1',
      'Deploy to production',
      'Approval anomaly detected. Respond with ACK-APPROVAL-ANOMALY-cmVxLWFub21hbHktMQ.',
    );

    const res = await app.request('/v1/approval/pending');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      approvals: [{
        requestId: 'req-anomaly-1',
        taskId: 'task-1',
        summary: 'Deploy to production',
        approvalAnomalyNotice: 'Approval anomaly detected. Respond with ACK-APPROVAL-ANOMALY-cmVxLWFub21hbHktMQ.',
      }],
    });

    registry.resolve('req-anomaly-1', {
      requestId: 'req-anomaly-1',
      decision: 'ABORT',
      respondedBy: 'operator',
      respondedAt: new Date('2026-01-01T00:00:00Z'),
    });
    await expect(waiter).resolves.toMatchObject({ decision: 'ABORT' });
  });

  it('requires governor auth before listing pending HTTP operator approvals', async () => {
    const secret = 'shared-governor-secret';
    const registry = new ApprovalWaiterRegistry();
    const app = createGovernorApp({ registry, signingSecret: secret });
    registry.register('req-auth-1', 'task-1', 'Sensitive approval');

    const unsigned = await app.request('/v1/approval/pending');
    expect(unsigned.status).toBe(401);

    const signature = `sha256=${createHmac('sha256', secret).update(Buffer.alloc(0)).digest('hex')}`;
    const signed = await app.request('/v1/approval/pending', {
      headers: { 'x-governor-signature': signature },
    });
    expect(signed.status).toBe(200);
    await expect(signed.json()).resolves.toEqual({
      approvals: [{ requestId: 'req-auth-1', taskId: 'task-1', summary: 'Sensitive approval' }],
    });
  });

  it('allows a real waiter to replace a placeholder and preserves it across later placeholder refreshes', async () => {
    const registry = new ApprovalWaiterRegistry();

    registry.register('req-placeholder-1', 'task-placeholder', 'Placeholder approval');
    const waiter = registry.waitFor(
      'req-placeholder-1',
      'task-real',
      'Real approval',
      'Approval anomaly detected. Respond with ACK-APPROVAL-ANOMALY-cmVxLXBsYWNlaG9sZGVyLTE.',
    );

    registry.register('req-placeholder-1', 'task-refreshed', 'Refreshed approval');

    expect(registry.get('req-placeholder-1')).toEqual({
      taskId: 'task-refreshed',
      summary: 'Refreshed approval',
      approvalAnomalyNotice: 'Approval anomaly detected. Respond with ACK-APPROVAL-ANOMALY-cmVxLXBsYWNlaG9sZGVyLTE.',
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

  it('delivers an HTTP response that arrives after placeholder registration but before the real waiter', async () => {
    const registry = new ApprovalWaiterRegistry();
    const app = createGovernorApp({ registry, allowUnsignedApprovalsForTests: true });

    registry.register('req-out-of-order-1', 'task-1', 'Deploy');
    const response = await app.request('/v1/approval/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: 'req-out-of-order-1', decision: 'APPROVE' }),
    });
    expect(response.status).toBe(200);
    expect(registry.size).toBe(0);

    // A retry of the request metadata must not overwrite the already accepted
    // decision before the in-process channel attaches its waiter.
    registry.register('req-out-of-order-1', 'task-1', 'Deploy retry');
    await expect(
      registry.waitFor('req-out-of-order-1', 'task-1', 'Deploy'),
    ).resolves.toMatchObject({
      requestId: 'req-out-of-order-1',
      decision: 'APPROVE',
      respondedBy: 'http-operator',
    });
    expect(registry.size).toBe(0);
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
