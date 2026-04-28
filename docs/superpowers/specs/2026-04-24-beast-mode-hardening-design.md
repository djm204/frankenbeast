# Beast Mode Hardening Design

**Date:** 2026-04-24
**Status:** Approved
**Scope:** Full in-place hardening of the live `franken-orchestrator` beast surface so the entire beast workflow and its live command families are actually usable.

## Goal

Make the current beast runtime credible as a real operator-facing system rather than a partially wired advanced beta.

For this pass, “beast mode” means the live `franken-orchestrator` surface shipped through:

- `frankenbeast interview`
- `frankenbeast plan`
- `frankenbeast run`
- `frankenbeast issues`
- `frankenbeast chat`
- `frankenbeast chat-server`
- `frankenbeast skill *`
- `frankenbeast security *`
- `frankenbeast network *`
- `frankenbeast beasts *`

The outcome is not “cleaner architecture later.” The outcome is that these commands all have real behavior, real verification, and no silent correctness gaps on the paths they advertise today.

## Product Boundaries

### In scope

- hardening the live beast CLI and server surfaces in `packages/franken-orchestrator`
- fixing sibling-package integration gaps only where the live beast surface depends on them
- wiring documented beast flags and config knobs so they materially affect runtime behavior
- replacing permissive fallback success behavior with real module wiring or explicit failure on required paths
- proving the live surface with targeted integration and E2E verification

### Out of scope

- reviving removed historical package CLIs that are no longer shipped in the current monorepo
- broad modularization or package-boundary cleanup not required for beast usability
- speculative feature expansion unrelated to closing current usability gaps
- polishing every package as a standalone product when it is not part of the live beast surface

## Current State Summary

The live beast surface is substantially more real than the March 2026 audit suggested, but it still has several classes of gap that keep it from being fully usable:

1. **Control-surface drift**  
   Some documented flags and config fields are parsed or loaded but do not fully alter runtime behavior on the main path.
2. **Permissive fallback behavior**  
   Critical module construction paths still fall back to stub-like success behavior instead of forcing a real implementation path or failing clearly.
3. **Ambiguous resume semantics**  
   Resume and checkpoint recovery behavior is not yet explicit and authoritative on the main `run` surface.
4. **Uneven surface proof**  
   The repo has broad test coverage, but the command-family proof for the whole live beast surface is still incomplete or brittle.
5. **E2E reliability gaps**  
   Existing beast E2E tests are close enough to reveal intent, but not yet trustworthy enough to act as the release gate.

This design treats those as correctness problems, not polish problems.

## Hardening Strategy

The work will be done in place, inside the existing beast runtime, with four ordered passes.

### Pass 1: Truth Pass

Establish the real contract of the live beast surface and remove hidden no-op behavior by wiring every advertised control that is meant to work.

Required outcomes:

- every documented live beast flag or config field either changes behavior in a tested way or is implemented during this pass
- default-provider selection follows the configured source of truth rather than a hidden CLI default where configuration is expected to win
- command-specific runtime options are propagated end-to-end instead of stopping at argument parsing or session config storage

### Pass 2: Execution Pass

Close core beast-path gaps in module assembly and execution semantics.

Required outcomes:

- required module paths use real implementations
- failures in required module construction surface as explicit errors instead of silently succeeding through permissive fallback behavior
- planner, critique, governor, firewall, memory, heartbeat, skills, and MCP-dependent paths are either fully live where required by the beast flow or fail clearly with actionable errors
- main-path checkpoint and resume behavior is explicit and tested

### Pass 3: Surface Pass

Harden each live command family against real usage rather than inferred correctness.

Required outcomes:

- `interview -> plan -> run` works through the real beast path
- `issues` executes through a real issue triage and run path
- `chat` and `chat-server` use the same real runtime semantics expected by the dashboard and terminal surfaces
- `skill`, `security`, `network`, and `beasts` command families each have focused proof of their real path

### Pass 4: Proof Pass

Make verification authoritative.

Required outcomes:

- a compact beast verification matrix exists and is runnable
- focused integration and E2E tests are green on the hardened command families
- the project can make a credible claim that beast mode is usable because the proof matches the surface

## Acceptance Criteria

The hardening pass is only complete when all of the following are true.

### 1. No fake controls

Every documented flag or config field on the live beast surface must have one of these states:

- it changes runtime behavior in a tested way, or
- it is not part of the live surface anymore because the command/docs were updated in this pass

