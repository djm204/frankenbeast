# LLM Error-Awareness Memory Injection — Implementation Plan

**Date:** 2026-03-09
**Status:** Proposed
**Scope:** Cross-module

## Goal

Ensure Frankenbeast tells any spawned or integrated LLM to:

- note mistakes it makes
- call out repeatable or patternistic mistakes explicitly
- treat those patterns as anti-patterns to avoid repeating

but only when that instruction is not already present in memory.

This should work as a default behavioral rule, not as an ad hoc prompt tweak tied to one provider or one execution path.

---

## Problem Statement

Right now Frankenbeast has the right high-level mechanism for this, but not the concrete behavior:

- memory hydration already loads `rules` and `knownErrors`
- prompt builders already include memory context in some paths
- chunk guardrails already inject global constraints

What is missing:

- a canonical rule for error-awareness and anti-pattern learning
- a deterministic check for whether memory already contains it
- consistent injection across all LLM-facing prompt paths

Without that, the behavior is fragile:

- one provider may get the instruction while another does not
- one code path may depend on local user memory while another silently ignores it
- the same rule may be duplicated repeatedly in prompts if injected naively

---

## Desired Behavior

If Frankenbeast does not already see an equivalent rule in memory, it should inject a default instruction like:

> Note mistakes you make. If a mistake appears repeatable or patternistic, explicitly name it as an anti-pattern and avoid repeating it.

If memory already contains an equivalent instruction, Frankenbeast should not inject another copy.

This should apply to:

- direct LLM skill prompts
- CLI adapter prompts
- CLI skill execution prompts
- chunk execution prompts

---

## Existing Touchpoints

Relevant current code paths:

- hydration loads memory into `ctx.sanitizedIntent.context`
  - [`packages/franken-orchestrator/src/phases/hydration.ts`](/home/pfk/dev/frankenbeast/packages/franken-orchestrator/src/phases/hydration.ts)
- LLM skill prompts render `Rules` and `Known Errors`
  - [`packages/franken-orchestrator/src/skills/llm-skill-handler.ts`](/home/pfk/dev/frankenbeast/packages/franken-orchestrator/src/skills/llm-skill-handler.ts)
- execution resolves hydrated memory context before skill dispatch
  - [`packages/franken-orchestrator/src/phases/execution.ts`](/home/pfk/dev/frankenbeast/packages/franken-orchestrator/src/phases/execution.ts)
- chunk prompts already receive orchestrator-level guardrails
  - [`packages/franken-orchestrator/src/planning/chunk-guardrails.ts`](/home/pfk/dev/frankenbeast/packages/franken-orchestrator/src/planning/chunk-guardrails.ts)
- single-shot CLI completions currently pass only the last user message
  - [`packages/franken-orchestrator/src/adapters/cli-llm-adapter.ts`](/home/pfk/dev/frankenbeast/packages/franken-orchestrator/src/adapters/cli-llm-adapter.ts)
- CLI task execution runs through MartinLoop/provider prompt assembly
  - [`packages/franken-orchestrator/src/skills/martin-loop.ts`](/home/pfk/dev/frankenbeast/packages/franken-orchestrator/src/skills/martin-loop.ts)

These paths should converge on one rule source and one dedupe policy.

---

## Key Design Decisions

### 1. Treat this as a rule, not a known error

This instruction belongs in the `rules` bucket, not `knownErrors`.

Reason:

- it is normative behavior
- it applies before mistakes happen
- it is not a historical failure case by itself

### 2. Add a canonical default rule constant

Do not inline this text in multiple prompts.

Create a single constant, for example:

```ts
export const DEFAULT_ERROR_AWARENESS_RULE =
  'Note mistakes you make. If a mistake appears repeatable or patternistic, explicitly name it as an anti-pattern and avoid repeating it.';
```

This keeps wording stable and makes tests precise.

### 3. Dedupe by semantic match, not exact string equality only

The check for “already in memory” should not require the memory entry to be byte-for-byte identical.

At minimum, support:

- exact normalized string match
- substring or keyword match for terms like `mistake`, `error`, `pattern`, `anti-pattern`, `avoid repeating`

Recommended helper:

```ts
function hasErrorAwarenessRule(rules: readonly string[]): boolean
```

This helper should own normalization and matching.

