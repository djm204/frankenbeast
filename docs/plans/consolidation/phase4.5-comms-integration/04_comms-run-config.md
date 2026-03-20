# Chunk 4.5.04: Comms Config in Run-Config v2

**Phase:** 4.5 — Comms Integration
**Depends on:** Chunk 01 (direct runtime integration)
**Estimated size:** Small

---

## Context

Phase 8 chunk 07 defines the consolidated run-config v2 schema. This chunk is the source for the `comms` section so the unified schema can configure enabled channels, webhook paths, and secret references.

This chunk adds the `comms` section to the run-config v2 schema. Secrets (API tokens, signing secrets) are stored in `.frankenbeast/.env` and referenced by name, never inlined in the YAML.

## What to Do

### 1. Define the comms run-config schema

```typescript
// In franken-types or orchestrator config types

export const CommsChannelConfigSchema = z.object({
  enabled: z.boolean().default(false),
  webhookPath: z.string().optional(),     // Override default path
  secretRef: z.string().optional(),       // Reference to .frankenbeast/.env key
});

export const CommsRunConfigSchema = z.object({
  enabled: z.boolean().default(false),
  host: z.string().default('127.0.0.1'),
  port: z.number().default(3200),
  channels: z.object({
    slack: CommsChannelConfigSchema.extend({
      tokenRef: z.string().default('SLACK_BOT_TOKEN'),
      signingSecretRef: z.string().default('SLACK_SIGNING_SECRET'),
    }).default({}),
    discord: CommsChannelConfigSchema.extend({
      tokenRef: z.string().default('DISCORD_BOT_TOKEN'),
      publicKeyRef: z.string().default('DISCORD_PUBLIC_KEY'),
    }).default({}),
    telegram: CommsChannelConfigSchema.extend({
      botTokenRef: z.string().default('TELEGRAM_BOT_TOKEN'),
    }).default({}),
    whatsapp: CommsChannelConfigSchema.extend({
      accessTokenRef: z.string().default('WHATSAPP_ACCESS_TOKEN'),
      phoneNumberIdRef: z.string().default('WHATSAPP_PHONE_NUMBER_ID'),
      appSecretRef: z.string().default('WHATSAPP_APP_SECRET'),
      verifyTokenRef: z.string().default('WHATSAPP_VERIFY_TOKEN'),
    }).default({}),
  }).default({}),
});
```

### 2. YAML example

```yaml
# frankenbeast.yaml (run config)
comms:
  enabled: true
  host: 127.0.0.1
  port: 3200
  channels:
    slack:
      enabled: true
      # tokenRef: SLACK_BOT_TOKEN          # default — reads from .frankenbeast/.env
      # signingSecretRef: SLACK_SIGNING_SECRET
    discord:
      enabled: false
    telegram:
      enabled: true
      botTokenRef: MY_CUSTOM_TELEGRAM_TOKEN  # override env var name
    whatsapp:
      enabled: false
```

### 3. Secret resolution

At startup, resolve `*Ref` fields to actual values from `.frankenbeast/.env`:

```typescript
function resolveCommsSecrets(config: CommsRunConfig): ResolvedCommsConfig {
  const env = loadDotenv('.frankenbeast/.env');

  return {
    ...config,
    channels: {
      slack: config.channels.slack.enabled ? {
        ...config.channels.slack,
        token: env[config.channels.slack.tokenRef],
        signingSecret: env[config.channels.slack.signingSecretRef],
      } : config.channels.slack,
      // ... same for discord, telegram, whatsapp
    },
  };
}
```

### 4. Integrate into run-config v2 schema

Add `comms` to the top-level run config:

```typescript
export const RunConfigV2Schema = z.object({
  // ... existing sections from Phase 8 chunk 07
  providers: ProviderRunConfigSchema,
  skills: z.array(z.string()),
  security: SecurityRunConfigSchema,
  brain: BrainRunConfigSchema,
  comms: CommsRunConfigSchema.default({}),  // NEW
});
```

### 5. CLI flag mapping

```
frankenbeast run --comms                    # enable comms with defaults
frankenbeast run --comms-port 3201          # override port
frankenbeast run --slack                    # shorthand for comms.channels.slack.enabled=true
frankenbeast run --no-comms                 # disable
```

## Files

- **Create:** `src/comms/config/comms-run-config.ts` (Zod schema + secret resolution)
- **Modify:** Run-config v2 schema (add `comms` section) — coordinate with Phase 8 chunk 07
- **Modify:** `src/comms/config/comms-config.ts` (align with new schema or replace)
- **Modify:** CLI flag parsing (add comms flags)
- **Create:** `tests/unit/comms/comms-run-config.test.ts`

## Tests

### comms-run-config.test.ts
- Default config: comms disabled, all channels disabled
- Enable slack only: validates schema, resolves secrets
- Missing secret ref → error with helpful message ("SLACK_BOT_TOKEN not found in .frankenbeast/.env")
- Override env var name → resolves from custom key
- Full config round-trip: parse YAML → validate → resolve secrets

### Integration with run-config v2
- `comms` section is optional (defaults to disabled)
- Invalid channel config → Zod validation error
- CLI flags map correctly to config values

## Exit Criteria

- `CommsRunConfigSchema` defined and exported
- `comms` section accepted in run-config v2 YAML
- Secrets resolved from `.frankenbeast/.env` by reference
- Missing secrets produce clear error messages
- CLI flags work for comms enable/disable and channel shortcuts
- `npm run build && npm run typecheck && npm test` succeeds
