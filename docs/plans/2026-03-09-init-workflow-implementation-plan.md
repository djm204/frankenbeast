# Frankenbeast Init Workflow — Implementation Plan

**Date:** 2026-03-09
**Status:** Proposed
**Scope:** Cross-module
**Depends On:**
- [2026-03-08 Dashboard Implementation Plan](./2026-03-08-dashboard-implementation-plan.md) — partially superseded in practice by shipped `franken-web` dashboard work
- [2026-03-09 Dashboard Agent Configuration — Implementation Plan](./2026-03-09-dashboard-agent-configuration-implementation-plan.md) — still planned
- [2026-03-08 Chatbot Implementation Plan — Frankenbeast](./2026-03-08-chatbot-implementation-plan.md) — materially landed for CLI chat plus dashboard WebSocket chat
- [2026-03-09 Franken Web Dashboard Chat — Implementation Plan](./2026-03-09-franken-web-dashboard-chat-implementation-plan.md) — shipped on `main`
- [2026-03-08 External Communication Channels — Implementation Plan](./2026-03-08-channel-integrations-implementation-plan.md) — actively in flight on `feature/channel-integrations`
- [2026-03-08 Secure File Store Integrations — Implementation Plan](./2026-03-08-file-store-integrations-implementation-plan.md) — still planned
- [2026-03-08 Productivity Integrations — Implementation Plan](./2026-03-08-productivity-integrations-implementation-plan.md) — still planned
- [2026-03-09 LLM Error Awareness Memory Injection Plan](./2026-03-09-llm-error-awareness-memory-injection-plan.md) — still planned

## Goal

Add a first-class init workflow that bootstraps Frankenbeast from the platform as it exists now, while leaving clear extension points for the connector and configuration work that is still in flight.

The init flow should establish everything required for Frankenbeast to run safely and predictably:

- core durable configuration
- provider and agent authentication state
- dashboard-managed agent profiles
- plugin installation passthrough where supported
- service enablement and startup prerequisites
- storage, migrations, and local state initialization
- external connector setup for enabled features
- readiness verification

The result should be one canonical bootstrap path, not a collection of disconnected setup steps across docs, ad hoc scripts, CLI flags, and dashboard-only setup affordances.

Security is a first-class citizen throughout this workflow, especially anywhere init touches credentials, auth state, provider tokens, webhook secrets, encryption keys, or persisted connector metadata.

The init UX should be extremely operator-friendly: every step should explain what it is doing, why it matters, and exactly how to unblock it in plain language.

---

## Why This Exists

Today Frankenbeast setup is fragmented across:

- `npm install`
- `docker compose up -d`
- `.env` editing
- provider-specific login commands
- config files and env vars
- dashboard work that will own durable agent configuration
- future connector setup for chat, channels, file stores, and productivity systems

That is acceptable for early development, but it is not a coherent operating model.

Once the dashboard, chat, connector, and agent-profile work is complete, Frankenbeast needs a real bootstrap workflow that can answer:

- what is required to run on this machine or deployment?
- which services are enabled?
- which providers are authenticated?
- which agent profile is active?
- which external integrations are connected and authorized?
- is the system actually ready right now?

If init cannot answer those questions deterministically, the platform will remain brittle.

---

## Current State Snapshot (Updated 2026-03-09)

This plan needs to start from the repo that exists today, not from the repo implied by the older dashboard/chat plans.

### Already landed on `main`

- `franken-web` now exists as the dashboard application shell
- dashboard chat is already wired to the shared chat runtime over HTTP bootstrap plus WebSocket streaming
- `franken-orchestrator` now exposes a real `frankenbeast chat-server` command
- the local run path is documented in `docs/guides/run-dashboard-chat.md`
- ADR-016 records the decision that dashboard chat is a thin client over the CLI-chat-compatible runtime

### In flight on the current `feature/channel-integrations` worktree

- `franken-comms` already exists on this branch
- the branch contains core comms abstractions, a `ChatSocketBridge`, session mapping, Hono server scaffolding, and Slack/Discord adapters
- Slack signature verification is already implemented on the branch
- Discord integration and Ed25519 request verification are also in flight on the branch

### Still not landed

- dashboard-managed durable agent profile configuration is still plan-stage
- file-store and productivity integrations are still plan-stage
- a canonical `frankenbeast init` entrypoint does not exist yet

### Implication for this plan

The init workflow should not wait for a hypothetical future dashboard/chat stack. It should treat the current dashboard chat server path as an existing service to bootstrap and verify, and it should phase channel/file/productivity setup behind the abstractions that are already landing.

