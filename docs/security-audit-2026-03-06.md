# Frankenbeast Security Audit (Comprehensive)

Date: 2026-03-06 (updated 2026-03-07)
Auditor: Codex (security review guided by `.cursor/rules/security*`)
Scope: Monorepo runtime code paths (`franken-*` packages), HTTP boundaries, command execution, signature/auth flows, secret handling, dependency risk

## Executive Summary

A second-pass audit was completed across all production `src/` files in all modules (261 files total). The codebase has good architectural boundaries and several strong controls, but internet-exposed deployments still carry high residual risk.

Top risks:
- Governor approval APIs are unauthenticated and can be remotely manipulated.
- Signed-approval enforcement can be bypassed by wiring/default config paths.
- Multiple shell command execution paths use interpolated command strings.
- Firewall service has no auth and can be abused as a provider relay in exposed environments.
- Multiple modules still have high-severity dependency vulnerabilities.

## Methodology (Mapped to `.cursor/rules/security*`)

Applied controls from:
- `security-fundamentals.mdc`
- `security-expert-input-validation.mdc`
- `security-expert-auth.mdc`
- `security-expert-headers-api.mdc`
- `security-expert-error-handling-logging.mdc`
- `security-expert-dependencies.mdc`
- `security-expert-threat-modeling.mdc`

Execution approach:
- Full production source inventory and audit pass (`franken-*/src`, excluding tests/fixtures)
- Static review of HTTP servers, auth/signature flows, subprocess execution, config loaders, file I/O, logging and redaction, secrets handling
- Pattern-based scans for injection, weak auth, unsafe exec, secret leakage, and error disclosure
- Secret-pattern scan (no obvious committed live credentials found)
- Networked `npm audit` at root and each module with `package-lock.json`

## Coverage Summary

Production files audited: **261**

Per-module coverage:
- `franken-brain`: 31
- `franken-critique`: 25
- `franken-governor`: 33
- `franken-heartbeat`: 21
- `franken-mcp`: 14
- `franken-observer`: 34
- `franken-orchestrator`: 50
- `franken-planner`: 23
- `franken-skills`: 21
- `franken-types`: 9

Full file manifest audited: [`docs/security-audit-coverage-files-2026-03-06.txt`](/home/pfk/dev/frankenbeast/docs/security-audit-coverage-files-2026-03-06.txt)

Expanded-scope (tests/scripts/examples/workflows/config) files audited: **311**

Expanded-scope file manifest: [`docs/security-audit-non-runtime-coverage-files-2026-03-07.txt`](/home/pfk/dev/frankenbeast/docs/security-audit-non-runtime-coverage-files-2026-03-07.txt)

## Findings (Ordered by Severity)

### Critical

1. Unauthenticated approval control plane in governor HTTP app
- Impact: Any network caller can create/resolve approvals and spoof decisions.
- Evidence:
  - [`franken-governor/src/server/app.ts:27`](/home/pfk/dev/frankenbeast/franken-governor/src/server/app.ts:27)
  - [`franken-governor/src/server/app.ts:51`](/home/pfk/dev/frankenbeast/franken-governor/src/server/app.ts:51)
  - No authentication middleware protecting `/v1/approval/*` or `/v1/webhook/slack`.
- Rule mapping: auth + fail-secure + API hardening.
- Recommendation:
  - Require service-to-service auth (mTLS or signed service token) on all governor `/v1/*` routes.
  - Enforce webhook signature verification + replay protection.

### High

2. Signature verification in HTTP server uses raw compare of reconstructed body
- Impact: Non-timing-safe comparison and serialization/canonicalization ambiguity.
- Evidence:
  - [`franken-governor/src/server/app.ts:61`](/home/pfk/dev/frankenbeast/franken-governor/src/server/app.ts:61)
  - [`franken-governor/src/server/app.ts:66`](/home/pfk/dev/frankenbeast/franken-governor/src/server/app.ts:66)