### 4. Inject once per prompt path, after memory resolution

Do not mutate stored memory just to make prompt construction easier.

Instead:

- resolve memory context
- compute an effective rules list
- append the default rule only when absent
- pass that effective list into prompt builders

This avoids polluting persisted memory with implicit defaults.

---

## Recommended Implementation Shape

Add a small helper module in orchestrator:

```text
packages/franken-orchestrator/src/prompting/
  default-rules.ts
  effective-memory-context.ts
```

Recommended exports:

- `DEFAULT_ERROR_AWARENESS_RULE`
- `hasErrorAwarenessRule(rules: readonly string[]): boolean`
- `buildEffectiveMemoryContext(context: MemoryContext): MemoryContext`

Behavior:

- `buildEffectiveMemoryContext()` returns the original context unchanged if an equivalent rule already exists
- otherwise it returns a copy with the default rule appended to `rules`

---

## Prompt Injection Strategy

### Path 1: LLM skill handler

Use effective memory context before formatting the prompt.

Target file:

- [`packages/franken-orchestrator/src/skills/llm-skill-handler.ts`](/home/pfk/dev/frankenbeast/packages/franken-orchestrator/src/skills/llm-skill-handler.ts)

Expected result:

- `Rules:` section always includes the rule unless memory already covers it

### Path 2: Execution dispatch

Build effective memory context once when constructing `SkillInput`.

Target file:

- [`packages/franken-orchestrator/src/phases/execution.ts`](/home/pfk/dev/frankenbeast/packages/franken-orchestrator/src/phases/execution.ts)

Reason:

- downstream skills then inherit the same normalized context
- reduces the chance of one skill path forgetting the rule

### Path 3: CLI adapter

The current `CliLlmAdapter.transformRequest()` drops everything except the last user message.

That is too thin for durable behavioral instructions.

This path should be updated to:

- preserve injected system/rule content if present in the request shape
- or explicitly prepend the default rule block before the user prompt when the adapter is used in Frankenbeast-owned flows

Target file:

- [`packages/franken-orchestrator/src/adapters/cli-llm-adapter.ts`](/home/pfk/dev/frankenbeast/packages/franken-orchestrator/src/adapters/cli-llm-adapter.ts)

### Path 4: CLI chunk execution / MartinLoop

Chunk and CLI execution should also receive the same behavioral rule, not only hard safety guardrails.

Recommended approach:

- keep safety constraints in `CHUNK_GUARDRAILS`
- add a separate “behavioral defaults” block
- compose the final prompt from:
  - safety guardrails
  - behavioral default rule if absent from memory
  - task objective and existing context

Target files:

- [`packages/franken-orchestrator/src/planning/chunk-guardrails.ts`](/home/pfk/dev/frankenbeast/packages/franken-orchestrator/src/planning/chunk-guardrails.ts)
- [`packages/franken-orchestrator/src/skills/martin-loop.ts`](/home/pfk/dev/frankenbeast/packages/franken-orchestrator/src/skills/martin-loop.ts)

---

## Memory Policy

Frankenbeast should distinguish between:

- persisted memory
- effective prompt-time defaults

### v1 recommendation

Do not auto-write this rule into project memory.

Instead:

- treat it as a built-in default
- inject it only when memory does not already contain an equivalent user/team rule

Why:

- avoids silently changing user memory stores
- preserves a clean separation between remembered project knowledge and Frankenbeast runtime defaults

### possible v2 extension

If the system later supports explicit preference capture or user-confirmed rule persistence, this rule could be promoted into durable memory through a governed write path.

That is out of scope for this change.

---

## Matching Rules For “Already In Memory”

Initial matching heuristic should be conservative but useful.

A rule counts as already present if a normalized memory rule contains enough of:

- `mistake` or `error`
- `pattern`, `repeat`, or `repeating`
- `anti-pattern`, `don’t do that again`, or `avoid repeating`

Normalization should include:

- lowercase
- trim
- collapse internal whitespace
- ignore punctuation differences where practical

Do not use fuzzy NLP matching in v1. Keep it deterministic and testable.

---

## Integration Plan

## Phase 1: Canonical Rule and Matcher

Deliverables:

- default error-awareness rule constant
- deterministic equivalence matcher
- helper to build effective memory context

Tests:

