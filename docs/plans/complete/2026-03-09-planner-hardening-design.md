# Planner Hardening — Design Document

**Date:** 2026-03-09
**Status:** Approved
**Scope:** franken-orchestrator planning pipeline

## Problem

The `LlmGraphBuilder` produces thin, outline-level chunks that lack the detail needed for autonomous execution. The current decomposition is a single LLM call that sees only the design doc text — no codebase awareness.

This causes:

- **Missing components** — the design doc assumes infrastructure that doesn't exist (e.g., a cheap LLM client, an HTTP framework dependency) and no chunk creates it
- **False dependency chains** — chunks are serialized linearly when many could run in parallel
- **Thin chunks** — chunks contain only objective, files, and a one-line success criteria. An autonomous agent executing them must guess at interfaces, edge cases, and design decisions
- **No validation** — the only checks are structural (required fields present, no cycles). There is no quality validation of the decomposition itself

The chatbot implementation plan demonstrated all four problems: 12 chunks were produced that were outlines, not execution plans. Critical gaps (no cheap LLM client, no Hono dependency, no streaming infrastructure) went undetected. The dependency graph was fully linear when at least 3 pairs of chunks could have run concurrently.

## Goal

Harden the planner so that `LlmGraphBuilder` produces chunks as detailed as what an experienced engineer would write — with interface signatures, edge cases, design decisions, integration context, and anti-patterns. The quality bar is: an autonomous agent can execute the chunk without guessing.

## Approach

Replace the single-call decomposition with a multi-pass, codebase-aware pipeline:

```
design doc → context gathering → decomposition → validation → (remediation) → chunk files → PlanGraph
```

Maximum 4 LLM calls (decompose + validate + remediate + re-validate). Typical case is 2 (decompose + validate). One remediation attempt maximum — no infinite loops.

---

## Expanded Chunk Schema

The `ChunkDefinition` interface grows from 6 fields to 10:

```ts
interface ChunkDefinition {
  // Existing (kept)
  id: string;
  objective: string;
  files: string[];
  successCriteria: string;
  verificationCommand: string;
  dependencies: string[];

  // New fields
  context: string;           // What the agent needs to know about existing code it will touch
  designDecisions: string;   // Key choices with rationale
  interfaceContract: string; // Public API this chunk exposes (TS signatures)
  edgeCases: string;         // Specific scenarios the implementation must handle
  antiPatterns: string;      // What NOT to do
}
```

The chunk markdown file format becomes:

```markdown
# Chunk NN: name

## Objective
## Files
## Context
## Design Decisions
## Interface Contract
## Edge Cases
## Success Criteria
## Anti-patterns
## Verification Command
## Dependencies
```

New fields are optional in Zod parsing — the LLM may omit `antiPatterns` on some chunks. That is validated as a warning, not an error.

Both `LlmGraphBuilder` (LLM-generated chunks) and `ChunkFileGraphBuilder` (hand-written chunks) use this format. `ChunkFileGraphBuilder` passes full `.md` content to the executing agent, so richer chunks produce richer prompts automatically.

The `buildImplPrompt()` and `buildHardenPrompt()` methods are expanded to include all 10 fields.

### Chunk ID Convention

The `id` field must start with an action verb describing what the chunk does:

- `define-chat-types-and-config`
- `implement-intent-router`
- `add-streaming-infrastructure`
- `wire-hono-dependency`

Use kebab-case. The id must be suitable for git branch names. The `ChunkFileWriter` prepends a zero-padded sequence number based on topological order: `01_define-chat-types-and-config.md`.

---

## Context Gathering

A new `PlanContextGatherer` collects codebase context before decomposition. No LLM calls — filesystem only.

### What it collects

1. **RAMP_UP.md** — the concise onboarding doc (~5000 tokens by convention)
2. **Relevant file signatures** — for files/directories mentioned in the design doc, extract public exports, interface definitions, and type signatures. Not full file contents — just API surface. Uses a heuristic: grep the design doc for paths matching `src/`, `packages/`, etc., then read those files and extract exported signatures.
3. **Package.json dependencies** — for the target package(s), what's already installed vs. what would need to be added
4. **Existing patterns** — if the design doc mentions creating something similar to what already exists (e.g., "add an HTTP server" when other packages already have Hono servers), include a representative example of how the existing one is structured

