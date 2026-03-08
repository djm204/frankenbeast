# Docs Truth Cleanup - Implementation Plan

> Source brief: `docs/plans/2026-03-07-docs-truth-cleanup-plan.md`
>
> Goal: execute the docs truth cleanup as a set of small, parallel, context-friendly documentation patches.

## Objective

Bring the main repo docs back into alignment with the current codebase.

This plan is intentionally conservative:

- document only what is actually present in code now
- label partial wiring honestly
- separate current behavior from target architecture
- avoid speculative cleanup unrelated to the truth baseline

## Execution Model

Use a coordinator + sub-agent model.

- The coordinator owns the source brief, scope control, and final merge.
- Each sub-agent gets a narrow file set and a short list of code references to verify against.
- Sub-agents work in parallel on disjoint files whenever possible.
- A final integration pass resolves wording drift and checks cross-doc consistency.

## Ground Rules For Every Sub-Agent

1. Read `docs/plans/2026-03-07-docs-truth-cleanup-plan.md` first.
2. Only edit the files assigned to the chunk.
3. Verify claims against code, not against other docs.
4. Remove obsolete claims instead of rewording them into softer falsehoods.
5. If a capability is partial, name the working part and the missing part.
6. Do not add new product direction, roadmap promises, or architecture claims.

## Shared Verification References

Every chunk may cite these if needed:

- `franken-orchestrator/src/cli/args.ts`
- `franken-orchestrator/src/cli/run.ts`
- `franken-orchestrator/src/cli/dep-factory.ts`
- `franken-orchestrator/src/phases/execution.ts`
- `franken-orchestrator/src/checkpoint/file-checkpoint-store.ts`
- `franken-orchestrator/src/closure/pr-creator.ts`
- `franken-orchestrator/src/adapters/cli-observer-bridge.ts`
- `package.json`
- `franken-orchestrator/package.json`
- `franken-observer/package.json`

## Parallel Workstreams

### Chunk 01: Root Ramp-Up Truth Pass

**Owner:** Sub-agent A

**Files:**

- `docs/RAMP_UP.md`

**Purpose:**

Make the short onboarding doc the primary truthful source for current repo state.

**Required changes:**

- correct repo-shape wording
- correct root build/test wording
- correct CLI flags and subcommands
- state mixed CLI wiring accurately
- mention all CLI stubs, including skills
- keep the PR target branch limitation
- stop implying explicit `--resume` works

**Code refs to verify:**

- `package.json`
- `franken-observer/package.json`
- `franken-orchestrator/src/cli/args.ts`
- `franken-orchestrator/src/cli/dep-factory.ts`
- `franken-orchestrator/src/cli/run.ts`

**Success criteria:**

- no stale flag names remain
- root scripts are described accurately
- limitations match current code

### Chunk 02: Orchestrator Ramp-Up Truth Pass

**Owner:** Sub-agent B

**Files:**

- `franken-orchestrator/docs/RAMP_UP.md`

**Purpose:**

Repair the most outdated package-specific doc without turning it into a full rewrite.

**Required changes:**

- replace obsolete CLI invocation block
- remove `--project-id`, `--model`, `--dry-run`
- document current subcommands and flags
- explain checkpoint skip vs explicit resume honestly
- clarify partial CLI wiring
- fix the `executeTask()` characterization

**Code refs to verify:**

- `franken-orchestrator/src/cli/args.ts`
- `franken-orchestrator/src/cli/run.ts`
- `franken-orchestrator/src/cli/dep-factory.ts`
- `franken-orchestrator/src/phases/execution.ts`

**Success criteria:**

- package doc matches current orchestrator CLI surface
- no text claims `--resume` or `--dry-run` works
- no text claims the CLI is fully wired

### Chunk 03: User Entry Docs Pass

**Owner:** Sub-agent C

**Files:**

- `docs/guides/quickstart.md`
- `README.md`

**Purpose:**

Fix the main user entrypoints so they stop teaching commands and flows that no longer exist.

**Required changes:**

- replace obsolete CLI examples
- remove `--project-id` and `--dry-run` usage
- replace broken `npm run build:all` with the real script
- align the README CLI section with the current parser
- soften overclaims about fully wired execution
- avoid claiming Docker services are mandatory unless the documented flow truly requires them
- qualify ambitious Heartbeat and MCP claims if they are kept

**Code refs to verify:**

- `package.json`
- `franken-orchestrator/src/cli/args.ts`
- `franken-orchestrator/src/cli/dep-factory.ts`
- `franken-orchestrator/src/phases/execution.ts`

**Success criteria:**

- quickstart commands can exist as-written in the current repo
- README examples do not contradict the current CLI
- user-facing setup guidance is narrow and honest

### Chunk 04: Historical and Status Docs Pass

**Owner:** Sub-agent D

**Files:**

