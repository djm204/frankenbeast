import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGovernorApp } from '../../../src/server/app.js';
import { createSessionToken } from '../../../src/security/session-token.js';
import { SessionTokenStore } from '../../../src/security/session-token-store.js';

const SIGNING_FIXTURE = ['test', 'signing', 'fixture'].join('-');

function governorSignature(rawBody: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

describe('Governor Hono Server', () => {
  describe('GET /health', () => {
    it('returns 200', async () => {
      const app = createGovernorApp();
      const res = await app.request('/health');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.pendingApprovals).toBe(0);
    });
  });

  describe('POST /v1/approval/request', () => {
    it('creates approval request', async () => {
      const app = createGovernorApp({ allowUnsignedApprovalsForTests: true });
      const res = await app.request('/v1/approval/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: 'req-1',
          taskId: 'task-1',
          summary: 'Deploy to production',
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.status).toBe('pending');
    });

    it('creates a signed approval request when a signing secret is configured', async () => {
      const app = createGovernorApp({ signingSecret: SIGNING_FIXTURE });
      const payload = JSON.stringify({
        requestId: 'req-signed',
        taskId: 'task-1',
        summary: 'Deploy to production',
      });

      const res = await app.request('/v1/approval/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-governor-signature': governorSignature(payload, SIGNING_FIXTURE),
        },
        body: payload,
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.status).toBe('pending');
    });

    it('rejects unsigned approval requests when a signing secret is configured', async () => {
      const app = createGovernorApp({ signingSecret: SIGNING_FIXTURE });
      const res = await app.request('/v1/approval/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: 'req-unsigned',
          taskId: 'task-1',
          summary: 'Deploy to production',
        }),
      });

      expect(res.status).toBe(401);
      const healthBody = await (await app.request('/health')).json();
      expect(healthBody.pendingApprovals).toBe(0);
    });

    it('rejects malformed JSON request bodies without registering approval state', async () => {
      const app = createGovernorApp({ signingSecret: SIGNING_FIXTURE });
      const payload = '{"requestId":"req-malformed"';
      const res = await app.request('/v1/approval/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-governor-signature': governorSignature(payload, SIGNING_FIXTURE),
        },
        body: payload,
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.message).toBe('Malformed JSON body');
      const healthBody = await (await app.request('/health')).json();
      expect(healthBody.pendingApprovals).toBe(0);
    });

    it('returns 400 for missing fields', async () => {
      const app = createGovernorApp({ allowUnsignedApprovalsForTests: true });
      const res = await app.request('/v1/approval/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: 'task-1' }),
      });

      expect(res.status).toBe(400);
    });

    it('applies backpressure when the pending approval queue reaches capacity', async () => {
      const app = createGovernorApp({
        allowUnsignedApprovalsForTests: true,
        approvalQueueBackpressure: { maxPendingApprovals: 2, retryAfterSeconds: 45 },
      });

      for (const requestId of ['req-1', 'req-2']) {
        const accepted = await app.request('/v1/approval/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId, taskId: 'task-1', summary: 'Deploy' }),
        });
        expect(accepted.status).toBe(201);
      }

      const rejected = await app.request('/v1/approval/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: 'req-3', taskId: 'task-1', summary: 'Deploy' }),
      });

      expect(rejected.status).toBe(429);
      expect(rejected.headers.get('Retry-After')).toBe('45');
      const body = await rejected.json();
      expect(body.error.code).toBe('approval_queue_backpressure');
      expect(body.error.message).toContain('Approval queue is at capacity');
      expect(body.error.pendingApprovals).toBe(2);
      expect(body.error.maxPendingApprovals).toBe(2);

      const healthBody = await (await app.request('/health')).json();
      expect(healthBody.pendingApprovals).toBe(2);
      expect(healthBody.approvalQueueBackpressure).toEqual({
        enabled: true,
        atCapacity: true,
        maxPendingApprovals: 2,
        remainingCapacity: 0,
      });
    });

    it('allows an existing pending approval to be refreshed while the queue is at capacity', async () => {
      const app = createGovernorApp({
        allowUnsignedApprovalsForTests: true,
        approvalQueueBackpressure: { maxPendingApprovals: 1 },
      });

      const created = await app.request('/v1/approval/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: 'req-1', taskId: 'task-1', summary: 'Deploy' }),
      });
      expect(created.status).toBe(201);

      const refreshed = await app.request('/v1/approval/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: 'req-1', taskId: 'task-1', summary: 'Updated summary' }),
      });

      expect(refreshed.status).toBe(201);
      const healthBody = await (await app.request('/health')).json();
      expect(healthBody.pendingApprovals).toBe(1);
    });
  });

  describe('POST /v1/approval/respond', () => {
    async function seedResponseApproval(
      app: ReturnType<typeof createGovernorApp>,
      requestId: string,
      secret?: string,
    ) {
      const payload = JSON.stringify({
        requestId,
        taskId: 'task-1',
        summary: 'Deploy',
      });
      await app.request('/v1/approval/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(secret ? { 'x-governor-signature': governorSignature(payload, secret) } : {}),
        },
        body: payload,
      });
    }

    it('resolves a pending approval', async () => {
      const app = createGovernorApp({ allowUnsignedApprovalsForTests: true });

      // Create approval
      await app.request('/v1/approval/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: 'req-1',
          taskId: 'task-1',
          summary: 'Deploy',
        }),
      });

      // Respond
      const res = await app.request('/v1/approval/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: 'req-1', decision: 'APPROVE' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.decision).toBe('APPROVE');
      expect(body.status).toBe('resolved');
    });

    it('returns 400 for an invalid decision value and preserves the pending request', async () => {
      const app = createGovernorApp({ allowUnsignedApprovalsForTests: true });

      // Create approval
      await app.request('/v1/approval/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: 'req-invalid',
          taskId: 'task-1',
          summary: 'Deploy',
        }),
      });

      // Respond with an impossible decision value
      const res = await app.request('/v1/approval/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: 'req-invalid', decision: 'YOLO' }),
      });

      expect(res.status).toBe(400);

      // The pending request must NOT have been consumed by the invalid attempt.
      const health = await app.request('/health');
      const healthBody = await health.json();
      expect(healthBody.pendingApprovals).toBe(1);

      // A subsequent valid decision should still resolve it.
      const valid = await app.request('/v1/approval/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: 'req-invalid', decision: 'APPROVE' }),
      });
      expect(valid.status).toBe(200);
    });

    it('returns 404 for unknown request', async () => {
      const app = createGovernorApp({ allowUnsignedApprovalsForTests: true });
      const res = await app.request('/v1/approval/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: 'nonexistent', decision: 'APPROVE' }),
      });

      expect(res.status).toBe(404);
    });

    it('verifies HMAC signature when signing secret configured', async () => {
      const secret = SIGNING_FIXTURE;
      const app = createGovernorApp({ signingSecret: secret });

      await seedResponseApproval(app, 'req-2', secret);

      // Respond with valid signature
      const payload = JSON.stringify({ requestId: 'req-2', decision: 'APPROVE' });

      const res = await app.request('/v1/approval/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-governor-signature': governorSignature(payload, secret),
        },
        body: payload,
      });

      expect(res.status).toBe(200);
    });

    it('verifies approval HMAC over raw body bytes including whitespace', async () => {
      const secret = SIGNING_FIXTURE;
      const app = createGovernorApp({ signingSecret: secret });
      await seedResponseApproval(app, 'req-raw-spacing', secret);

      const payload = '{\n  "requestId" : "req-raw-spacing",\n  "decision" : "APPROVE"\n}';

      const res = await app.request('/v1/approval/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-governor-signature': governorSignature(payload, secret),
        },
        body: payload,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('resolved');
    });

    it('requires signatures to match the exact raw body instead of parsed key ordering', async () => {
      const secret = SIGNING_FIXTURE;
      const app = createGovernorApp({ signingSecret: secret });
      await seedResponseApproval(app, 'req-key-order', secret);

      const payload = '{"decision":"APPROVE","requestId":"req-key-order"}';
      const canonicalButDifferentOrder = JSON.stringify({ requestId: 'req-key-order', decision: 'APPROVE' });

      const res = await app.request('/v1/approval/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-governor-signature': governorSignature(canonicalButDifferentOrder, secret),
        },
        body: payload,
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.message).toBe('Invalid signature');
    });

    it('accepts normalized sha256 hex signatures through the timing-safe compare path', async () => {
      const secret = SIGNING_FIXTURE;
      const app = createGovernorApp({ signingSecret: secret });
      await seedResponseApproval(app, 'req-upper-hex', secret);

      const payload = JSON.stringify({ requestId: 'req-upper-hex', decision: 'APPROVE' });
      const signature = governorSignature(payload, secret).toUpperCase();

      const res = await app.request('/v1/approval/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-governor-signature': signature,
        },
        body: payload,
      });

      expect(res.status).toBe(200);
    });

    it('rejects invalid signature using timing-safe hex comparison', async () => {
      const app = createGovernorApp({ signingSecret: SIGNING_FIXTURE });

      await seedResponseApproval(app, 'req-3', SIGNING_FIXTURE);

      const res = await app.request('/v1/approval/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-governor-signature': `sha256=${'0'.repeat(64)}`,
        },
        body: JSON.stringify({ requestId: 'req-3', decision: 'APPROVE' }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.message).toBe('Invalid signature');
    });

    it('returns a clear 401 for a malformed signature', async () => {
      const app = createGovernorApp({ signingSecret: SIGNING_FIXTURE });
      const res = await app.request('/v1/approval/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-governor-signature': 'sha256=not-hex',
        },
        body: JSON.stringify({ requestId: 'req-malformed', decision: 'APPROVE' }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.message).toBe('Malformed signature');
    });

    it('rejects unsigned approval responses when no signing secret is configured', async () => {
      const app = createGovernorApp();
      const res = await app.request('/v1/approval/respond', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId: 'r1', decision: 'approved' }),
      });
      expect(res.status).toBe(401);
    });

    it('rejects missing signature when secret configured', async () => {
      const app = createGovernorApp({ signingSecret: SIGNING_FIXTURE });

      const res = await app.request('/v1/approval/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: 'x', decision: 'APPROVE' }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.message).toBe('Missing signature');
    });
  });

  describe('POST /v1/approval/session/validate', () => {
    function makeStoredToken(store: SessionTokenStore) {
      const token = createSessionToken({
        approvalId: 'req-token',
        scope: 'deploy-prod',
        grantedBy: 'human',
        ttlMs: 3_600_000,
      });
      store.store(token);
      return token;
    }

    it('validates a stored session token', async () => {
      const store = new SessionTokenStore();
      const token = makeStoredToken(store);
      const app = createGovernorApp({
        sessionTokenStore: store,
        allowUnsignedApprovalsForTests: true,
      });

      const res = await app.request('/v1/approval/session/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenId: token.tokenId, scope: 'deploy-prod' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.valid).toBe(true);
      expect(body.token).toMatchObject({
        approvalId: 'req-token',
        scope: 'deploy-prod',
        grantedBy: 'human',
      });
      expect(body.token.tokenId).toBeUndefined();
      expect(store.isValid(token.tokenId, 'deploy-prod')).toBe(false);
    });

    it('validates tokens persisted by a separate store instance', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'governor-app-session-store-'));
      const persistenceFile = join(dir, 'tokens.json');
      try {
        const issuingStore = new SessionTokenStore({ persistenceFile });
        const token = makeStoredToken(issuingStore);
        const app = createGovernorApp({
          sessionTokenStorePath: persistenceFile,
          allowUnsignedApprovalsForTests: true,
        });

        const res = await app.request('/v1/approval/session/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokenId: token.tokenId }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.valid).toBe(true);
        expect(new SessionTokenStore({ persistenceFile }).isValid(token.tokenId)).toBe(false);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('allows only one concurrent validation request to claim a persisted token', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'governor-app-session-store-'));
      const persistenceFile = join(dir, 'tokens.json');
      try {
        const issuingStore = new SessionTokenStore({ persistenceFile });
        const token = makeStoredToken(issuingStore);
        const app = createGovernorApp({
          sessionTokenStorePath: persistenceFile,
          allowUnsignedApprovalsForTests: true,
        });

        const requests = Array.from({ length: 6 }, () => app.request('/v1/approval/session/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokenId: token.tokenId, scope: 'deploy-prod' }),
        }));

        const responses = await Promise.all(requests);
        expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
        expect(responses.filter((response) => response.status === 401)).toHaveLength(5);
        await Promise.all(responses.map((response) => response.json()));
        expect(new SessionTokenStore({ persistenceFile }).isValid(token.tokenId)).toBe(false);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('fails closed when token validation storage is unavailable', async () => {
      const app = createGovernorApp({ allowUnsignedApprovalsForTests: true });

      const res = await app.request('/v1/approval/session/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenId: 'missing-store' }),
      });

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error.message).toBe('Session token validation unavailable');
    });

    it('fails closed when persisted token storage is malformed before app startup', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'governor-app-session-store-'));
      const persistenceFile = join(dir, 'tokens.json');
      try {
        writeFileSync(persistenceFile, '{not-json');
        const app = createGovernorApp({
          sessionTokenStorePath: persistenceFile,
          allowUnsignedApprovalsForTests: true,
        });

        const health = await app.request('/health');
        expect(health.status).toBe(200);

        const res = await app.request('/v1/approval/session/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokenId: 'token-from-bad-store' }),
        });

        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.error.message).toBe('Session token validation unavailable');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('fails closed when persisted token storage becomes unreadable after app startup', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'governor-app-session-store-'));
      const persistenceFile = join(dir, 'tokens.json');
      try {
        const issuingStore = new SessionTokenStore({ persistenceFile });
        const token = makeStoredToken(issuingStore);
        const app = createGovernorApp({
          sessionTokenStorePath: persistenceFile,
          allowUnsignedApprovalsForTests: true,
        });
        writeFileSync(persistenceFile, '{not-json');

        const res = await app.request('/v1/approval/session/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokenId: token.tokenId }),
        });

        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.error.message).toBe('Session token validation unavailable');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('requires signed validation requests in production mode', async () => {
      const store = new SessionTokenStore();
      const token = makeStoredToken(store);
      const app = createGovernorApp({ signingSecret: SIGNING_FIXTURE, sessionTokenStore: store });
      const payload = JSON.stringify({ tokenId: token.tokenId });

      const missing = await app.request('/v1/approval/session/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
      expect(missing.status).toBe(401);

      const valid = await app.request('/v1/approval/session/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-governor-signature': governorSignature(payload, SIGNING_FIXTURE),
        },
        body: payload,
      });
      expect(valid.status).toBe(200);
    });

    it('rejects unknown tokens and scope mismatches', async () => {
      const store = new SessionTokenStore();
      const token = makeStoredToken(store);
      const app = createGovernorApp({
        sessionTokenStore: store,
        allowUnsignedApprovalsForTests: true,
      });

      const wrongScope = await app.request('/v1/approval/session/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenId: token.tokenId, scope: 'other-scope' }),
      });
      expect(wrongScope.status).toBe(401);
      expect(await wrongScope.json()).toEqual({ valid: false });

      const unknown = await app.request('/v1/approval/session/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenId: 'missing-token' }),
      });
      expect(unknown.status).toBe(401);
      expect(await unknown.json()).toEqual({ valid: false });
    });
  });

  describe('POST /v1/webhook/slack', () => {
    const SLACK_SECRET = ['slack', 'signing', 'fixture'].join('-');

    function slackHeaders(rawBody: string | Uint8Array, secret = SLACK_SECRET, timestamp?: string) {
      const ts = timestamp ?? Math.floor(Date.now() / 1000).toString();
      const sig = `v0=${createHmac('sha256', secret)
        .update(`v0:${ts}:`, 'utf8')
        .update(typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody)
        .digest('hex')}`;
      return {
        'Content-Type': 'application/json',
        'X-Slack-Request-Timestamp': ts,
        'X-Slack-Signature': sig,
      };
    }

    async function seedApproval(app: ReturnType<typeof createGovernorApp>, requestId: string) {
      await app.request('/v1/approval/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, taskId: 'task-1', summary: 'Deploy' }),
      });
    }

    it('rejects an unauthenticated (unsigned) Slack callback', async () => {
      const app = createGovernorApp({ slackSigningSecret: SLACK_SECRET, allowUnsignedApprovalsForTests: true });
      await seedApproval(app, 'req-1');

      const res = await app.request('/v1/webhook/slack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actions: [{ action_id: 'approve', value: 'req-1' }] }),
      });

      expect(res.status).toBe(401);
    });

    it('rejects a forged Slack callback with an invalid signature', async () => {
      const app = createGovernorApp({ slackSigningSecret: SLACK_SECRET, allowUnsignedApprovalsForTests: true });
      await seedApproval(app, 'req-1');

      const rawBody = JSON.stringify({ actions: [{ action_id: 'approve', value: 'req-1' }] });
      const res = await app.request('/v1/webhook/slack', {
        method: 'POST',
        headers: {
          ...slackHeaders(rawBody, 'wrong-secret'),
        },
        body: rawBody,
      });

      expect(res.status).toBe(401);
    });

    it('verifies Slack signatures against raw bytes before UTF-8 body parsing', async () => {
      const app = createGovernorApp({ slackSigningSecret: SLACK_SECRET, allowUnsignedApprovalsForTests: true });
      await seedApproval(app, 'req-1');

      const rawPrefix = Buffer.from(JSON.stringify({ actions: [{ action_id: 'approve', value: 'req-1' }] }), 'utf8');
      const rawBody = new Uint8Array([...rawPrefix, 0x80]);
      const res = await app.request('/v1/webhook/slack', {
        method: 'POST',
        headers: { ...slackHeaders(rawBody) },
        body: rawBody.buffer.slice(rawBody.byteOffset, rawBody.byteOffset + rawBody.byteLength),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: { message: 'Malformed Slack payload' } });
    });

    it('rejects a stale Slack timestamp (replay protection)', async () => {
      const app = createGovernorApp({ slackSigningSecret: SLACK_SECRET, allowUnsignedApprovalsForTests: true });
      await seedApproval(app, 'req-1');

      const rawBody = JSON.stringify({ actions: [{ action_id: 'approve', value: 'req-1' }] });
      const staleTs = (Math.floor(Date.now() / 1000) - 60 * 10).toString();
      const res = await app.request('/v1/webhook/slack', {
        method: 'POST',
        headers: { ...slackHeaders(rawBody, SLACK_SECRET, staleTs) },
        body: rawBody,
      });

      expect(res.status).toBe(401);
    });

    it('fails closed when no Slack signing secret is configured', async () => {
      const app = createGovernorApp();
      const res = await app.request('/v1/webhook/slack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actions: [{ action_id: 'approve', value: 'req-1' }] }),
      });

      expect(res.status).toBe(401);
    });

    it('resolves the pending approval on a valid signed callback', async () => {
      const app = createGovernorApp({ slackSigningSecret: SLACK_SECRET, allowUnsignedApprovalsForTests: true });
      await seedApproval(app, 'req-1');

      // Health shows one pending approval before the callback
      const before = await (await app.request('/health')).json();
      expect(before.pendingApprovals).toBe(1);

      const rawBody = JSON.stringify({ actions: [{ action_id: 'approve', value: 'req-1' }] });
      const res = await app.request('/v1/webhook/slack', {
        method: 'POST',
        headers: { ...slackHeaders(rawBody) },
        body: rawBody,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.source).toBe('slack');
      expect(body.decision).toBe('APPROVE');
      expect(body.status).toBe('resolved');

      // Pending approval is cleared after resolution
      const after = await (await app.request('/health')).json();
      expect(after.pendingApprovals).toBe(0);
    });

    it('returns 404 for a signed callback referencing an unknown request', async () => {
      const app = createGovernorApp({ slackSigningSecret: SLACK_SECRET, allowUnsignedApprovalsForTests: true });

      const rawBody = JSON.stringify({ actions: [{ action_id: 'approve', value: 'nope' }] });
      const res = await app.request('/v1/webhook/slack', {
        method: 'POST',
        headers: { ...slackHeaders(rawBody) },
        body: rawBody,
      });

      expect(res.status).toBe(404);
    });

    it('returns 400 for missing actions on a signed request', async () => {
      const app = createGovernorApp({ slackSigningSecret: SLACK_SECRET, allowUnsignedApprovalsForTests: true });
      const rawBody = JSON.stringify({ actions: [] });
      const res = await app.request('/v1/webhook/slack', {
        method: 'POST',
        headers: { ...slackHeaders(rawBody) },
        body: rawBody,
      });

      expect(res.status).toBe(400);
    });

    it('rejects an unknown action_id without consuming the pending approval', async () => {
      const app = createGovernorApp({ slackSigningSecret: SLACK_SECRET, allowUnsignedApprovalsForTests: true });
      await seedApproval(app, 'req-unknown');

      const rawBody = JSON.stringify({
        actions: [{ action_id: 'launch_nukes', value: 'req-unknown' }],
      });
      const res = await app.request('/v1/webhook/slack', {
        method: 'POST',
        headers: { ...slackHeaders(rawBody) },
        body: rawBody,
      });

      expect(res.status).toBe(400);

      // Pending approval must survive an unknown action so a valid callback can still resolve it.
      const after = await (await app.request('/health')).json();
      expect(after.pendingApprovals).toBe(1);
    });

    it('parses Slack form-encoded payloads and normalizes reject', async () => {
      const app = createGovernorApp({ slackSigningSecret: SLACK_SECRET, allowUnsignedApprovalsForTests: true });
      await seedApproval(app, 'req-9');

      const payloadJson = JSON.stringify({ actions: [{ action_id: 'reject', value: 'req-9' }] });
      const rawBody = `payload=${encodeURIComponent(payloadJson)}`;
      const ts = Math.floor(Date.now() / 1000).toString();
      const base = `v0:${ts}:${rawBody}`;
      const sig = `v0=${createHmac('sha256', SLACK_SECRET).update(base).digest('hex')}`;

      const res = await app.request('/v1/webhook/slack', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Slack-Request-Timestamp': ts,
          'X-Slack-Signature': sig,
        },
        body: rawBody,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.decision).toBe('ABORT');
      expect(body.status).toBe('resolved');
    });

    it('accepts signed Slack form payloads containing emoji text', async () => {
      const app = createGovernorApp({ slackSigningSecret: SLACK_SECRET, allowUnsignedApprovalsForTests: true });
      await seedApproval(app, 'req-emoji');

      const payloadJson = JSON.stringify({
        actions: [{ action_id: 'approve', value: 'req-emoji' }],
        message: { text: 'Ship it 🚀' },
      });
      const rawBody = `payload=${encodeURIComponent(payloadJson)}`;

      const res = await app.request('/v1/webhook/slack', {
        method: 'POST',
        headers: {
          ...slackHeaders(rawBody),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: rawBody,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.source).toBe('slack');
      expect(body.decision).toBe('APPROVE');
      expect(body.status).toBe('resolved');
    });
  });
});
