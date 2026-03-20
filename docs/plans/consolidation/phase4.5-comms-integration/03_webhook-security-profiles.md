# Chunk 4.5.03: Security Profile Integration for Webhook Verification

**Phase:** 4.5 — Comms Integration
**Depends on:** Chunk 01 (direct runtime integration), Phase 4 (security profiles + middleware)
**Estimated size:** Small

---

## Context

Each channel router has its own signature verification middleware (Slack HMAC-SHA256, Discord Ed25519, WhatsApp HMAC-SHA256). These currently run unconditionally — every webhook request must pass signature verification.

After Phase 4 introduces configurable security profiles (`strict`, `standard`, `permissive`), webhook verification should respect these profiles. In `permissive` mode (solo dev, trusted environment), teams may want to skip verification for faster local development or testing.

## What to Do

### 1. Read security profile at gateway construction time

When the ChatGateway and channel routers are constructed, resolve the active security profile and pass it as configuration:

```typescript
// In comms-gateway-service.ts or wherever routers are constructed

const securityConfig = resolveSecurityConfig(config.security);
const verifyWebhooks = securityConfig.profile !== 'permissive';

const slack = slackRouter({
  gateway,
  config: config.comms.slack,
  verifySignature: verifyWebhooks,  // NEW
});
```

### 2. Make signature middleware conditional per router

Each router already applies signature middleware. Wrap it in a conditional:

**Slack:**
```typescript
// In slack-router.ts
export function slackRouter(opts: SlackRouterOptions): Hono {
  const app = new Hono();

  if (opts.verifySignature !== false) {
    app.use('/events', slackSignatureMiddleware({ signingSecret: opts.config.signingSecret }));
    app.use('/interactive', slackSignatureMiddleware({ signingSecret: opts.config.signingSecret }));
  }

  // ... route handlers unchanged
}
```

**Discord:**
```typescript
// In discord-router.ts — same pattern
if (opts.verifySignature !== false) {
  app.use('/interactions', discordSignatureMiddleware({ publicKey: opts.config.publicKey }));
}
```

**WhatsApp:**
```typescript
// In whatsapp-router.ts — same pattern
if (opts.verifySignature !== false) {
  app.use('/webhook', whatsappSignatureMiddleware({ appSecret: opts.config.appSecret }));
}
```

**Telegram:** No change — Telegram uses bot token in URL path, not signature middleware.

### 3. Per-channel rate limiting from security profile

Phase 4 security profiles include rate limiting settings. Apply these to webhook endpoints:

```typescript
// Rate limit settings from security profile
const rateLimit = securityConfig.rateLimit ?? { windowMs: 60_000, max: 100 };

// Applied per-channel if profile is not 'permissive'
if (securityConfig.profile !== 'permissive') {
  app.use('/*', rateLimitMiddleware(rateLimit));
}
```

Use the same rate limiting middleware from Phase 4 if available, or a simple in-memory counter if not.

### 4. Log when verification is skipped

When running in `permissive` mode, log a warning at startup so operators know verification is off:

```typescript
if (!verifyWebhooks) {
  logger.warn('Webhook signature verification disabled (security profile: permissive)');
}
```

## Files

- **Modify:** `src/comms/channels/slack/slack-router.ts` (conditional signature middleware)
- **Modify:** `src/comms/channels/discord/discord-router.ts` (conditional signature middleware)
- **Modify:** `src/comms/channels/whatsapp/whatsapp-router.ts` (conditional signature middleware)
- **Modify:** `src/network/services/comms-gateway-service.ts` (pass security profile to routers)
- **Modify:** Router option types (add `verifySignature` field)

## Tests

### Per-router tests (3 files — Slack, Discord, WhatsApp)
- `verifySignature: true` (default) → invalid signature returns 401
- `verifySignature: true` → valid signature succeeds
- `verifySignature: false` → invalid signature still succeeds (verification skipped)
- `verifySignature: false` → valid request succeeds

### Security profile mapping test
- `strict` profile → `verifySignature: true`
- `standard` profile → `verifySignature: true`
- `permissive` profile → `verifySignature: false`

## Exit Criteria

- `strict` and `standard` profiles enforce webhook signature verification (existing behavior)
- `permissive` profile skips signature verification
- Warning logged when verification is disabled
- All existing signature verification tests still pass
- `npm run build && npm run typecheck && npm test` succeeds
