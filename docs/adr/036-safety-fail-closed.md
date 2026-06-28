# ADR-036: Fail Closed When Safety-Critical Modules Are Absent

- **Date:** 2026-06-28
- **Status:** Accepted
- **Deciders:** David Mendez (with Claude Code)
- **Issue:** #364 (ARCH-006, P0)

## Context

Critique (`@franken/critique`) and governor (`@franken/governor`) are
control-plane safety modules: critique reviews plans before execution, and the
governor enforces human/governor approval (HITL) gates.

The CLI dependency factory (`packages/franken-orchestrator/src/cli/dep-factory.ts`)
imports both as *optional* packages. Two distinct error modes existed:

- A **broken/installed-but-failing** module already failed loudly (the import
  error is rethrown).
- A **truly missing** module silently fell back to a passthrough stub —
  `stubCritique` returns `{ verdict: 'pass', score: 1.0 }` and `stubGovernor`
  returns `{ decision: 'approved' }`.

So a safety module that was simply *not installed* (an install-shape accident)
silently switched the runtime into all-pass / all-approve semantics, even when
the module was *enabled* in config. That is a fail-open posture on the safety
control plane and was tracked as P0 ARCH-006.

## Decision

Treat an **enabled but missing** safety module as a fail-closed condition.

In `dep-factory`, `resolveMissingSafetyModule()` now governs the missing-package
path for both critique and governor:

1. **Enabled + missing → fail closed (default).** `createCliDeps()` throws a
   descriptive error refusing to run with safety gating disabled. This is the
   default, no-config behavior.
2. **Explicitly disabled in config (`modules.critique=false` /
   `modules.governor=false`) → stub.** This remains a legitimate, operator-chosen
   opt-out and keeps the passthrough stub silently. (`config.modules.*` is the
   existing CLI/runConfig/`FRANKENBEAST_MODULE_*` toggle.)
3. **Enabled + missing + explicit unsafe opt-out → stub with a loud warning.**
   Setting `FRANKENBEAST_ALLOW_MISSING_SAFETY_MODULES=1` retains the stub but
   emits a `SAFETY DEGRADED` warning recording that gating is disabled, mirroring
   the `FRANKENBEAST_ALLOW_NONINTERACTIVE_APPROVAL` escape hatch from ADR-034.

This is the same fail-closed principle already applied to dependency assembly
(ADR-033) and approval boundaries (ADR-034), extended to module *presence*.

## Consequences

### Positive
- A missing critique/governor package can no longer silently disable plan
  review or approval gating.
- Degraded-safety runs require an explicit, audited opt-out.
- Intentional disable via config is preserved and unaffected.

### Negative
- Environments that relied on a missing package implicitly disabling a still-
  enabled safety module must now either install it, disable the module in config,
  or set `FRANKENBEAST_ALLOW_MISSING_SAFETY_MODULES=1`.

### Risks
- Startup now fails harder in incomplete installs; the error message lists the
  three remediation paths to keep this actionable.

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| Keep silent stub fallback | No behavior change | Fail-open on safety control plane | The exact P0 finding |
| Always throw, no opt-out | Strongest default | Blocks legitimate test/dev without the package | Config-disable + env opt-out cover those without fail-open by default |
| Auto-disable the module when missing | "Just works" | Indistinguishable from operator intent; still fail-open | Hides a safety-relevant install defect |