- exact match returns true
- paraphrased equivalent memory rule returns true
- unrelated rule returns false
- helper appends rule only when absent

## Phase 2: Wire Effective Context Into Execution

Deliverables:

- execution path uses effective memory context before skill dispatch
- LLM skill handler consumes effective rules

Tests:

- empty memory gets injected rule
- existing equivalent rule is not duplicated
- `SkillInput.context.rules` contains exactly one effective rule copy

## Phase 3: Wire CLI Prompt Paths

Deliverables:

- CLI adapter preserves or prepends the rule
- MartinLoop/chunk prompts include the rule consistently
- behavioral defaults are separate from hard safety guardrails

Tests:

- CLI adapter prompt contains the rule when absent from memory
- CLI adapter prompt does not duplicate the rule
- chunk prompt contains both safety guardrails and behavioral default

## Phase 4: Auditability and Observability

Deliverables:

- add debug or audit metadata indicating whether the rule was injected or sourced from memory

Examples:

- `memory:error-awareness:injected-default`
- `memory:error-awareness:already-present`

Tests:

- audit trail reflects injection decision
- logs remain deterministic and do not leak prompt internals unnecessarily

## Phase 5: Hardening

Deliverables:

- centralize all prompt-time default rules in one module
- prevent future drift between LLM and CLI paths

Tests:

- snapshot or contract tests for major prompt builders
- regression test covering all known LLM-facing execution paths

---

## Suggested File Changes

Likely files:

- create [`packages/franken-orchestrator/src/prompting/default-rules.ts`](/home/pfk/dev/frankenbeast/packages/franken-orchestrator/src/prompting/default-rules.ts)
- create [`packages/franken-orchestrator/src/prompting/effective-memory-context.ts`](/home/pfk/dev/frankenbeast/packages/franken-orchestrator/src/prompting/effective-memory-context.ts)
- update [`packages/franken-orchestrator/src/phases/execution.ts`](/home/pfk/dev/frankenbeast/packages/franken-orchestrator/src/phases/execution.ts)
- update [`packages/franken-orchestrator/src/skills/llm-skill-handler.ts`](/home/pfk/dev/frankenbeast/packages/franken-orchestrator/src/skills/llm-skill-handler.ts)
- update [`packages/franken-orchestrator/src/adapters/cli-llm-adapter.ts`](/home/pfk/dev/frankenbeast/packages/franken-orchestrator/src/adapters/cli-llm-adapter.ts)
- update [`packages/franken-orchestrator/src/planning/chunk-guardrails.ts`](/home/pfk/dev/frankenbeast/packages/franken-orchestrator/src/planning/chunk-guardrails.ts)
- update [`packages/franken-orchestrator/src/skills/martin-loop.ts`](/home/pfk/dev/frankenbeast/packages/franken-orchestrator/src/skills/martin-loop.ts)

Likely tests:

- `tests/unit/prompting/default-rules.test.ts`
- `tests/unit/phases/execution.test.ts`
- `tests/unit/skills/llm-skill-handler.test.ts`
- `tests/unit/adapters/cli-llm-adapter.test.ts`
- `tests/unit/skills/cli-skill-executor.test.ts` or MartinLoop-related tests

---

## Open Questions

- should the default rule live only in `rules`, or also be surfaced in UI/debug views as a built-in runtime default
- should user-level persisted preferences later override project-level memory for this behavior
- should equivalent-rule matching be limited to `rules`, or also inspect `knownErrors` for legacy memory entries that encoded the same idea in the wrong bucket

Recommended v1 answer:

- inspect `rules` and `knownErrors` for equivalent phrasing during dedupe
- inject only into the effective `rules` output

That gives compatibility without muddying the canonical storage model.

---

## Exit Criteria

This effort is complete when:

- every LLM-facing Frankenbeast execution path receives the error-awareness rule by default
- equivalent memory entries suppress duplicate injection
- the rule is sourced from one canonical implementation point
- tests cover both injected and already-present cases
- audit/log output can explain whether the instruction came from memory or default injection

---

## First Milestone

The first milestone should be:

**"A task executed through Frankenbeast with empty memory still tells the LLM to note mistakes and avoid repeating patternistic errors, while a task with an equivalent remembered rule does not get a duplicate copy."**

That is the minimum useful behavior for this change.
