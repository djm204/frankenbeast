import { Hono } from 'hono';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { RESPONSE_CODES } from '../core/types.js';

const VALID_DECISIONS = new Set<string>(RESPONSE_CODES);

export interface GovernorAppOptions {
  signingSecret?: string;
  /** Slack signing secret used to verify `X-Slack-Signature` on inbound callbacks. */
  slackSigningSecret?: string;
  slackWebhookUrl?: string;
  allowUnsignedApprovalsForTests?: boolean;
}

/** Maximum age (seconds) for a Slack request timestamp before it is rejected as a replay. */
const SLACK_MAX_TIMESTAMP_SKEW_SECONDS = 60 * 5;

/** Timing-safe comparison of two equal-purpose strings. */
function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/** Map a raw Slack action_id into a domain decision (ResponseCode). */
function normalizeSlackDecision(actionId: unknown): string {
  switch (String(actionId).toLowerCase()) {
    case 'approve':
      return 'APPROVE';
    case 'reject':
    case 'deny':
    case 'abort':
      return 'ABORT';
    case 'regen':
    case 'regenerate':
      return 'REGEN';
    case 'debug':
      return 'DEBUG';
    default:
      return String(actionId).toUpperCase();
  }
}

export function createGovernorApp(options: GovernorAppOptions = {}): Hono {
  const app = new Hono();
  const pendingApprovals = new Map<string, {
    taskId: string;
    summary: string;
    resolve: (decision: string) => void;
  }>();

  // Health check
  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
      service: 'franken-governor',
      pendingApprovals: pendingApprovals.size,
    });
  });

  // POST /v1/approval/request — submit an approval request
  app.post('/v1/approval/request', async (c) => {
    const body = await c.req.json();

    if (!body.requestId || !body.taskId || !body.summary) {
      return c.json(
        { error: { message: 'Missing required fields: requestId, taskId, summary' } },
        400,
      );
    }

    pendingApprovals.set(body.requestId, {
      taskId: body.taskId,
      summary: body.summary,
      resolve: () => {}, // placeholder
    });

    return c.json({
      requestId: body.requestId,
      status: 'pending',
      message: 'Approval request created',
    }, 201);
  });

  // POST /v1/approval/respond — respond to an approval request
  app.post('/v1/approval/respond', async (c) => {
    const body = await c.req.json();

    // Fail closed: unsigned approval responses are rejected unless a signing
    // secret is configured (then verified) or an explicit test flag is set.
    if (!options.signingSecret) {
      if (!options.allowUnsignedApprovalsForTests) {
        return c.json({ error: { message: 'Signing secret required for approval responses' } }, 401);
      }
    } else {
      const signature = c.req.header('x-governor-signature');
      if (!signature) {
        return c.json({ error: { message: 'Missing signature' } }, 401);
      }

      const rawBody = JSON.stringify(body);
      const expected = createHmac('sha256', options.signingSecret)
        .update(rawBody)
        .digest('hex');

      if (signature !== `sha256=${expected}`) {
        return c.json({ error: { message: 'Invalid signature' } }, 401);
      }
    }

    if (!body.requestId || !body.decision) {
      return c.json(
        { error: { message: 'Missing required fields: requestId, decision' } },
        400,
      );
    }

    if (!VALID_DECISIONS.has(body.decision)) {
      return c.json(
        {
          error: {
            message: `Invalid decision: must be one of ${RESPONSE_CODES.join(', ')}`,
          },
        },
        400,
      );
    }

    const pending = pendingApprovals.get(body.requestId);
    if (!pending) {
      return c.json({ error: { message: 'Approval request not found' } }, 404);
    }

    pendingApprovals.delete(body.requestId);

    return c.json({
      requestId: body.requestId,
      decision: body.decision,
      status: 'resolved',
    });
  });

  // POST /v1/webhook/slack — Slack interactive message callback
  app.post('/v1/webhook/slack', async (c) => {
    // Read the raw body once: signature verification must run over the exact
    // bytes Slack signed, and the parsed payload is derived from the same text.
    const rawBody = await c.req.text();

    // Authenticate the callback. Fail closed: without a configured Slack signing
    // secret we cannot trust any inbound callback, so reject it.
    if (!options.slackSigningSecret) {
      return c.json(
        { error: { message: 'Slack signing secret required for callbacks' } },
        401,
      );
    }

    const timestamp = c.req.header('x-slack-request-timestamp');
    const signature = c.req.header('x-slack-signature');
    if (!timestamp || !signature) {
      return c.json({ error: { message: 'Missing Slack signature headers' } }, 401);
    }

    // Reject stale timestamps to mitigate replay attacks.
    const tsSeconds = Number(timestamp);
    if (
      !Number.isFinite(tsSeconds) ||
      Math.abs(Date.now() / 1000 - tsSeconds) > SLACK_MAX_TIMESTAMP_SKEW_SECONDS
    ) {
      return c.json({ error: { message: 'Stale or invalid Slack timestamp' } }, 401);
    }

    const baseString = `v0:${timestamp}:${rawBody}`;
    const expected = `v0=${createHmac('sha256', options.slackSigningSecret)
      .update(baseString)
      .digest('hex')}`;
    if (!safeEqual(expected, signature)) {
      return c.json({ error: { message: 'Invalid Slack signature' } }, 401);
    }

    // Parse the payload. Slack delivers interactive callbacks as
    // `application/x-www-form-urlencoded` with a JSON `payload` field; we also
    // accept raw JSON bodies for direct/test integrations.
    let payload: { actions?: Array<{ action_id?: string; value?: string }> };
    try {
      const contentType = c.req.header('content-type') ?? '';
      if (contentType.includes('application/x-www-form-urlencoded')) {
        const payloadStr = new URLSearchParams(rawBody).get('payload');
        payload = payloadStr ? JSON.parse(payloadStr) : {};
      } else {
        payload = rawBody ? JSON.parse(rawBody) : {};
      }
    } catch {
      return c.json({ error: { message: 'Malformed Slack payload' } }, 400);
    }

    const action = payload.actions?.[0];
    if (!action) {
      return c.json({ error: { message: 'No action found in payload' } }, 400);
    }

    const requestId = action.value;
    const decision = normalizeSlackDecision(action.action_id);

    if (!requestId) {
      return c.json({ error: { message: 'Missing request identifier in action' } }, 400);
    }

    // Look up the pending approval; unknown requests are rejected.
    const pending = pendingApprovals.get(requestId);
    if (!pending) {
      return c.json({ error: { message: 'Approval request not found' } }, 404);
    }

    // Resolve and clear the pending approval exactly once.
    pendingApprovals.delete(requestId);
    pending.resolve(decision);

    return c.json({
      requestId,
      decision,
      source: 'slack',
      status: 'resolved',
    });
  });

  return app;
}
