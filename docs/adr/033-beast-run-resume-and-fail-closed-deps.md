# ADR-033: Explicit Beast Resume And Fail-Closed Dependency Assembly

- **Date:** 2026-04-26
- **Status:** Accepted
- **Deciders:** David Mendez

## Context

The live beast CLI had two correctness gaps on its main execution surface:

- `frankenbeast run --resume` was parsed and documented, but cold runs and resumed runs used the same implicit checkpoint behavior.
- required dependency assembly paths could silently degrade to permissive fallback deps when consolidated module wiring failed.

Those behaviors made the operator-facing contract ambiguous. A user could not tell whether they were resuming intentionally, and a broken runtime assembly could look superficially successful even though critical modules were no longer real.

## Decision

The live beast `run` surface now follows two explicit rules:

1. Cold runs start cold.
   Without `--resume`, the CLI clears any existing checkpoint state before execution begins.

2. Resume is explicit and fail-fast.
   `--resume` requires existing checkpoint data. If no checkpoint exists, the CLI fails with a clear error instead of silently behaving like a cold run.

Required dependency assembly also fails closed:

- if consolidated beast dependency construction fails, `createCliDeps()` raises an explicit error
- it does not synthesize permissive fallback success deps for firewall, memory, skills, heartbeat, or the broader runtime bag

## Consequences

### Positive

- operators can distinguish a deliberate resume from a fresh execution
- stale checkpoints no longer change cold-run behavior invisibly
- broken required-path runtime wiring becomes visible immediately
- verification can assert the real runtime contract instead of tolerating hidden downgrade paths

### Negative

- users must opt into resume explicitly
- previously tolerated misconfigured runtime assembly now fails loudly

### Risks

- users who relied on implicit checkpoint reuse will see a behavior change
- more failures become visible at startup, which can feel harsher until surrounding docs and setup are aligned

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| Keep implicit checkpoint reuse for cold runs | Lowest behavior change | Resume remains ambiguous and user-visible state stays implicit | Conflicts with the hardening goal of explicit runtime semantics |
| Keep permissive fallback deps when assembly fails | Hides startup failures | Produces fake success on required beast paths | Violates the live-surface correctness contract |
| Fail on `--resume` missing checkpoint but keep cold-run reuse | Partial clarity | Cold runs still inherit hidden state | Still leaves the main path ambiguous |
