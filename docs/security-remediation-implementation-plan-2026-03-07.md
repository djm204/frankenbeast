# Security Remediation Implementation Plan (High-Level)

Date: 2026-03-07
Source audit: `docs/security-audit-2026-03-06.md`
Objective: Reduce residual risk from HIGH to MEDIUM/LOW by implementing the highest-impact controls first, then hardening and operationalizing security practices.

## Scope

This plan covers remediation for findings #1-#17 in the audit across:
- `franken-governor`
- `frankenfirewall`
- `franken-orchestrator`
- `franken-mcp`
- `franken-observer`
- repo CI/CD and container/dev configs

## Guiding Principles

- Fail secure by default.
- Validate all external inputs at trust boundaries.
- Remove string-based command execution where possible.
- Treat CI and dependency hygiene as production security controls.
- Ship remediation in small, verifiable increments with tests.

## Workstreams

### WS1: Governor Control Plane Security

Targets: Findings #1, #2, #3, #17

Deliverables:
- AuthN/AuthZ middleware for all governor `/v1/*` endpoints.
- Replay-safe signature verification using raw request bytes + `timingSafeEqual`.
- Required signed approvals in production profile.
- Fail-closed startup validation when signature verification is required.
- New unit/integration tests enforcing authenticated-only approval lifecycle.

Acceptance criteria:
- Unauthenticated requests to sensitive endpoints return `401/403`.
- Invalid/replayed signatures are rejected.
- Production config cannot start with signed approvals required but verifier/secret missing.
- Security tests fail if auth middleware is removed.

### WS2: Firewall Boundary Hardening

Targets: Findings #6, #7, #8, #14

Deliverables:
- API authentication for non-health endpoints.
- Strict request schemas with unknown-field rejection.
- Generic client-facing error messages + correlated internal logs.
- Security headers + explicit CORS allowlist middleware.
- Per-identity rate limiting policy and quotas.

Acceptance criteria:
- Anonymous calls to guarded endpoints are rejected.
- Invalid payloads consistently return validation errors without stack/internal details.
- Response headers include baseline security policy.
- Abuse tests demonstrate enforced rate/usage limits.

### WS3: Command Execution Surface Reduction

Targets: Finding #4, #16

Deliverables:
- Replace interpolated `execSync("...")` flows with `spawn/execFile` argument vectors.
- Input allowlists for branch names, remotes, and verification command sources.
- Remove or gate permissive script modes (`--dangerously-skip-permissions`) behind explicit opt-in.

Acceptance criteria:
- No shell-interpolated dynamic command strings remain in targeted paths.
- Negative tests confirm blocked unsafe inputs.
- Helper scripts require explicit acknowledgement for dangerous modes.

### WS4: MCP and Observer Data Exposure Controls

Targets: Findings #10, #11, #15

Deliverables:
- MCP env passthrough allowlist and stderr redaction.
- Observer trace server defaults to localhost bind.
- Optional auth guard for trace viewer in shared environments.
- Schema validation for context deserialization in resume/recovery path.

Acceptance criteria:
- Sensitive env vars are not inherited by default.
- Trace server not reachable from non-local interfaces by default.
- Invalid/tampered context snapshots are rejected deterministically.

### WS5: Supply Chain and CI Security

Targets: Findings #5, #12, #13

Deliverables:
- Patch high CVEs first; moderate CVEs on scheduled SLA.
- Pin GitHub Actions to commit SHAs.
- Add PR security gates: dependency review, secret scan, SAST.
- Harden compose defaults (no anonymous dashboards, no default creds, pinned images/tags).

Acceptance criteria:
- `npm audit` shows zero high vulnerabilities in in-scope modules.
- CI fails on security gate violations.
- Compose/dev defaults no longer ship insecure admin defaults.

## Recommended Sequencing

### Phase 0: Stabilization (1-2 days)

- Freeze risky changes touching auth and execution surfaces.
- Create remediation tracking issues per finding.
- Define environment profiles (`dev`, `staging`, `prod`) for security defaults.

### Phase 1: Critical Controls (Week 1)

- Complete WS1 and firewall auth from WS2.
- Implement fail-closed signed-approval behavior.
- Add regression tests for auth/signature paths.

Exit gate:
- Findings #1-#3 closed and verified.

### Phase 2: High-Risk Surface Reduction (Week 2)

- Complete WS3 and core WS4 items.
- Replace dynamic command strings in orchestrator paths.
- Harden MCP env/log handling.

Exit gate:
- Findings #4, #10, #11, #16 closed.

### Phase 3: Platform Hardening (Week 3)

- Complete remaining WS2 items.
- Complete WS5 CI/container/dependency work.
- Enforce policy checks in CI.

Exit gate:
- Findings #5, #6, #7, #8, #12, #13, #14 closed.

### Phase 4: Verification and Operationalization (Week 4)

- Security regression suite execution and penetration-style smoke tests.
- Update runbooks/config docs.
- Final audit delta report and risk re-rating.

Exit gate:
- Residual risk re-assessed to MEDIUM or lower.

## Ownership Model (Suggested)

- Platform/API owner: WS1, WS2
- Orchestrator owner: WS3
- Infrastructure/DevEx owner: WS5
- Observability owner: WS4
- Security reviewer: cross-workstream sign-off and final verification

## Tracking and Reporting

- Create one epic per workstream.
- Link each task to audit finding ID(s).
- Weekly status: open/closed findings, blocked items, SLA drift.
- Re-run full audit after each phase gate.

## Definition of Done

- All Critical and High findings remediated and tested.
- Medium findings either remediated or formally risk-accepted with expiration date.
- Security CI checks required on PR merges.
- Updated docs for config, auth flows, and secure operational defaults.
