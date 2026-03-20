# Harness Engineering Gap Analysis

**Date:** 2026-03-16
**Repo state evaluated:** `main` at `38652e9`
**Purpose:** Compare the harness-engineering workflow described in the brief against what is functional in Frankenbeast today, then outline a prioritized action plan to close the highest-value gaps.

---

## Executive Summary

Frankenbeast is already close to a usable harness for AI coding agents, but it is not yet the full harness described in the brief.

What already works well:

- Real chunked execution with `impl` and `harden` task pairs
- Git isolation, auto-commit, resume/checkpoint recovery, and PR creation
- GitHub issue intake, triage, approval, execution, and PR handoff
- Provider abstraction, fallback handling, trace capture, token/cost accounting, and budget enforcement
- Prompt-level guardrails that keep spawned agents away from branch, push, and PR ownership

What is still missing or inconsistent:

- No Jira work source or ticket-state automation
- No closed-loop PR review ingestion and rework cycle
- No first-class, centrally enforced verification policy for lint + unit + integration + E2E
- No enforced task-size budget like "300-500 lines max per chunk"
- No consistently active end-to-end critique/governor/heartbeat pipeline in the common graph-builder execution paths
- No explicit self-review stage that is separate from implementation and hardening

The result is that Frankenbeast already behaves like a strong issue-to-PR execution harness, but not yet like a full junior-dev-style work orchestration loop.

---

## The Target Harness

The described harness has eight important behaviors:

1. Pull work from a system of record such as Jira.
2. Analyze the codebase and plan before writing code.
3. Split large changes into small reviewable units with explicit size limits.
4. Implement autonomously inside those scoped units.
5. Run standardized verification, including lint, tests, and E2E.
6. Run a self-review pass before opening a PR.
7. Move the work item, assign it back to the human, then re-enter on review feedback.
8. Enforce safety through the harness rather than trust in the prompt.

Frankenbeast covers parts of this end to end today, but not all of them, and not always through the same executable path.

---

## Current Functional Match

### What Frankenbeast already does

| Capability | Current state | Evidence |
|---|---|---|
| Plan work before execution | Functional | `LlmGraphBuilder` decomposes a design doc into execution chunks; `ChunkFileGraphBuilder` turns chunk files into a `PlanGraph`. |
| Split work into executable units | Functional | Both graph builders emit paired `impl:*` and `harden:*` tasks. |
| Keep work on isolated branches | Functional | `CliSkillExecutor` uses `GitBranchIsolator`; issue runs isolate `issue-<number>` branches. |
| Recover from interrupted runs | Functional | Checkpoints, chunk session snapshots, and dirty-file recovery are live in the CLI path. |
| Open PRs automatically | Functional | `PrCreator` pushes the branch and runs `gh pr create`. |
| Fetch and process work from GitHub issues | Functional | `IssueFetcher` wraps `gh issue list`; `IssueReview` gates execution; `IssueRunner` executes approved issues and returns PR URLs. |
| Human approval before some actions | Partially functional | Frankenbeast has real human approval loops for issue triage and can wire the governor module, but task-level governor approval only triggers when a skill is marked `requiresHitl`; common CLI chunk skills are typically not marked that way. |
| Deterministic spend and trace guardrails | Functional | `CliObserverBridge` provides token counting, cost calculation, budget checks, loop detection, and trace persistence. |
| Keep dangerous git actions out of the spawned agent | Functional | Chunk guardrails explicitly forbid `git push` and `gh pr create`; the orchestrator retains those actions. |

### What Frankenbeast only partially does

| Capability | Current state | Why partial |
|---|---|---|
| Critique planned work before execution | Partial | `createCliDeps()` can wire the real critique module, but `runPlanning()` returns early when a `graphBuilder` is provided, so graph-builder-driven flows bypass `critique.reviewPlan()`. |
| Use real memory in the CLI path | Partial | The local CLI can wire episodic memory through `franken-brain`, but memory is not yet a broader project-context and workflow-state system. |
| Human review loops before execution | Partial | `reviewLoop()` exists for design/chunk artifacts, and `IssueReview` exists for triage approval, but there is no analogous PR-comment re-entry loop. |
| Verification during execution | Partial | Chunks carry verification commands, and hardening stages run them. Recovery also sanity-checks with `npx tsc --noEmit`. But there is no central policy guaranteeing lint + tests + E2E for every run. |
| Self-review | Partial | Hardening prompts say "review and verify," and the critique package exists, but there is no separate universally-enabled self-review phase attached to every execution run. |

### What Frankenbeast does not currently do

