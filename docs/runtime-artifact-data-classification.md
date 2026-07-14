# Runtime Artifact Data Classification

Frankenbeast runtime artifacts must carry a sensitivity label before they are stored, exported, or delivered outside the local process. The observer package exposes the canonical labels and default artifact mapping via `RUNTIME_ARTIFACT_CLASSIFICATIONS`, `classifyRuntimeArtifact()`, and `ClassificationGuardAdapter`.

## Classification labels

- `public`: safe to publish; contains no tenant, operator, user, or runtime-private context.
- `internal`: implementation or operational metadata that should stay inside the project/operator boundary.
- `sensitive`: may include trace metadata, errors, destinations, cost/spend, or incident details. Redact before broad sharing.
- `secret`: credentials, backups, bundled state, tokens, or material that could grant access if disclosed.
- `user-private`: prompts, memory, user-provided content, and tenant-specific private context.

## Default runtime artifact mapping

| Artifact type | Default class | Why |
|---|---:|---|
| Logs | `sensitive` | Logs can include prompts, tool arguments, URLs, stack traces, and identifiers. |
| Memory | `user-private` | Durable memory can contain personal preferences, tenant-scoped environment facts, or private context. |
| Backups | `secret` | Backups can bundle config, credentials, approvals, memory, cron jobs, and historical runtime artifacts. |
| Exports | `sensitive` | Generic exports are cross-boundary copies and may include traces, prompts, metadata, or audit details. |
| Prompts | `user-private` | Prompts often contain user requests, retrieved context, and private operator intent. |
| Webhooks | `sensitive` | Webhook payloads leave the process boundary and may include incidents, spend, traces, or approval context. |
| Traces | `sensitive` | Observer traces include goals, span metadata, errors, and thought-block placeholders. |
| Audit trails | `sensitive` | Audit trails record decisions and runtime references needed for accountability. |
| Post-mortems | `sensitive` | Post-mortems include failures, diagnostics, and operator decisions. |

## Choosing a class for a new artifact type

1. Start from the highest class of any field that may be present in the artifact.
2. Use `secret` for credentials, access tokens, raw backups, or bundled state that may contain secrets.
3. Use `user-private` for prompts, memories, tenant/user content, or anything the user did not explicitly intend to publish.
4. Use `sensitive` for operational/runtime data that is not itself secret but can expose behavior, topology, or incident details.
5. Downgrade only after the producer proves redaction strips the higher-class fields.
6. For external export, call `enforceRuntimeArtifactExportPolicy()` or wrap the adapter with `ClassificationGuardAdapter` so `secret` and `user-private` artifacts cannot leave without redaction or an explicit operator override.

## Export policy

`secret` and `user-private` artifacts are blocked from export by default. Export is allowed only when the caller sets `redactionApplied: true` after masking/removing high-sensitivity fields, or `allowSensitiveExportOverride: true` for an explicit audited operator override.

Example:

```ts
import { ClassificationGuardAdapter, SpanRedactor } from '@franken/observer'

const redacted = new SpanRedactor({
  adapter: thirdPartyAdapter,
  rules: [{ key: /token|secret|password/i, action: 'mask' }],
  redactThoughtBlocks: true,
})

const guarded = new ClassificationGuardAdapter({
  adapter: redacted,
  artifactType: 'prompt',
  redactionApplied: true,
  destination: 'third-party collector',
})
```

Prefer redaction over overrides. When an override is unavoidable, record the destination, reason, operator, and retention expectation in the audit trail.
