import { Hono } from 'hono';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { RESPONSE_CODES, type ResponseCode } from '../core/types.js';
import { ApprovalWaiterRegistry } from '../gateway/approval-waiter-registry.js';
import {
  formatApprovalResponseSignaturePayload,
  SignatureVerifier,
} from '../security/signature-verifier.js';
import { SessionTokenStore } from '../security/session-token-store.js';

const VALID_DECISIONS = new Set<string>(RESPONSE_CODES);

export interface GovernorAppOptions {
  signingSecret?: string;
  /** Slack signing secret used to verify `X-Slack-Signature` on inbound callbacks. */
  slackSigningSecret?: string;
  slackWebhookUrl?: string;
  allowUnsignedApprovalsForTests?: boolean;
  /**
   * Shared registry of pending approval waiters. Pass the same instance to
   * an `HttpApprovalChannel` (used by `ApprovalGateway`) so that a caller
   * awaiting an approval is actually woken when this app resolves it via
   * `POST /v1/approval/respond` or the Slack webhook. If omitted, a private
   * registry is created and only HTTP-visible bookkeeping (e.g.
   * `GET /health`) is available — no in-process caller can be waiting on it.
   */
  registry?: ApprovalWaiterRegistry;
  /** Shared session token store used by the validation endpoint. */
  sessionTokenStore?: SessionTokenStore;
  /** JSON file used to share session tokens across governor processes. */
  sessionTokenStorePath?: string;
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

const GOVERNOR_SIGNATURE_PREFIX = 'sha256=';
const SHA256_HEX_LENGTH = 64;

type GovernorSignatureVerificationResult =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'malformed' | 'invalid' };

type ParsedJsonBody = Record<string, unknown>;

function normalizeGovernorSignature(signature: string): Buffer | null {
  const trimmed = signature.trim();
  if (!trimmed.toLowerCase().startsWith(GOVERNOR_SIGNATURE_PREFIX)) {
    return null;
  }

  const hex = trimmed.slice(GOVERNOR_SIGNATURE_PREFIX.length);
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length !== SHA256_HEX_LENGTH) {
    return null;
  }

  return Buffer.from(hex.toLowerCase(), 'hex');
}

function verifyGovernorSignature(
  signature: string | undefined,
  rawBody: Buffer,
  signingSecret: string,
): GovernorSignatureVerificationResult {
  if (!signature) {
    return { ok: false, reason: 'missing' };
  }

  const provided = normalizeGovernorSignature(signature);
  if (!provided) {
    return { ok: false, reason: 'malformed' };
  }

  const expected = createHmac('sha256', signingSecret).update(rawBody).digest();
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, reason: 'invalid' };
  }

  return { ok: true };
}