| Capability | Current state | Gap |
|---|---|---|
| Jira-native intake and workflow updates | Missing | Current work intake is GitHub-issue-centric, not Jira-centric. |
| Move ticket status and reassign after PR | Missing | No built-in workflow adapter updates ticket state or assignee after execution. |
| Re-enter from PR comments automatically | Missing | No orchestrator path reads review comments, maps them back to a work item, and launches a follow-up run. |
| Enforce reviewability budgets like 300-500 LOC per chunk | Missing | Chunk decomposition constrains chunk count and "2-5 minutes" completion, but not line-count or diff-size ceilings. |
| First-class verification policy engine | Missing | Verification is embedded in chunk content, not centrally resolved from harness policy. |
| Full closure/reflection loop in default CLI path | Missing | Heartbeat is still stubbed in `createCliDeps()`. |

---

## The Gaps That Matter Most

### 1. Frankenbeast is GitHub-workflow-aware, not work-management-system-aware

The described harness starts with Jira and ends by moving the ticket and reassigning it. Frankenbeast today starts with GitHub issues or design docs and ends with a PR.

That is a real productivity gap, not just an integration gap.

- `IssueFetcher` is explicitly GitHub-specific and shells out to `gh issue list`.
- `IssueRunner` returns issue outcomes and PR URLs, but does not update an external system of record.
- There is no general "work source" abstraction that can normalize GitHub issues, Jira tickets, and later Linear/Asana-style work items into one lifecycle.

Impact:

- Frankenbeast can automate execution, but not the full "assign work, wait, return for review, reassign" loop described in the brief.

### 2. The planning system scopes work, but it does not enforce reviewability budgets

The described harness explicitly limits tasks to small, reviewable changes. Frankenbeast chunks work, but its constraints are softer:

- `LlmGraphBuilder` limits chunk count, not code delta size.
- `IssueGraphBuilder` asks for chunks completable in 2-5 minutes, but not 300-500 lines.
- `ChunkFileGraphBuilder` executes whatever is in the chunk file; it does not reject oversized diffs.

Impact:

- Frankenbeast can decompose work, but cannot yet guarantee the human will receive reviewable units instead of deceptively large chunks.

### 3. Verification is distributed and prompt-driven, not policy-driven

The described harness standardizes verification: lint, tests, E2E, then self-review. Frankenbeast currently has pieces of this, but no authoritative policy layer.

- Chunk definitions include `verificationCommand`, and hardening prompts run it.
- The CLI executor uses `npx tsc --noEmit` for dirty-file recovery sanity checks.
- The repo itself documents `npm test` and package-specific E2E commands, but the orchestrator does not centrally enforce them per task type.

Impact:

- Quality depends too much on how the chunk was written or decomposed.
- Two chunks with similar risk can run very different verification regimes.

### 4. Self-review exists as architecture and prompt guidance, not as a first-class execution stage

The brief describes a sub-agent self-review before PR creation. Frankenbeast has adjacent mechanisms:

- `harden:*` tasks review and verify each chunk.
- The critique module exists and is wireable.
- The UI exposes a static "code-review" skill option.

But there is still no single, standard post-implementation review stage that:

- runs after the full change is assembled,
- uses a dedicated reviewer policy,
- blocks PR creation on findings, and
- records structured review output.

Impact:

- Frankenbeast hardens chunks, but it does not yet clearly behave like "implementation agent + reviewer agent + PR gate."

### 5. The human feedback loop stops at PR creation

The brief describes a second loop: the human reviews the PR, leaves comments, reassigns to the agent, and the agent resumes from feedback.

Frankenbeast does not currently close that loop:

- `PrCreator` can create a PR.
- There is no built-in comment ingestion or review-state reader.
- There is no "resume from review feedback" orchestrator entry point.
- There is no ticket reassignment or lifecycle update after human review.

Impact:

- Frankenbeast can automate "generate PR."
- It cannot yet automate "absorb review feedback and continue until approved."

### 6. The safety architecture is stronger on paper than in the default execution path

This is the most important architectural gap.

Frankenbeast correctly values harness-enforced safety over prompt-enforced safety, but not every safety module is active in the common path:

- `planner` is still stubbed in `createCliDeps()`, even though real planning is usually supplied by graph builders.
- `heartbeat` is still stubbed in `createCliDeps()`.
- `critique` can be wired, but graph-builder-based planning bypasses it in `runPlanning()`.
- `governor` can be wired, but approvals only fire if selected skills mark `requiresHitl`, and many CLI-driven execution tasks do not.

Impact:

