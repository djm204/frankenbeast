import { describe, it, expect } from 'vitest';
import { createGovernorApp } from '../../../src/server/app.js';
import { ApprovalGateway } from '../../../src/gateway/approval-gateway.js';
import { ApprovalWaiterRegistry } from '../../../src/gateway/approval-waiter-registry.js';
import { HttpApprovalChannel } from '../../../src/channels/http-channel.js';
import { defaultConfig } from '../../../src/core/config.js';
import type { ApprovalRequest } from '../../../src/core/types.js';

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
});