---

## Key Design Decision

### Init is a shared engine, exposed through CLI and dashboard

Do not build one bootstrap flow in the CLI and a second one in the dashboard.

Instead:

- the canonical init engine should live in shared backend/runtime code
- `frankenbeast init` should invoke that engine locally
- the dashboard should call the same engine through API routes and status endpoints

This keeps:

- config validation consistent
- provider capability checks consistent
- auth and readiness logic consistent
- progress reporting and remediation guidance consistent

The dashboard is the operator control plane for durable settings.
The CLI remains the universal bootstrap and recovery surface.

### Security is a hard gate, not a follow-up concern

If secure storage, encryption, scoping, redaction, or access-control requirements are not satisfied, init should fail closed.

Do not allow Frankenbeast to enter a "mostly configured" state that persists sensitive material unsafely just to improve setup convenience.

### Security defaults on, but insecure mode is allowed explicitly

Local development sometimes needs a fast path.

The init workflow should therefore support an explicit insecure mode that is:

- easy to invoke
- never the default
- clearly labeled unsafe
- reflected in resulting system state
- reversible later through repair or migration to secure settings

This preserves a secure default without trapping the operator when they intentionally choose a lower-safety local setup.

---

## Scope

### In scope

- a canonical `frankenbeast init` workflow
- resumable and idempotent initialization
- split between instance-level and project-level init
- bootstrapping durable config from dashboard-managed agent profiles
- preflight checks for binaries, services, directories, and environment
- provider login and auth-status verification for CLI agents
- external connection setup for enabled integrations
- plugin install/config passthrough where provider capabilities allow it
- storage initialization and migrations
- service startup verification and dependency checks
- readiness reporting with actionable failures
- non-interactive automation mode for CI/devcontainer/bootstrap scripts

### Out of scope

- replacing normal execution commands such as `run`, `chat`, or `issues`
- storing plaintext secrets in config files
- inventing dashboard-only config that diverges from runtime schemas
- silently auto-fixing every missing dependency without operator visibility
- forcing all optional integrations to be configured during init

---

## Required Properties

The init workflow must be:

- **idempotent**: safe to run repeatedly
- **resumable**: interrupted setup can continue without restarting from zero
- **capability-aware**: only asks for config that matters for enabled features
- **provider-specific**: provider login and plugin behavior differs by LLM
- **secret-safe**: no plaintext token persistence outside approved secret stores
- **fail-secure**: missing security prerequisites block sensitive features rather than silently downgrading protection
- **redacted by default**: logs, readiness reports, and UI status views must never echo secrets back to the operator
- **UX-friendly**: every step explains itself in plain language
- **actionable**: every failure ends with a concrete next step
- **consent-driven**: security downgrades require an explicit choice
- **explainable**: every failure yields a concrete remediation message
- **automation-friendly**: supports non-interactive and partially preseeded setup

---

## Init Model

Treat init as two coordinated scopes.

## 1. Instance Init

Instance init prepares the Frankenbeast installation or deployment host.

It owns:

- runtime prerequisites such as Node, Docker, and required CLIs
- shared service configuration
- secret storage and encryption prerequisites
- provider auth state checks
- dashboard/database/service bootstrap
- shared external connector registrations

Examples:

- verifying `claude`, `codex`, `gemini`, `aider`, and `gh` availability if enabled
- checking Docker and required containers or equivalent deployed services
- verifying observability endpoints and backing stores
- ensuring encryption key material exists for connector token storage

## 2. Project Init

Project init binds a repo or workspace to Frankenbeast.

It owns:

- `.frankenbeast/` project state
- selected default agent profile
- repo-specific defaults
- enabled features for that project
- project-level allowlists and integration bindings
- chat/session storage roots if applicable

Examples:

- selecting the default provider chain for this repo
- enabling GitHub issues mode for this repo
- binding allowed Google Drive folders or Sheets docs to the project
- enabling specific channel transports for this project

This split matters because some setup is machine-wide and some is repo-scoped.

---

## Configuration Domains Covered By Init

Init should unify the durable setup surface across the completed plans.

## Core runtime config

- tracing enabled/disabled
- heartbeat enabled/disabled
- default budget
- max total tokens
- max duration
- max critique iterations
- minimum critique score
- default PR behavior
- repo/base-branch defaults where durable

## Agent profile config

From the dashboard agent-configuration plan:

- default provider
- fallback chain
- per-provider model selection
- per-provider command overrides
- per-provider extra args
- provider-specific plugin selections
- provider-specific plugin config
- per-provider or profile-level max context window limits