function parseJsonBody(rawBody: Buffer): ParsedJsonBody | null {
  if (rawBody.length === 0) return {};

  try {
    const parsed: unknown = JSON.parse(rawBody.toString('utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as ParsedJsonBody)
      : {};
  } catch {
    return null;
  }
}

/**
 * Produce a signature for a resolved `ApprovalResponse` matching the format
 * `ApprovalGateway.verifySignature` expects (HMAC-SHA256 hex digest of
 * `requestId:<id>|decision:<decision>`, via `SignatureVerifier`).
 *
 * Without this, a caller awaiting the approval through `ApprovalGateway`
 * with `config.requireSignedApprovals: true` would always unblock only to
 * immediately fail with `SignatureVerificationError`, because the response
 * handed to the registry never carried a `signature` (see issue #411 review
 * follow-up). The HTTP handlers below have already authenticated the
 * caller (via `x-governor-signature` or the Slack signature scheme) before
 * calling this, so re-signing the canonical `{requestId, decision}` payload
 * with the same governor `signingSecret` is safe and lets the two
 * signature schemes compose.
 */
function signApprovalResponse(
  requestId: string,
  decision: ResponseCode,
  signingSecret: string,
): string {
  return new SignatureVerifier(signingSecret).sign(
    formatApprovalResponseSignaturePayload({ requestId, decision }),
  );
}

/**
 * Map a raw Slack action_id into a domain decision (ResponseCode).
 * Returns `null` for unrecognized actions so the caller can reject the
 * callback instead of consuming the pending approval with a bogus decision.
 */
function normalizeSlackDecision(actionId: unknown): ResponseCode | null {
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
      return null;
  }
}

export function createGovernorApp(options: GovernorAppOptions = {}): Hono {
  const app = new Hono();
  const registry = options.registry ?? new ApprovalWaiterRegistry();
  const sessionTokenStore = options.sessionTokenStore
    ?? (options.sessionTokenStorePath
      ? new SessionTokenStore({ persistenceFile: options.sessionTokenStorePath })
      : undefined);

  // Health check
  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
      service: 'franken-governor',
      pendingApprovals: registry.size,
    });
  });

  // POST /v1/approval/request — submit an approval request
  app.post('/v1/approval/request', async (c) => {
    const rawBody = Buffer.from(await c.req.arrayBuffer());

    // Approval requests create actionable human-approval state, so authenticate
    // them the same way approval responses are authenticated. Tests may opt in
    // to unsigned requests explicitly, but production fails closed.
    if (!options.signingSecret) {
      if (!options.allowUnsignedApprovalsForTests) {
        return c.json({ error: { message: 'Signing secret required for approval requests' } }, 401);
      }
    } else {
      const verification = verifyGovernorSignature(
        c.req.header('x-governor-signature'),
        rawBody,
        options.signingSecret,
      );
      if (!verification.ok && verification.reason === 'missing') {
        return c.json({ error: { message: 'Missing signature' } }, 401);
      }
      if (!verification.ok && verification.reason === 'malformed') {
        return c.json({ error: { message: 'Malformed signature' } }, 401);
      }
      if (!verification.ok) {
        return c.json({ error: { message: 'Invalid signature' } }, 401);
      }
    }

    const body = parseJsonBody(rawBody);
    if (!body) {
      return c.json({ error: { message: 'Malformed JSON body' } }, 400);
    }

    if (
      typeof body.requestId !== 'string' || body.requestId.length === 0
      || typeof body.taskId !== 'string' || body.taskId.length === 0
      || typeof body.summary !== 'string' || body.summary.length === 0
    ) {
      return c.json(
        { error: { message: 'Missing required fields: requestId, taskId, summary' } },
        400,
      );
    }

    registry.register(body.requestId, body.taskId, body.summary);

    return c.json({
      requestId: body.requestId,
      status: 'pending',
      message: 'Approval request created',
    }, 201);
  });

  // POST /v1/approval/respond — respond to an approval request
  app.post('/v1/approval/respond', async (c) => {
    const rawBody = Buffer.from(await c.req.arrayBuffer());
    const body = parseJsonBody(rawBody);
    if (!body) {
      return c.json({ error: { message: 'Malformed JSON body' } }, 400);
    }

    // Fail closed: unsigned approval responses are rejected unless a signing
    // secret is configured (then verified) or an explicit test flag is set.
    if (!options.signingSecret) {
      if (!options.allowUnsignedApprovalsForTests) {
        return c.json({ error: { message: 'Signing secret required for approval responses' } }, 401);
      }
    } else {
      const verification = verifyGovernorSignature(
        c.req.header('x-governor-signature'),
        rawBody,
        options.signingSecret,
      );
      if (!verification.ok && verification.reason === 'missing') {
        return c.json({ error: { message: 'Missing signature' } }, 401);
      }
      if (!verification.ok && verification.reason === 'malformed') {
        return c.json({ error: { message: 'Malformed signature' } }, 401);
      }
      if (!verification.ok) {
        return c.json({ error: { message: 'Invalid signature' } }, 401);
      }
    }

    if (typeof body.requestId !== 'string' || typeof body.decision !== 'string') {
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

    if (!registry.has(body.requestId)) {
      return c.json({ error: { message: 'Approval request not found' } }, 404);
    }

    const respondedBy = typeof body.respondedBy === 'string' ? body.respondedBy : 'http-operator';
    const feedback = typeof body.feedback === 'string' ? body.feedback : undefined;
    const decision = body.decision as ResponseCode;
    // Only produced once this request has already been authenticated above
    // (a valid x-governor-signature, or explicitly allowed unsigned for
    // tests); see `signApprovalResponse` for why this is safe to attach.
    const signature = options.signingSecret
      ? signApprovalResponse(body.requestId, decision, options.signingSecret)
      : undefined;

    // Wake the real waiter (if any) registered via `HttpApprovalChannel`, so
    // a caller blocked on `ApprovalGateway.requestApproval()` actually
    // unblocks with this decision instead of the request silently resolving
    // only from the HTTP caller's point of view.
    registry.resolve(body.requestId, {
      requestId: body.requestId,
      decision,
      respondedBy,
      respondedAt: new Date(),
      ...(feedback !== undefined ? { feedback } : {}),
      ...(signature !== undefined ? { signature } : {}),
    });

    return c.json({
      requestId: body.requestId,
      decision: body.decision,
      status: 'resolved',
    });
  });

  // POST /v1/approval/session/validate — validate a session token for
  // external callers. The endpoint fails closed when no shared token store is
  // configured, so deployments cannot accidentally treat an unavailable
  // validation path as success.
  app.post('/v1/approval/session/validate', async (c) => {
    const rawBody = Buffer.from(await c.req.arrayBuffer());
    const body = parseJsonBody(rawBody);
    if (!body) {
      return c.json({ error: { message: 'Malformed JSON body' } }, 400);
    }

    if (!options.signingSecret) {
      if (!options.allowUnsignedApprovalsForTests) {
        return c.json({ error: { message: 'Signing secret required for session token validation' } }, 401);
      }
    } else {
      const verification = verifyGovernorSignature(
        c.req.header('x-governor-signature'),
        rawBody,
        options.signingSecret,
      );
      if (!verification.ok && verification.reason === 'missing') {
        return c.json({ error: { message: 'Missing signature' } }, 401);
      }
      if (!verification.ok && verification.reason === 'malformed') {
        return c.json({ error: { message: 'Malformed signature' } }, 401);
      }
      if (!verification.ok) {
        return c.json({ error: { message: 'Invalid signature' } }, 401);
      }
    }

    if (!sessionTokenStore) {
      return c.json({ error: { message: 'Session token validation unavailable' } }, 503);
    }

    if (typeof body.tokenId !== 'string' || body.tokenId.length === 0) {
      return c.json({ error: { message: 'Missing required field: tokenId' } }, 400);
    }
    if (body.scope !== undefined && typeof body.scope !== 'string') {
      return c.json({ error: { message: 'Invalid field: scope must be a string' } }, 400);
    }

    const token = sessionTokenStore.get(body.tokenId);
    if (!token || (body.scope !== undefined && token.scope !== body.scope)) {
      return c.json({ valid: false }, 401);
    }

    return c.json({
      valid: true,
      token: {
        approvalId: token.approvalId,
        scope: token.scope,
        grantedBy: token.grantedBy,
        grantedAt: token.grantedAt.toISOString(),
        expiresAt: token.expiresAt.toISOString(),
      },
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
    let payload: {
      actions?: Array<{ action_id?: string; value?: string }>;
      user?: { id?: string; username?: string };
    };
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

    if (!requestId) {
      return c.json({ error: { message: 'Missing request identifier in action' } }, 400);
    }

    // Reject unknown action IDs before touching the pending approval so a typo
    // or renamed button cannot consume the request with a bogus decision.
    const decision = normalizeSlackDecision(action.action_id);
    if (decision === null) {
      return c.json({ error: { message: 'Unknown Slack action' } }, 400);
    }

    // Look up the pending approval; unknown requests are rejected.
    if (!registry.has(requestId)) {
      return c.json({ error: { message: 'Approval request not found' } }, 404);
    }

    // Resolve and clear the pending approval exactly once, waking any real
    // waiter registered via `HttpApprovalChannel`. The Slack signature
    // above already authenticated this callback; if a governor
    // `signingSecret` is also configured, re-sign the canonical decision so
    // `ApprovalGateway.requireSignedApprovals` accepts it too (see
    // `signApprovalResponse`).
    const slackSignature = options.signingSecret
      ? signApprovalResponse(requestId, decision, options.signingSecret)
      : undefined;

    registry.resolve(requestId, {
      requestId,
      decision,
      respondedBy: payload.user?.id ?? payload.user?.username ?? 'slack',
      respondedAt: new Date(),
      ...(slackSignature !== undefined ? { signature: slackSignature } : {}),
    });

    return c.json({
      requestId,
      decision,
      source: 'slack',
      status: 'resolved',
    });
  });

  return app;
}