- Rule mapping: cryptography + auth.
- Recommendation:
  - Verify signatures over raw request bytes using `timingSafeEqual`.
  - Include timestamp+nonce in signed payload with expiration checks.

3. Signed-approval bypass in gateway wiring/default construction
- Impact: Signature checks can be silently skipped even for high-stakes flows.
- Evidence:
  - Conditional verification only when verifier exists: [`franken-governor/src/gateway/approval-gateway.ts:42`](/home/pfk/dev/frankenbeast/franken-governor/src/gateway/approval-gateway.ts:42)
  - Default config unsigned: [`franken-governor/src/core/config.ts:12`](/home/pfk/dev/frankenbeast/franken-governor/src/core/config.ts:12)
  - Factory/adapter constructing gateway with `defaultConfig()` (unsigned path):
    - [`franken-governor/src/gateway/governor-factory.ts:17`](/home/pfk/dev/frankenbeast/franken-governor/src/gateway/governor-factory.ts:17)
    - [`franken-governor/src/gateway/governor-critique-adapter.ts:25`](/home/pfk/dev/frankenbeast/franken-governor/src/gateway/governor-critique-adapter.ts:25)
- Rule mapping: fail-secure.
- Recommendation:
  - Fail startup if signed approvals are required but verifier/secret missing.
  - Use explicit environment profile defaults (`prod` signed, `dev` optional).

4. Shell command execution with interpolated command strings
- Impact: Command injection/option smuggling risk from config or dynamic values.
- Evidence:
  - [`franken-orchestrator/src/skills/git-branch-isolator.ts:20`](/home/pfk/dev/frankenbeast/franken-orchestrator/src/skills/git-branch-isolator.ts:20)
  - [`franken-orchestrator/src/closure/pr-creator.ts:94`](/home/pfk/dev/frankenbeast/franken-orchestrator/src/closure/pr-creator.ts:94)
  - [`franken-orchestrator/src/skills/cli-skill-executor.ts:111`](/home/pfk/dev/frankenbeast/franken-orchestrator/src/skills/cli-skill-executor.ts:111)
- Rule mapping: injection prevention.
- Recommendation:
  - Replace with `execFile`/`spawn` argument vectors.
  - Strict allowlists for branch names, remotes, and verifier commands.

5. Dependency vulnerabilities (including high severity) across modules
- Impact: Known exploitable packages present.
- Evidence (`npm audit`, per-module):
  - `franken-brain`: high(1)
  - `franken-critique`: high(2), moderate(1)
  - `franken-governor`: high(2)
  - `franken-heartbeat`: high(1)
  - `franken-observer`: high(1)
  - `franken-skills`: high(2), moderate(1)
  - `franken-planner`: moderate(6)
- Notable vulnerable packages: `rollup`, `minimatch`, `ajv`, `vite/vitest/esbuild` chain.
- Rule mapping: dependency security.
- Recommendation:
  - Patch all high CVEs first, then moderate within defined SLA.

6. Firewall API has no authentication and can act as exposed provider relay
- Impact: If internet-exposed, attackers can consume provider budget and abuse model access.
- Evidence:
  - Route handlers without auth middleware: [`frankenfirewall/src/server/app.ts:37`](/home/pfk/dev/frankenbeast/frankenfirewall/src/server/app.ts:37)
  - Provider selectable from request body: [`frankenfirewall/src/server/app.ts:39`](/home/pfk/dev/frankenbeast/frankenfirewall/src/server/app.ts:39)
- Rule mapping: auth + API hardening.
- Recommendation:
  - Require API auth for all non-health endpoints.
  - Add per-principal rate limits and quotas.

### Medium

7. Firewall error middleware leaks raw exception messages to clients
- Impact: Internal details may be exposed.
- Evidence:
  - [`frankenfirewall/src/server/middleware.ts:18`](/home/pfk/dev/frankenbeast/frankenfirewall/src/server/middleware.ts:18)
- Recommendation:
  - Return generic errors; keep details in server logs with request correlation IDs.