## Chat config

From the chatbot plan:

- chat enabled/disabled
- cheap model
- premium reasoning model
- premium execution provider
- premium execution fallback chain
- transcript/session retention limits
- escalation policy defaults

## Channel integration config

From the channel integrations plan:

- enabled channels
- webhook/signing secrets
- channel-to-project/session mapping defaults
- platform app credentials

## File-store integration config

From the file-store plan:

- enabled storage providers
- connection metadata
- path/bucket/folder allowlists
- upload/download policy defaults
- encryption and token-store prerequisites

## Productivity integration config

From the productivity plan:

- enabled providers
- allowed scopes
- connection metadata
- spreadsheet/calendar allowlists
- write-policy defaults and HITL requirements

## Built-in rules and memory defaults

From the error-awareness memory plan:

- init should ensure the default rules pack is enabled as part of system defaults
- this is a product default, not a required user-authored init field
- operators may later override or disable default rule packs if that becomes a supported config surface

---

## Authentication and Connection Strategy

Init must distinguish three categories of auth.

## 1. CLI agent auth

For provider CLIs such as Claude, Codex, Gemini, and Aider:

- detect whether the provider is enabled by the chosen agent profile
- verify the binary exists
- run provider-specific auth-status checks where available
- if unauthenticated, provide a deterministic next action
- optionally launch the provider login flow from CLI if the provider supports it safely

Important:

- auth behavior is provider-specific
- init should not assume one login mechanism fits all providers
- some providers may rely on env/API key presence rather than an interactive session
- init should store status and last verification result, not provider credentials in plaintext
- init logs and readiness output must redact any credential-like values, even in failure cases

## 2. External connector auth

For file-store, productivity, and channel integrations:

- create or verify connector registrations
- validate required secrets or OAuth client config
- establish connection state
- verify scopes and allowlists
- record which project(s) may use each connection
- block activation if encrypted token storage or key-management prerequisites are missing

## 3. App/operator auth

For the dashboard and backend services:

- initialize admin/operator auth if required by the dashboard plan
- verify session-secret and encryption prerequisites
- verify database access and migration health

## Sensitive Data Rules

The init system must treat the following as sensitive by default:

- provider API keys
- OAuth access and refresh tokens
- webhook signing secrets
- dashboard/session secrets
- encryption keys and key identifiers where exposure increases risk
- plugin credentials or provider-specific extension secrets
- any connection metadata that can be used to recover or impersonate access

Rules:

- never write secrets to repo-tracked config files
- never print secrets in CLI output, logs, traces, or dashboard setup pages
- never persist connector secrets without encryption-at-rest and key separation
- never send raw secrets into LLM prompts
- prefer references to secret handles, key IDs, or connection IDs over raw values
- require explicit operator action before enabling any integration that introduces new secret material
- allow temporary insecure local storage only when the operator explicitly opts into it
- mark insecurely stored secrets or degraded connections so repair flows can find them later
- never present insecure storage as equivalent to secure storage

---

## Plugin Handling

Plugin setup must remain capability-driven and per provider.

Init should:

- inspect provider capabilities from the canonical registry
- show plugin setup only for providers that support it
- support marketplace passthrough installs where available
- support manual plugin config where marketplace install is not available
- verify installed/enabled plugins match the selected agent profile

Init should not:

- invent a fake cross-provider plugin model
- claim plugins exist for providers that do not support them
- hardcode provider plugin semantics into a generic form without capability metadata

---

## Service Bootstrap Responsibilities

The init workflow should own readiness for all required services, whether local or remotely hosted.

Examples of services and dependencies:

- dashboard API and UI (`franken-web`)
- analytics and dashboard storage
- chat backend (`frankenbeast chat-server`)
- channel webhook server (`franken-comms`, currently in flight)
- file-store gateway
- productivity gateway
- firewall service
- observability endpoints such as Tempo and Grafana
- Chroma or any future memory/analytics backing services

For each service, init should understand:

- required vs optional
- local vs remote
- config source
- healthcheck endpoint or readiness probe
- migration requirements
- blocking dependency chain
- security dependency chain such as secret stores, KMS availability, session-secret presence, and auth middleware readiness

---

## Proposed User Experience

## CLI

Add a dedicated command:

```bash
frankenbeast init
```

Recommended modes:

- `frankenbeast init`
- `frankenbeast init --project`
- `frankenbeast init --instance`
- `frankenbeast init --profile <id>`
- `frankenbeast init --non-interactive`
- `frankenbeast init --from-config <file>`
- `frankenbeast init --verify`
- `frankenbeast init --repair`
- `frankenbeast init --insecure`
- `frankenbeast init --allow-insecure <feature-list>`

