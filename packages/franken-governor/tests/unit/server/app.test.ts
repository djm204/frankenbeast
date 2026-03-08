import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { createGovernorApp } from '../../../src/server/app.js';

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
      const app = createGovernorApp();
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

    it('returns 400 for missing fields', async () => {
      const app = createGovernorApp();
      const res = await app.request('/v1/approval/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: 'task-1' }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /v1/approval/respond', () => {
    it('resolves a pending approval', async () => {
      const app = createGovernorApp();

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

    it('returns 404 for unknown request', async () => {
      const app = createGovernorApp();
      const res = await app.request('/v1/approval/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: 'nonexistent', decision: 'APPROVE' }),
      });

      expect(res.status).toBe(404);
    });

    it('verifies HMAC signature when signing secret configured', async () => {
      const secret = 'test-secret';
      const app = createGovernorApp({ signingSecret: secret });

      // Create approval
      await app.request('/v1/approval/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: 'req-2',
          taskId: 'task-2',
          summary: 'Test',
        }),
      });

      // Respond with valid signature
      const payload = JSON.stringify({ requestId: 'req-2', decision: 'APPROVE' });
      const signature = createHmac('sha256', secret).update(payload).digest('hex');

      const res = await app.request('/v1/approval/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-governor-signature': `sha256=${signature}`,
        },
        body: payload,
      });

      expect(res.status).toBe(200);
    });

    it('rejects invalid signature', async () => {
      const app = createGovernorApp({ signingSecret: 'secret' });

      await app.request('/v1/approval/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: 'req-3',
          taskId: 'task-3',
          summary: 'Test',
        }),
      });

      const res = await app.request('/v1/approval/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-governor-signature': 'sha256=invalid',
        },
        body: JSON.stringify({ requestId: 'req-3', decision: 'APPROVE' }),
      });

      expect(res.status).toBe(401);
    });

    it('rejects missing signature when secret configured', async () => {
      const app = createGovernorApp({ signingSecret: 'secret' });

      const res = await app.request('/v1/approval/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: 'x', decision: 'APPROVE' }),
      });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /v1/webhook/slack', () => {
    it('processes Slack interactive action', async () => {
      const app = createGovernorApp();
      const res = await app.request('/v1/webhook/slack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actions: [{ action_id: 'approve', value: 'req-1' }],
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.source).toBe('slack');
      expect(body.decision).toBe('approve');
    });

    it('returns 400 for missing actions', async () => {
      const app = createGovernorApp();
      const res = await app.request('/v1/webhook/slack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actions: [] }),
      });

      expect(res.status).toBe(400);
    });
  });
});
