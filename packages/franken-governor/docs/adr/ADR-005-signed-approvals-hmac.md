# ADR-005: Signed Approvals with HMAC-SHA256

## Status

Accepted

## Context

Production tasks require cryptographic proof that a specific human approved the action. The system must verify that the approval response was not tampered with.

## Decision

Use HMAC-SHA256 signatures via Node.js `node:crypto`. The `ApprovalResponse` includes an optional `signature` field. A `SignatureVerifier` validates signatures against a shared secret using timing-safe comparison. For non-production environments, signature verification is skipped (configurable via `config.requireSignedApprovals`).

The signature payload is `JSON.stringify({ requestId, decision })` — the minimum data needed to prove the decision is authentic.

## Consequences

- **Positive:** Simple, well-understood crypto primitive; no PKI infrastructure needed.
- **Positive:** `SignatureVerifier` is a pure function — trivially testable.
- **Positive:** Timing-safe comparison prevents timing attacks.
- **Negative:** Shared secrets must be distributed securely.
- **Negative:** Not as strong as asymmetric signatures — acceptable for stated requirements.
