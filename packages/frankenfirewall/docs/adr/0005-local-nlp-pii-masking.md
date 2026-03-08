# ADR-0005 — Local NLP for PII Masking (No External Service Dependency)

**Status**: Accepted

## Context

PII masking must occur *before* the request leaves the infrastructure. Routing data to an external masking service would itself constitute a PII leak during transit and would add latency and an external dependency to the hot path.

## Decision

Use local regex-based pattern matching for PII detection and replacement. The masker covers:

- Email addresses → `[EMAIL]`
- Phone numbers (US/international formats) → `[PHONE]`
- Credit card numbers (major patterns) → `[CC]`
- SSN patterns → `[SSN]`

Patterns are applied to all message content and system prompts, including nested tool result payloads.

When `redact_pii: false` in `guardrails.config.json`, the masker is a no-op. This setting is intended for local development only and must not appear in STRICT tier configurations.

## Consequences

- No external dependency: masking works offline, zero latency overhead beyond regex execution
- Regex-based detection has false negative risk for unusual PII formats; this is v1 scope
- Production STRICT configs must have `redact_pii: true` enforced by config validation
- Future: replace regexes with a local NLP model when accuracy requirements increase (new ADR required)
