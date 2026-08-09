# ADR-042: Retire Frankenbeast operational dashboard ownership

- **Date:** 2026-08-09
- **Status:** Accepted
- **Deciders:** Frankenbeast maintainers
- **Supersedes:** Frankenbeast ownership of the Smart Swarm/Brain Vitals operational dashboard surfaces
- **Related:** Smart Swarm issues #15, #16, and #189; Frankenbeast PR #3867

## Context

Frankenbeast is a shared monorepo for deterministic safety guardrails, the Beast runtime, provider adapters, governance, memory, observability, and web tooling. It also acquired a duplicate operational dashboard for swarm topology, runtime Brain Pulse evidence, and approvals while Smart Swarm was being established as the provider-neutral swarm product.

Smart Swarm is now the canonical owner of those operational surfaces. Keeping the Frankenbeast dashboard active would create two operator entry points with independent routing, runtime assumptions, and lifecycle behavior. Archiving the entire Frankenbeast repository would solve the duplication by destroying access to unrelated, still-active guardrail and runtime packages, so repository-wide archival is not a safe retirement mechanism.

## Decision

Frankenbeast retires only its operational swarm dashboard ownership:

- `#/smart-swarm` no longer mounts the Frankenbeast topology, Brain Pulse, or approval client. It renders a bounded retirement gate linking to the canonical [Smart Swarm repository](https://github.com/djm204/smart-swarm).
- The historical `#/brain-vitals` hash resolves to the same retirement gate, so old bookmarks cannot reopen the duplicate operational surface.
- Frankenbeast's README, GitHub repository description, and GitHub homepage identify Smart Swarm as the successor for these surfaces.
- The repository remains unarchived. Deterministic guardrails, Beast orchestration, provider/runtime adapters, governance, memory, observability, and unrelated web/CLI surfaces remain supported in Frankenbeast.
- Existing implementation modules and tests for the former dashboard may remain temporarily as non-routed code to preserve history and reduce deletion risk. They are not an operator-owned production route and should not receive new product functionality. A later focused cleanup may remove them after confirming no package consumers depend on them.

The Smart Swarm tracking record must contain immutable Frankenbeast merge and repository-metadata evidence before issue #189 is closed. Live deployment/service retirement remains owned by Smart Swarm's separate acceptance process; this ADR does not authorize disabling a running service.

## Consequences

### Positive

- Operators receive one explicit canonical destination for swarm topology, runtime Brain Pulse evidence, and approvals.
- Frankenbeast's active deterministic guardrails and Beast runtime remain available.
- Legacy `brain-vitals` bookmarks fail safely into an explanatory handoff instead of silently loading a duplicate dashboard.
- Repository metadata and documentation describe the same ownership boundary as runtime routing.

### Negative

- The Frankenbeast package may temporarily retain unreachable implementation code for the former operational dashboard.
- The gate links to the Smart Swarm repository rather than guessing a deployment-specific dashboard URL.
- Operators must complete Smart Swarm's separate live-profile acceptance before retiring duplicate deployed services.

### Risks

- A future change could accidentally remount the legacy page. Focused route tests must continue asserting the gate content and absence of legacy API fetches.
- Repository metadata can drift independently from source. Closeout verification must read it back through the authenticated GitHub API.
- Removing retained modules without a dependency audit could break library consumers; deletion is intentionally outside this decision.

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| Archive the entire Frankenbeast repository | Strong retirement signal | Disables active guardrail/runtime development and misstates monorepo status | The repository contains unrelated active products and deterministic safety code |
| Keep both operational dashboards active | No immediate routing change | Duplicates ownership and can present conflicting runtime/approval state | Smart Swarm is the canonical successor |
| Automatically redirect to a guessed deployed Smart Swarm URL | One-click transition | Deployment URL is environment-specific and no immutable canonical deployment URL is established here | Fabricating or hard-coding an unverified endpoint is unsafe |
| Gate the routes and link to the verified Smart Swarm repository | Explicit, reversible, and non-destructive | Requires one extra operator navigation step | Accepted |