- Frankenbeast already has real safety rails around budget, tracing, and orchestrator-owned git actions.
- It does not yet consistently enforce the full planning-review-approval-reflection safety model described in the architecture docs.

### 7. Harness knowledge exists, but it is fragmented

The brief emphasizes that the harness compounds through standards, lints, tests, and skill files. Frankenbeast has many of these assets:

- ADRs
- design docs and plans
- chunk guardrails
- project-local skills
- module toggles
- provider configuration

But they are not yet unified into a single harness policy model that says:

- what work source this agent uses,
- what planning budget it must obey,
- what verification matrix it must run,
- what actions need HITL,
- how it should hand work back,
- how it should resume from review.

Impact:

- The knowledge is present, but it is not yet expressed as one composable harness contract per agent or workflow.

---

## Bottom Line

Frankenbeast already supports this narrower statement:

> "Give an AI coding agent a bounded task, make it plan and execute in chunks, isolate its git work, enforce spend limits, and open a PR."

It does not yet support this broader statement:

> "Run the full junior-dev-style work loop from tracked ticket intake through review feedback and rework, with consistent planning, verification, self-review, work-state updates, and safety gates."

That broader loop is the real harness-engineering gap.

---

## Prioritized Action Plan

## Priority Model

- **P0**: Unlocks the harness concept itself or closes a safety gap in the live path
- **P1**: Makes the harness materially more useful in day-to-day engineering
- **P2**: Compounds the harness and improves operator experience

## Workstreams

### P0 Workstream A: Make the live execution path match the documented safety architecture

**Goal:** Ensure the most common execution paths actually pass through critique, approval, and reflection in a way the harness can rely on.

**Tasks:**

1. Pass graph-builder-generated plans through `critique.reviewPlan()` before execution.
2. Replace the CLI heartbeat stub with the real heartbeat wiring or explicitly remove heartbeat from the default path until it is real.
3. Audit which skills can set `requiresHitl`, then define default HITL triggers for high-risk actions rather than relying only on skill metadata.
4. Add integration tests for graph-builder flows proving critique failure, governor rejection, and heartbeat output in the real CLI path.

**Why P0:** The harness cannot claim "environment-enforced safety" while core review and closure modules are bypassed or stubbed in the normal flow.

**Parallelizable:** Tasks 2 and 3 can run in parallel after task 1 is scoped.

**Dependencies:** Task 4 depends on tasks 1-3.

### P0 Workstream B: Introduce a central verification policy layer

**Goal:** Replace prompt-by-prompt verification choices with harness policy.

**Tasks:**

1. Define a `VerificationProfile` model for workflow types such as `code-change`, `refactor`, `bugfix`, and `ui-change`.
2. Resolve verification commands centrally in the orchestrator rather than only from chunk text.
3. Support ordered verification phases such as `typecheck`, `lint`, `unit`, `integration`, `e2e`, `review`.
4. Fail PR creation when required verification phases have not passed.
5. Record verification outcomes in traces and issue/PR summaries.

**Why P0:** This is the difference between "the prompt asked for tests" and "the harness enforced tests."

**Parallelizable:** Tasks 1 and 5 can start in parallel; task 2 depends on task 1; tasks 3 and 4 depend on task 2.

**Dependencies:** Task 4 depends on tasks 2 and 3.

### P1 Workstream C: Add first-class self-review before PR creation

**Goal:** Make self-review a named stage rather than an implied property of hardening.

**Tasks:**

1. Define a post-execution `ReviewResult` contract with findings, severity, and disposition.
2. Add a reviewer stage after chunk assembly and before PR creation.
3. Let the reviewer use a dedicated model/provider target and policy distinct from implementation.
4. Block PR creation on unresolved high-severity findings.
5. Surface the review summary in PR bodies and run traces.

**Why P1:** This closes the gap between "hardening prompt" and "sub-agent self-review."

**Parallelizable:** Tasks 1 and 3 can run in parallel; task 2 depends on task 1; tasks 4 and 5 depend on task 2.

**Dependencies:** Stronger if Workstream B lands first so the reviewer can run after the centralized verification phases.

### P1 Workstream D: Add a work-source abstraction and start with Jira

**Goal:** Move from GitHub-issue automation to general work-item automation.

**Tasks:**

1. Introduce a `WorkItemSource` interface that normalizes fetch, update status, assign, and add comment operations.
2. Refactor the current GitHub issue flow behind that interface without regressing existing behavior.
3. Implement a Jira adapter for fetch, transition, comment, and assignee updates.
4. Add a workflow mapping layer so Frankenbeast can map internal states to project-specific Jira transitions.
5. Extend the CLI and dashboard to choose a work source per run or per agent.

