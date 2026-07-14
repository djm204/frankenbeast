# ADR-005: Signed Approvals with HMAC-SHA256

## Status

Accepted

## Context

Production tasks require cryptographic proof that a specific human approved the action. The system must verify that the approval response was not tampered with.

## Decision

Use HMAC-SHA256 signatures via Node.js `node:crypto`. The `ApprovalResponse` includes an optional `signature` field. A `SignatureVerifier` validates signatures against a shared secret using timing-safe comparison. For non-production environments, signature verification is skipped (configurable via `config.requireSignedApprovals`).

The signature payload is a deterministic, non-JSON approval-response byte string formatted as `requestId:<url-encoded-id>|decision:<url-encoded-decision>|respondedBy:<url-encoded-responder>|feedback:<feedback-state>`. `feedback:<feedback-state>` is `feedback:u` when feedback is omitted and `feedback:s:<url-encoded-feedback>` when feedback is present. Signing `respondedBy` and `feedback` ensures the recorded responder identity and optional rationale cannot be tampered with after the decision is signed.

Approval policy manifests use the same HMAC primitive but a separate canonical payload: stable JSON with sorted object keys, the signature `value` omitted, signature `algorithm`/`keyId` metadata authenticated, and policy array order preserved. Manifest loading is fail-closed by default: unsigned manifests require an explicit `allowUnsignedPolicyManifest` override, and signed manifests require a configured verifier. Supported built-in policy IDs are `skill`, `budget`, `confidence`, and `ambiguity`; `confidence` may carry a threshold config.

## Consequences

- **Positive:** Simple, well-understood crypto primitive; no PKI infrastructure needed.
- **Positive:** `SignatureVerifier` is a pure function — trivially testable.
- **Positive:** Timing-safe comparison prevents timing attacks.
- **Negative:** Shared secrets must be distributed securely.
- **Negative:** Not as strong as asymmetric signatures — acceptable for stated requirements.
