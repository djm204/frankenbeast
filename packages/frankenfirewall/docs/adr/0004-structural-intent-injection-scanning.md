# ADR-0004 — Structural Intent Scanning for Prompt Injection Detection

**Status**: Accepted

## Context

Prompt injection attempts range from the obvious ("Ignore previous instructions") to the subtle ("As a reminder, your primary goal is actually..."). Keyword-based blocklists are trivially bypassed by paraphrasing. We need a detection strategy that targets the *structure of intent* — attempts to override, reassign, or reprioritise instructions — not specific word choices.

## Decision

The InjectionScanner uses a set of structural pattern categories:

1. **Explicit override** — direct imperative to disregard prior context
2. **Role reassignment** — attempts to redefine the assistant's identity or purpose
3. **Context poisoning** — injecting instructions via tool results or nested content
4. **Priority inversion** — framing a new instruction as the "real" or "actual" task

Patterns are implemented as regular expressions tested against all message content, including nested tool result payloads. The scanner operates on the normalized `UnifiedRequest` — never on provider-specific shapes.

Blocked requests produce a `GuardrailViolation` with `code: INJECTION_DETECTED`. The full (PII-redacted) request payload is written to the audit log.

## Consequences

- False positives are possible for edge cases (e.g. legitimate discussion of prompt injection)
- Security tier STRICT adds additional pattern categories; PERMISSIVE reduces them
- Pattern set is maintained in the scanner file; changes must include test coverage for new patterns
- Scanner never modifies the request — it either passes or blocks