8. Firewall request bodies not schema-validated at HTTP boundary
- Impact: Type confusion and malformed payload handling gaps.
- Evidence:
  - [`frankenfirewall/src/server/app.ts:38`](/home/pfk/dev/frankenbeast/frankenfirewall/src/server/app.ts:38)
  - [`frankenfirewall/src/server/app.ts:90`](/home/pfk/dev/frankenbeast/frankenfirewall/src/server/app.ts:90)
- Recommendation:
  - Strict Zod schemas with unknown-field rejection and payload bounds.

9. Critique auth and rate limiting are bypass-prone
- Impact:
  - Plain string token comparison.
  - Trusts user-controlled `x-forwarded-for`.
  - In-memory map can grow without bounds.
- Evidence:
  - [`franken-critique/src/server/app.ts:25`](/home/pfk/dev/frankenbeast/franken-critique/src/server/app.ts:25)
  - [`franken-critique/src/server/app.ts:36`](/home/pfk/dev/frankenbeast/franken-critique/src/server/app.ts:36)
  - [`franken-critique/src/server/app.ts:19`](/home/pfk/dev/frankenbeast/franken-critique/src/server/app.ts:19)
- Recommendation:
  - Constant-time auth compare and trusted proxy configuration.
  - Distributed bounded rate limiter.

10. MCP transport logs raw stderr and passes full process env into child process
- Impact: Secret leakage to logs and unnecessary secret exposure to child servers.
- Evidence:
  - [`franken-mcp/src/transport/stdio-transport.ts:35`](/home/pfk/dev/frankenbeast/franken-mcp/src/transport/stdio-transport.ts:35)
  - [`franken-mcp/src/transport/stdio-transport.ts:25`](/home/pfk/dev/frankenbeast/franken-mcp/src/transport/stdio-transport.ts:25)
- Recommendation:
  - Redact stderr logging and allowlist env keys passed downstream.

11. Trace viewer server lacks auth and binds without explicit localhost restriction
- Impact: Trace data may be exposed if host networking is reachable.
- Evidence:
  - Starts server with no host binding/auth: [`franken-observer/src/ui/TraceServer.ts:42`](/home/pfk/dev/frankenbeast/franken-observer/src/ui/TraceServer.ts:42)
  - Listen call without host parameter: [`franken-observer/src/ui/TraceServer.ts:46`](/home/pfk/dev/frankenbeast/franken-observer/src/ui/TraceServer.ts:46)
- Recommendation:
  - Bind to `127.0.0.1` by default and add optional auth for shared environments.

12. CI supply-chain hardening gap: unpinned third-party action and no security scan jobs
- Impact: Increased risk from compromised action tags and missing automated SAST/secret/dependency checks on PRs.
- Evidence:
  - Unpinned action tag: [`.github/workflows/release-please.yml:16`](/home/pfk/dev/frankenbeast/.github/workflows/release-please.yml:16)
  - Workflow only handles release automation; no CodeQL/SAST/secret/dependency review jobs in repository workflows.
- Recommendation:
  - Pin actions by full commit SHA.
  - Add PR security gates (dependency review, secret scanning, SAST).

13. Insecure container/dev defaults in compose configs
- Impact: If reused beyond local dev, defaults enable easy unauthorized dashboard access and mutable image drift.
- Evidence:
  - Latest tags: [`docker-compose.yml:6`](/home/pfk/dev/frankenbeast/docker-compose.yml:6), [`docker-compose.yml:21`](/home/pfk/dev/frankenbeast/docker-compose.yml:21), [`docker-compose.yml:35`](/home/pfk/dev/frankenbeast/docker-compose.yml:35)
  - Default admin creds + anonymous Grafana enabled: [`docker-compose.yml:27`](/home/pfk/dev/frankenbeast/docker-compose.yml:27), [`docker-compose.yml:28`](/home/pfk/dev/frankenbeast/docker-compose.yml:28), [`docker-compose.yml:29`](/home/pfk/dev/frankenbeast/docker-compose.yml:29)