**Why P1:** This is the foundation for the "pull task from Jira, assign back to me" workflow in the brief.

**Parallelizable:** Tasks 1 and 4 can start in parallel conceptually, but task 2 depends on task 1, task 3 depends on tasks 1 and 4, task 5 depends on tasks 2 and 3.

**Dependencies:** Workstream D is independent of critique wiring, but it compounds more after Workstream B.

### P1 Workstream E: Enforce reviewability budgets in planning

**Goal:** Ensure chunks stay reviewable by policy, not hope.

**Tasks:**

1. Extend chunk definitions with explicit size-budget metadata such as target files touched, target diff size, and max allowed line delta.
2. Teach `ChunkValidator` to flag oversized chunks against the configured budget.
3. Teach `ChunkRemediator` or the decomposer to split oversized chunks automatically.
4. Add post-execution diff checks that fail a chunk if it exceeds the allowed size budget.
5. Expose per-agent reviewability budgets in configuration.

**Why P1:** This is the closest match to the "300-500 lines so they are reviewable" discipline described in the brief.

**Parallelizable:** Tasks 1 and 5 can run in parallel; tasks 2 and 3 depend on task 1; task 4 depends on tasks 1 and 2.

**Dependencies:** This work is independent of Jira and PR review ingestion.

### P2 Workstream F: Close the human-review feedback loop

**Goal:** Let the agent resume from review comments instead of stopping at PR creation.

**Tasks:**

1. Add a `ReviewFeedbackSource` abstraction for GitHub PR comments and later Jira comments or Slack threads.
2. Implement GitHub PR review comment ingestion first.
3. Add a "resume from review" workflow that converts comments into follow-up tasks or direct chunk amendments.
4. Update the work item and PR with run status when rework starts and completes.
5. Preserve review-to-fix traceability in traces and summaries.

**Why P2:** This closes the "junior dev on the other side" loop, but it is less foundational than safety and verification.

**Parallelizable:** Tasks 1 and 5 can start in parallel; task 2 depends on task 1; tasks 3 and 4 depend on task 2.

**Dependencies:** Best built after Workstream D so the same workflow abstractions can update work state cleanly.

### P2 Workstream G: Unify harness policy as a first-class agent/workflow contract

**Goal:** Turn scattered docs, skills, toggles, and prompts into one composable harness definition.

**Tasks:**

1. Define a `HarnessProfile` schema covering work source, planning budget, verification profile, HITL policy, review policy, and handoff policy.
2. Allow tracked agents to select or embed a harness profile.
3. Resolve CLI/session behavior from the profile instead of ad hoc flags and prompt text.
4. Generate operator-facing summaries that explain exactly what the harness will enforce for a run.

**Why P2:** This is the compounding layer that makes the harness portable, inspectable, and repeatable.

**Parallelizable:** Tasks 1 and 4 can start in parallel; tasks 2 and 3 depend on task 1.

**Dependencies:** This becomes much more useful after Workstreams B, D, and E exist.

---

## Dependency Overview

### Foundation first

- **A. Safety-path wiring**
- **B. Central verification policy**

These are the highest-leverage foundations. They make the live execution path worthy of being called a harness.

### Then strengthen autonomy

- **C. First-class self-review**
- **E. Reviewability budgets**

These make runs safer, more reviewable, and easier to trust.

### Then expand workflow scope

- **D. Work-source abstraction + Jira**
- **F. Review feedback ingestion**

These turn Frankenbeast from an execution harness into a real work orchestration harness.

### Then unify the operating model

- **G. Harness profile**

This should come after the key behaviors exist; otherwise it just wraps inconsistency in configuration.

---

## Parallel Execution Plan

### Batch 1

- Workstream A
- Workstream B
- Early design work for Workstream E

### Batch 2

- Workstream C
- Workstream E implementation
- Workstream D interface design

### Batch 3

- Workstream D adapter implementation
- Workstream F

### Batch 4

- Workstream G

---

## Recommended Next Moves

If the goal is to make Frankenbeast feel like the harness described in the brief as quickly as possible, the best near-term sequence is:

1. Wire critique/governor/heartbeat correctly into the real graph-builder execution path.
2. Add centralized verification profiles and gate PR creation on them.
3. Add a first-class self-review stage.
4. Add a general work-item abstraction, then implement Jira on top.
5. Add PR review comment ingestion and resume-from-feedback.

That order closes the biggest trust gap first, then closes the biggest workflow gap second.
