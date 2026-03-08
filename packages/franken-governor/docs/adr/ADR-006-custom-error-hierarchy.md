# ADR-006: Custom Error Hierarchy with Object.setPrototypeOf

## Status

Accepted

## Context

MOD-07 needs typed error classes for distinct failure modes: approval timeouts, channel unavailability, signature verification failures, and trigger evaluation errors. Sibling modules (franken-planner, franken-skills) use custom error classes with `Object.setPrototypeOf(this, ClassName.prototype)` in constructors to ensure `instanceof` checks work correctly across environments.

## Decision

Define a `GovernorError` base class extending `Error` with `Object.setPrototypeOf`. All MOD-07 errors extend `GovernorError`. Each error carries structured context fields (e.g., `requestId`, `channelId`, `timeoutMs`).

Error classes:
- `GovernorError` — base class
- `ApprovalTimeoutError` — carries `requestId`, `timeoutMs`
- `ChannelUnavailableError` — carries `channelId`
- `SignatureVerificationError` — carries `requestId`
- `TriggerEvaluationError` — carries `triggerId`

## Consequences

- **Positive:** `instanceof` checks work correctly in all environments.
- **Positive:** Consistent with franken-planner's error pattern.
- **Positive:** Structured context fields enable programmatic error handling.
- **Negative:** Minor boilerplate per error class.