- `docs/PROGRESS.md`
- `docs/cli-gap-analysis.md`

**Purpose:**

Keep historical context, but stop presenting stale status as current fact.

**Required changes:**

- add a short historical-status disclaimer to `docs/PROGRESS.md`
- remove current-state contradictions such as `--dry-run outputs config`
- relabel "all gaps closed" claims where code still has known gaps
- reopen or relabel explicit resume as incomplete
- add the PR target branch wiring gap
- distinguish implicit checkpoint recovery from explicit resume behavior

**Code refs to verify:**

- `franken-orchestrator/src/cli/args.ts`
- `franken-orchestrator/src/cli/run.ts`
- `franken-orchestrator/src/cli/dep-factory.ts`
- `franken-orchestrator/src/phases/execution.ts`

**Success criteria:**

- historical docs no longer act as present-tense product docs
- gap analysis reflects the actual remaining gaps

### Chunk 05: Architecture Honesty Pass

**Owner:** Sub-agent E

**Files:**

- `docs/ARCHITECTURE.md`

**Purpose:**

Preserve the architecture doc's value while clearly separating target architecture from currently wired behavior.

**Required changes:**

- add an explicit note that some diagrams describe target architecture
- mark the current local CLI path separately from the full target BeastLoop
- stop implying explicit resume is wired if it is not
- stop implying PR creation honors `--base-branch` if it currently does not
- avoid presenting MCP as part of the active working execution path unless the doc clearly labels that as target state

**Code refs to verify:**

- `franken-orchestrator/src/cli/dep-factory.ts`
- `franken-orchestrator/src/cli/run.ts`
- `franken-orchestrator/src/phases/execution.ts`
- `franken-orchestrator/src/closure/pr-creator.ts`

**Success criteria:**

- architecture doc keeps ambitious diagrams
- current-state claims inside the prose are still true

## Final Integration Work

### Chunk 06: Coordinator Consistency Sweep

**Owner:** Coordinator

**Files:**

- all files changed by chunks 01-05

**Purpose:**

Normalize wording, remove contradictions across docs, and make sure the truth baseline is consistently expressed.

**Checks:**

- same CLI flags everywhere
- same resume limitation everywhere
- same PR target branch limitation everywhere
- same list of CLI stubs everywhere
- same root script names everywhere
- no surviving `--dry-run`, `--project-id`, or `--model` references for `frankenbeast`
- no doc says the CLI is fully wired if stubs remain

**Suggested grep checks:**

```bash
rg -n -- '--dry-run|--project-id|--model' README.md docs franken-orchestrator/docs
rg -n "all gaps are closed|all 5 gaps are CLOSED|--resume works|targets --base-branch" README.md docs franken-orchestrator/docs
rg -n "fully wired|end-to-end|works end-to-end" README.md docs franken-orchestrator/docs
```

**Success criteria:**

- the docs read like one coherent truth pass, not five separate patchlets

## Dependency Graph

These chunks can run in parallel immediately:

- Chunk 01
- Chunk 02
- Chunk 03
- Chunk 04
- Chunk 05

This chunk waits for all others:

- Chunk 06

## Recommended Delivery Order

Even though the chunks run in parallel, merge them in this order:

1. Chunk 01
2. Chunk 02
3. Chunk 03
4. Chunk 04
5. Chunk 05
6. Chunk 06

Reason:

- lock the short source-of-truth docs first
- then align user entrypoints
- then align historical and architectural docs
- finish with a repo-wide wording pass

## Sub-Agent Prompt Template

Use this prompt shape for each chunk:

```text
Task: Execute Chunk <ID> from docs/plans/2026-03-07-docs-truth-cleanup-implementation-plan.md.

Required first read:
- docs/plans/2026-03-07-docs-truth-cleanup-plan.md

Only edit:
- <assigned file list>

Verify claims against:
- <assigned code refs>

Constraints:
- document only what is true in current code
- remove obsolete CLI flags and examples
- if behavior is partial, describe the working part and the missing part
- do not edit files outside your chunk

Deliverable:
- a patch only for your assigned files
- brief note listing any contradictions you could not resolve within chunk scope
```

## Chunk Sizing Rationale

The chunks are separated by file ownership and context shape:

- Chunk 01: short repo truth source
- Chunk 02: single package doc
- Chunk 03: user-facing entrypoints
- Chunk 04: historical/status narrative
- Chunk 05: ambitious architecture narrative
- Chunk 06: integration-only pass

That keeps each sub-agent's read surface small enough to avoid dragging the full doc set into context.

## Done Criteria

This implementation plan is complete when:

- every file in the source brief has an owning chunk
- five editing chunks can run in parallel without file conflicts
- a final consistency chunk exists
- each chunk has explicit code refs for truth verification
- the plan is narrow enough to execute without adding new product claims