Silent no-ops are not acceptable.

### 2. No permissive fallback on required beast paths

When beast mode requires a real module path, runtime setup must do one of two things:

- construct the real dependency and proceed, or
- fail explicitly with a clear diagnostic

It must not silently downgrade to permissive stub success behavior for firewalling, critique, governance, memory, heartbeat, or other required control-plane functions.

### 3. Real resume semantics

`--resume` and checkpoint recovery on the main `run` path must:

- have explicit user-visible semantics
- be exercised by integration or E2E tests
- produce observable behavior that differs from a cold run

### 4. Command-family proof

Each live command family must have at least one focused proof test that exercises the real path:

- `run`
- `issues`
- `chat`
- `chat-server`
- `skill`
- `security`
- `network`
- `beasts`

These tests may be integration tests, E2E tests, or a mix, but they must prove behavior beyond unit-level mocks.

### 5. Authoritative verification matrix

The repo must end this pass with a small, explicit verification matrix for beast mode that can be rerun before future releases and trusted as the definition of “usable.”

## Design Decisions

### Live surface is the authority

The current shipped `franken-orchestrator` CLI surface is the thing being hardened. Historical package CLIs that no longer exist in the current repo are not blockers for this pass.

### Hard fail beats fake success

If a required module path cannot be built, beast mode must fail loudly rather than pretending to operate safely. This is especially important for firewall, critique, governor, memory, heartbeat, and audit-sensitive paths.

### TDD is the execution mechanism

Every correctness change in this pass should be driven by a failing integration or E2E test first whenever the behavior is externally visible. Existing passing unit tests are not enough proof for surface hardening.

### Surface-first verification, not architecture-first cleanup

The work is intentionally optimized for “the beast actually works” rather than “the internals are elegant.” Internal cleanup is allowed only when it directly reduces correctness risk or enables real behavior on the live surface.

## Work Breakdown

This design should be implemented in six execution chunks.

1. **Config and flag truthfulness**  
   Wire all advertised live-surface controls so they materially change behavior, with special attention to provider selection, runtime limits, tracing/heartbeat toggles, critique thresholds, and CLI-to-session-to-runtime propagation.

2. **Core dependency hardening**  
   Remove permissive required-path fallback behavior by completing real dependency construction and replacing silent downgrades with explicit failure where genuine runtime assembly still cannot proceed.

3. **Resume and checkpoint semantics**  
   Define, implement, and verify explicit `run --resume` behavior and related checkpoint recovery semantics.

4. **Skill, MCP, and execution-path completeness**  
   Close remaining gaps in real skill execution, MCP-dependent beast behavior, and required execution-path plumbing.

5. **Command-family proof pass**  
   Add or repair focused integration/E2E coverage for `run`, `issues`, `chat`, `chat-server`, `skill`, `security`, `network`, and `beasts`, then fix the failures those tests expose.

6. **Verification matrix and docs alignment**  
   Capture the hardened proof set and align live docs with the actual beast surface after the code is green.

## Verification Strategy

The final verification set must be small enough to run intentionally and broad enough to prove the surface.

It should include:

- focused integration coverage for dependency assembly and command-family behavior
- focused E2E coverage for the main beast workflow and at least one non-happy-path checkpoint/resume path
- verification commands recorded in the implementation plan and task log

The key rule is that verification must prove the surface users actually touch. Unit tests remain useful, but they are supporting evidence, not the release gate.

## Risks and Controls

### Risk: hardening exposes more broken paths than expected

Control:

- sequence work by command family and core runtime dependency
- keep changes narrow and test-backed
- prefer explicit failure over hidden downgrade behavior so broken paths become visible quickly

### Risk: config fixes create behavior changes that break current assumptions

Control:

- use focused regression tests around argument parsing, config loading, session setup, and runtime assembly
- align docs only after behavior is verified

### Risk: E2E tests stay flaky

Control:

- treat E2E flakiness as a product bug if it reflects real lifecycle, timeout, cleanup, or checkpoint instability
- downgrade only truly non-deterministic environment-sensitive assertions, not core flow assertions

## Definition of Done

Beast mode is “ready to use” for this pass when:

- the full live `franken-orchestrator` command surface has real, tested behavior
- required runtime dependencies no longer silently degrade to fake success
- resume/checkpoint behavior is explicit and proven
- the beast verification matrix is green
- live docs describe the beast surface that actually exists

At that point, modular cleanup can happen later from a stable base rather than while correctness is still in question.