- Recommendation:
  - Pin image digests/versions.
  - Disable anonymous access by default and require non-default credentials.

### Low

14. Missing standard security headers / explicit CORS policy across HTTP services
- Impact: Reduced browser-facing hardening posture.
- Evidence:
  - No CSP/HSTS/XFO/Referrer/Permissions middleware in firewall/critique/governor apps.
- Recommendation:
  - Add centralized security header middleware and explicit CORS allowlists.

15. Context deserialization has no schema validation (resume path integrity risk)
- Impact: Corrupted/tampered snapshot can cause unsafe runtime assumptions.
- Evidence:
  - [`franken-orchestrator/src/resilience/context-serializer.ts:63`](/home/pfk/dev/frankenbeast/franken-orchestrator/src/resilience/context-serializer.ts:63)
- Recommendation:
  - Add strict schema validation for snapshot load path.

16. Risky helper script pattern: AI CLI invoked with permissive mode in repository root script
- Impact: Increases chance of accidental unsafe local operations when script is run as-is.
- Evidence:
  - `--dangerously-skip-permissions` used in root build script: [`run-build.sh:43`](/home/pfk/dev/frankenbeast/run-build.sh:43)
- Recommendation:
  - Move this to clearly marked opt-in script or require explicit confirmation/env gate.

17. Security testing gap in server-level auth expectations
- Impact: Tests currently validate unauthenticated success paths for sensitive approval endpoints, reducing chance of catching auth regressions.
- Evidence:
  - Governor server tests create and resolve approvals without any auth requirement: [`franken-governor/tests/unit/server/app.test.ts:17`](/home/pfk/dev/frankenbeast/franken-governor/tests/unit/server/app.test.ts:17), [`franken-governor/tests/unit/server/app.test.ts:47`](/home/pfk/dev/frankenbeast/franken-governor/tests/unit/server/app.test.ts:47)
- Recommendation:
  - Add tests that require and enforce endpoint authentication/authorization for approval routes.

## Positive Controls Observed

- Extensive use of typed module boundaries and interfaces.
- Good use of schema validation in several boundary modules:
  - Critique request schema at [`franken-critique/src/server/app.ts:5`](/home/pfk/dev/frankenbeast/franken-critique/src/server/app.ts:5)
  - MCP config schema at [`franken-mcp/src/config/config-schema.ts:13`](/home/pfk/dev/frankenbeast/franken-mcp/src/config/config-schema.ts:13)
- Timing-safe signature utility exists:
  - [`franken-governor/src/security/signature-verifier.ts:14`](/home/pfk/dev/frankenbeast/franken-governor/src/security/signature-verifier.ts:14)
- SQL usage in observer/brain uses parameterized prepared statements in reviewed paths.

## Dependency Audit Results

Networked `npm audit` run date: 2026-03-06

Summary:
- Root: 0 vulnerabilities
- Affected modules:
  - `franken-brain` high:1
  - `franken-critique` high:2 moderate:1
  - `franken-governor` high:2
  - `franken-heartbeat` high:1
  - `franken-observer` high:1
  - `franken-planner` moderate:6
  - `franken-skills` high:2 moderate:1
- Fix availability: all detected issues reported as fixable by `npm audit`.

## Prioritized Remediation Plan

1. Secure governor endpoints and webhook handling (authn/authz + replay-safe signature checks).
2. Enforce fail-closed signed approvals in all runtime wiring paths.
3. Replace shell-string command execution with argument-vector APIs.
4. Add auth + quota/rate controls to firewall API.
5. Patch high dependency CVEs.
6. Harden error handling, boundary schemas, and MCP log/env handling.
7. Lock trace viewer to localhost by default.
8. Add CI security gates and pin all GitHub Actions by SHA.
9. Harden compose defaults (no anonymous dashboards, no default creds, pinned images).

## Residual Risk Statement

Residual risk is **high** for internet-exposed deployments until findings #1 through #7 are remediated.