### What it does NOT collect

- Full file contents (too many tokens)
- Test files
- Build config / CI config
- Unrelated packages

### Interface

```ts
interface PlanContext {
  rampUp: string;
  relevantSignatures: Array<{ path: string; signatures: string }>;
  packageDeps: Record<string, string[]>;
  existingPatterns: Array<{ description: string; example: string }>;
}

class PlanContextGatherer {
  constructor(private readonly repoRoot: string);
  async gather(designDoc: string): Promise<PlanContext>;
}
```

### Token budget

The gathered context should stay under ~8000 tokens total. If it exceeds that, signatures are truncated by relevance (files explicitly mentioned in the design doc rank higher than inferred ones).

---

## Multi-Pass Pipeline

### Pass 1: Decomposition

`ChunkDecomposer` takes the design doc + `PlanContext` and produces `ChunkDefinition[]`.

The prompt instructs the LLM to:

- Produce chunks with all 10 fields
- Use codebase context to identify missing components (things the design assumes but don't exist)
- Identify which chunks can run in parallel (shared dependencies only, no false serialization)
- Flag when the design doc requires adding new dependencies to `package.json`
- Include concrete TypeScript signatures in `interfaceContract`
- Include anti-patterns based on existing codebase conventions

### Pass 2: Validation

`ChunkValidator` takes the `ChunkDefinition[]` + design doc + `PlanContext` and returns a `ValidationResult`:

```ts
interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  revisedChunks?: ChunkDefinition[];
}

interface ValidationIssue {
  severity: 'error' | 'warning';
  chunkId: string | null;  // null = plan-level issue
  category: 'missing_component' | 'wrong_dependency' | 'parallelizable'
          | 'missing_interface' | 'design_gap' | 'chunk_too_large' | 'chunk_too_thin';
  description: string;
  suggestion: string;
}
```

The validation prompt checks for:

- **Missing components** — design doc assumes something that doesn't exist in the codebase and no chunk creates it
- **Wrong dependencies** — chunk A depends on chunk B but doesn't actually need B's output
- **Parallelization opportunities** — chunks that are falsely serialized
- **Missing interfaces** — `interfaceContract` is empty or vague
- **Design gaps** — the design doc says "use X" but X isn't a dependency and no chunk adds it
- **Chunk sizing** — chunks that are too large (more than ~8 files) or too thin (missing fields)

If the validator finds auto-fixable issues (like parallelization or missing dependency additions), it returns `revisedChunks`. If it finds blocking errors (like a missing component that no chunk addresses), it returns `valid: false`.

### Pass 3: Remediation (conditional)

`ChunkRemediator` takes the original chunks + `ValidationIssue[]` + `PlanContext` and produces a corrected `ChunkDefinition[]`.

It patches the existing chunks — it does NOT re-decompose from scratch.

### Pass 4: Re-validation (conditional)

The corrected chunks go through `ChunkValidator` one more time. If errors remain, they are attached as warnings to the relevant chunk files and surfaced in the existing HITM review loop. The pipeline does not loop back.

### Flow diagram

```
design doc + context
    → decompose (pass 1)
    → validate (pass 2)
    → if valid: done
    → if errors: remediate (pass 3) → validate again (pass 4) → done
    → if still errors: attach issues to chunks, surface in HITM review
    → done
```

Maximum 4 LLM calls total. Typical case is 2. Never more than 4.

### Pipeline orchestration

```ts
class LlmGraphBuilder implements GraphBuilder {
  constructor(
    private readonly llm: ILlmClient,
    private readonly contextGatherer: PlanContextGatherer,
    private readonly options?: { maxChunks?: number; skipValidation?: boolean },
  );

  async build(intent: PlanIntent): Promise<PlanGraph> {
    const context = await this.contextGatherer.gather(intent.goal);
    const chunks = await this.decompose(intent.goal, context);

    if (!this.options?.skipValidation) {
      const validation = await this.validate(chunks, intent.goal, context);
      // use revisedChunks if available, otherwise original
      // if still invalid after remediation, attach warnings
    }

    return this.buildGraph(finalChunks);
  }
}
```

The `skipValidation` option exists for testing and for cases where the user wants raw speed over quality.

---

## Chunk File Writer

`ChunkFileWriter` centralizes the writing of chunk `.md` files to disk, replacing inline logic in `session.ts`.

```ts
class ChunkFileWriter {
  constructor(private readonly outputDir: string);
  write(chunks: ChunkDefinition[], validationIssues?: ValidationIssue[]): string[];
  // Returns the file paths written
}
```

Writes numbered files using topological order: `01_define-chat-types-and-config.md`, `02_implement-intent-router.md`, etc.

If there are unresolved validation warnings, they are appended as a `## Warnings` section at the bottom of the relevant chunk file so the HITM reviewer and the executing agent both see them.

---

## Integration with Existing Pipeline

### What changes

1. **`LlmGraphBuilder` constructor** gains a `PlanContextGatherer` parameter. `session.ts` / `dep-factory.ts` passes the repo root.
2. **`session.ts` plan phase** — uses `ChunkFileWriter` instead of inline chunk-writing logic. The HITM review loop still works — it just sees richer chunks.
3. **Impl/harden prompts** — `buildImplPrompt()` and `buildHardenPrompt()` include all 10 fields instead of just objective + files + success criteria.
4. **`dep-factory.ts`** — passes `repoRoot` to `LlmGraphBuilder` constructor.

### What doesn't change

- `BeastLoop` — untouched
- `CliSkillExecutor` / `MartinLoop` — untouched
- `ChunkFileGraphBuilder` — untouched (benefits passively from richer chunk files)
- `InterviewLoop` — untouched (produces design doc and delegates to `LlmGraphBuilder`)
- HITM review flow in `session.ts` — still works, just sees richer chunks
- `GraphBuilder` interface — still `build(intent): Promise<PlanGraph>`

### Backwards compatibility

- `skipValidation: true` gives the old fast behavior
- Old-format chunk files (6 fields) still work with `ChunkFileGraphBuilder` since it doesn't parse fields
- New `ChunkDefinition` fields are optional in Zod parsing

---

## File Layout

### New files

```
packages/franken-orchestrator/src/planning/
  plan-context-gatherer.ts    # Collects RAMP_UP, signatures, deps, patterns
  chunk-decomposer.ts         # Pass 1: design doc + context → ChunkDefinition[]
  chunk-validator.ts           # Pass 2: validates chunks, finds gaps
  chunk-remediator.ts          # Pass 3 (conditional): patches chunks from issues
  chunk-file-writer.ts         # Writes 10-field .md chunk files to disk
```

### Modified files

```
packages/franken-orchestrator/src/planning/
  llm-graph-builder.ts        # Orchestrates the multi-pass pipeline
  chunk-file-graph-builder.ts  # Updated ChunkDefinition type (shared)

packages/franken-orchestrator/src/cli/
  session.ts                   # Uses ChunkFileWriter instead of inline writing
  dep-factory.ts               # Passes repoRoot to LlmGraphBuilder constructor
```

### Component responsibilities

| Component | Input | Output | LLM calls |
|-----------|-------|--------|-----------|
| `PlanContextGatherer` | design doc + repo root | `PlanContext` | 0 (filesystem only) |
| `ChunkDecomposer` | design doc + `PlanContext` | `ChunkDefinition[]` | 1 |
| `ChunkValidator` | chunks + design doc + `PlanContext` | `ValidationResult` | 1 |
| `ChunkRemediator` | chunks + `ValidationIssue[]` + `PlanContext` | `ChunkDefinition[]` | 1 (conditional) |
| `ChunkFileWriter` | chunks + optional warnings | `.md` files on disk | 0 |
| `LlmGraphBuilder` | `PlanIntent` | `PlanGraph` | 2-4 total |

---

## What This Design Does NOT Cover

- No new packages or dependencies added to franken-orchestrator
- No changes to `BeastLoop`, `MartinLoop`, `CliSkillExecutor`
- No HTTP or streaming infrastructure (that belongs to the chatbot plan)
- No changes to `InterviewLoop` or `GraphBuilder` interface
- No ADR creation for the chatbot plan (separate concern)