Recommended flow:

1. preflight system checks
2. discover existing config and incomplete init state
3. select or load agent profile
4. collect only missing required config
5. verify provider auth for enabled agents
6. configure enabled connectors
7. initialize local state, migrations, and service bindings
8. install or verify plugins where supported
9. run readiness checks
10. write a final report with pass/fail per domain

UX requirements:

- each step starts with a short explanation of what Frankenbeast is checking or changing
- each explanation should be understandable by a first-time operator without internal repo context
- each failure should explain:
  - what failed
  - why Frankenbeast needs it
  - what exact action will unblock it
- when possible, provide a copy-pasteable command, path, URL, or button label
- avoid jargon unless followed immediately by a plain-English restatement
- long-running flows should show progress and what remains
- if user input is required, ask one thing at a time unless batching is materially faster

Example style:

- "I’m checking whether the Claude CLI is signed in. Frankenbeast needs that to talk to Claude."
- "This failed because the `claude` command is missing."
- "To fix it, install Claude CLI and run `frankenbeast init --repair`."

## Security downgrade UX

If the operator chooses to bypass a security control, init should make that easy but unmistakable.

Rules:

- safe options come first and are recommended
- unsafe options are labeled directly
- the tool should explain the specific risk in plain language
- the operator should not have to fight the tool to continue in intentional local-dev mode
- the final report should clearly say which protections were bypassed

Recommended labels:

- `Use encrypted token storage (Recommended)`
- `Use local plaintext storage for development only (Unsafe)`

- `Require signed webhook validation (Recommended)`
- `Skip webhook signature validation for local testing (Unsafe)`

- `Block startup until secure auth is available (Recommended)`
- `Continue with insecure local override (Unsafe)`

If the unsafe path is chosen, Frankenbeast should immediately explain the consequence, for example:

- "This token will be kept with weaker local protection. Anyone with access to this machine may be able to use it."
- "Webhook requests will not be verified. Another local process could fake them."

## Dashboard

The dashboard should expose the same workflow as:

- a first-run setup wizard
- an instance health/setup page
- a project onboarding flow
- a repair/re-verify action for degraded systems

The dashboard should not reimplement init logic client-side.

---

## Recommended Ownership

### Canonical init engine in `franken-orchestrator`

The core orchestration should live with the runtime that consumes the resulting state.

Recommended shape:

```text
packages/franken-orchestrator/src/
  init/
    init-types.ts
    init-schema.ts
    init-state-store.ts
    init-runner.ts
    preflight.ts
    config-discovery.ts
    provider-auth-check.ts
    connector-bootstrap.ts
    plugin-bootstrap.ts
    service-readiness.ts
    readiness-report.ts
```

### Dashboard integration

The dashboard layer should add:

```text
packages/franken-web/src/
  pages/
    setup.tsx
    project-onboarding.tsx
    repair.tsx
  lib/
    init-api.ts
```

### Integration package participation

As the other plans land, each subsystem should expose a small init contract rather than force `frankenbeast init` to know every internal detail.

Example:

```ts
interface InitContributor {
  id: string;
  collectRequirements(input: InitContext): Promise<InitRequirement[]>;
  verify(input: InitContext): Promise<InitCheckResult[]>;
  apply(input: InitContext): Promise<InitMutationResult[]>;
}
```

This allows:

- `franken-comms`
- `franken-files`
- `franken-productivity`
- dashboard storage/backend
- chat/session storage

to plug into init without centralizing all provider logic in one file.

---

## Phased Implementation

## Phase 1: Core init framework

Build the shared init engine and state model.

Deliverables:

- `init` command skeleton
- init state store
- preflight check framework
- readiness report format
- idempotent apply/verify loop

Done when:

- init can run and report missing prerequisites without mutating unrelated state
- interrupted runs can resume from recorded state

## Phase 2: Core runtime bootstrap

Cover the current Frankenbeast setup surface.

Deliverables:

- existing `.env` and config discovery
- Docker/service readiness checks
- state-dir creation
- migration hooks
- current verifier integration or replacement

Done when:

- current quickstart setup can be completed through `frankenbeast init`
- the existing dashboard chat run path can be completed through `frankenbeast init` plus one follow-on launch command
- `scripts/verify-setup.ts` is either delegated to the new readiness engine or retired

## Phase 3: Existing chat and dashboard foundation

Integrate the already-shipped dashboard chat foundation into init.

Deliverables:

- `chat-server` readiness checks
- dashboard API/UI readiness checks
- project-level chat/session storage bootstrap
- verification that the active provider/runtime configuration is sufficient for chat to answer turns

Done when:

- the current `docs/guides/run-dashboard-chat.md` flow can be reduced to a guided init plus launch path
- a new operator can get to a working dashboard chat session without piecing together chat-specific setup manually

## Phase 4: Agent profile and provider auth

Integrate dashboard-managed agent profiles once that work lands, while still covering provider-specific auth deterministically.

Deliverables:

- agent-profile selection and validation
- provider capability lookups
- provider auth-status checks
- plugin verification/install passthrough where supported

Done when:

- enabled providers can be verified deterministically before first run
- profile-to-runtime translation is validated during init rather than failing late during execution

## Phase 5: Dashboard onboarding over the shared init engine

Expose the same init state and repair surface through the existing `franken-web` dashboard.

Deliverables:

- setup wizard and API wiring in `franken-web`
- project onboarding path
- repair and re-verify actions backed by the shared init engine

Done when:

- a new operator can onboard through either CLI or dashboard and reach the same resulting state

## Phase 6: External connector setup

Integrate channels, file stores, and productivity systems in the order their underlying packages actually exist.

Deliverables:

- channel connector registration flow over `franken-comms` first
- OAuth or secret prerequisites
- scope validation
- allowlist capture
- per-project bindings
- later hooks for file-store and productivity providers as those packages land

Done when:

- enabled connectors are validated during init with clear pass/fail status
- risky write-capable integrations are blocked until required policy fields exist

Notes:

- for channels, the first init target should be the currently in-flight Slack and Discord surfaces
- do not block Phase 6 on Telegram/WhatsApp, file-store, or productivity work that does not exist yet

## Phase 7: Repair and drift detection

Support long-lived operation after initial setup.

Deliverables:

- `--verify` mode
- `--repair` mode
- config drift detection
- expired auth and broken healthcheck detection

Done when:

- init is useful both for first-time setup and for restoring broken deployments

---

## Validation Rules

The init engine should fail fast on blocking prerequisites and degrade gracefully on optional ones.

Examples:

- selected default provider missing binary: blocking
- selected provider unauthenticated: blocking for that profile
- optional Slack integration not configured while disabled: non-blocking
- Google Sheets write scope requested without policy fields: blocking
- dashboard enabled but storage migrations failed: blocking
- secret store unavailable for enabled connector auth: blocking
- missing encryption key material for persisted credentials: blocking
- readiness report attempts to expose raw secret-bearing config: treat as implementation defect and fail the report path safely
- default rules pack missing: auto-repairable warning or blocking depending on final runtime design

If insecure mode is explicitly enabled:

- secret store unavailable for enabled connector auth: warning or conditional pass for approved insecure-local mode
- missing encryption key material for persisted credentials: warning or conditional pass for approved insecure-local mode
- resulting status should be `warning` or `degraded`, never fully healthy

---

## Suggested Readiness Report

The final output should group results by domain:

- system prerequisites
- core config
- agent profile
- provider auth
- plugins
- dashboard/chat
- channels
- file stores
- productivity integrations
- storage and migrations
- service health

Each result should include:

- status: `ok | warning | failed | skipped`
- why it matters
- current detected state
- exact remediation step

This report should be machine-readable and human-readable.

---

## Exit Criteria

- `frankenbeast init` exists and is the canonical bootstrap entrypoint
- init is idempotent and resumable
- CLI and dashboard use the same backend init engine
- init explains each step in plain language and gives actionable unblock guidance
- durable config is sourced from canonical schemas, not duplicated UI models
- enabled provider auth is verified before normal execution starts
- plugin install/config passthrough works only for supported providers
- required services and stores are initialized and healthchecked
- optional integrations are capability-gated and do not block unrelated setup
- insecure bypass paths exist for local development, are easy to invoke, and are clearly marked unsafe
- a complete readiness report is available for both first-run and repair scenarios
- existing quickstart/setup documentation is rewritten around the new init flow

---

## Non-Negotiable Constraints

- no plaintext long-lived connector secrets in repo config
- no plaintext sensitive values in init logs, readiness reports, traces, or dashboard setup responses
- no second config language invented only for the dashboard or init wizard
- no hidden provider-specific auth assumptions
- no silent enabling of write-capable integrations without policy capture
- no enabling of secret-backed integrations without encrypted storage and access-control prerequisites
- no silent security downgrade; insecure modes must be explicit, labeled, and auditable
- no one-shot happy-path-only setup flow; repair and drift handling are required
