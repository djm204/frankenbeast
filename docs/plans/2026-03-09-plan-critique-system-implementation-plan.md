# Plan Critique System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the structural-only chunk-validator/chunk-remediator with a pluggable plan critique system that evaluates both structural correctness and qualitative depth.

**Architecture:** `IPlanEvaluator` interface in `franken-types` with hybrid local+LLM evaluation. `PlanCritiqueRunner` in `franken-orchestrator` orchestrates 6 evaluators with smart-batching and iterative remediation (max 2 iterations). Replaces `ChunkValidator` + `ChunkRemediator`.

**Tech Stack:** TypeScript (ES2022, strict, ESM), Vitest, `@franken/types` for shared interfaces, `ILlmClient` for LLM calls

**Design Doc:** `docs/plans/2026-03-09-plan-critique-system-design.md`

---

### Task 1: Move ChunkDefinition to franken-types

**Files:**
- Create: `packages/franken-types/src/chunk.ts`
- Modify: `packages/franken-types/src/index.ts`
- Modify: `packages/franken-orchestrator/src/cli/file-writer.ts`
- Modify: `packages/franken-orchestrator/src/planning/chunk-decomposer.ts`
- Modify: `packages/franken-orchestrator/src/planning/chunk-validator.ts`
- Modify: `packages/franken-orchestrator/src/planning/chunk-remediator.ts`
- Modify: `packages/franken-orchestrator/src/planning/chunk-file-writer.ts`
- Modify: `packages/franken-orchestrator/src/planning/llm-graph-builder.ts`
- Modify: `packages/franken-orchestrator/src/cli/session.ts`
- Modify: `packages/franken-orchestrator/src/issues/issue-graph-builder.ts`

**Step 1: Create the chunk type file in franken-types**

```typescript
// packages/franken-types/src/chunk.ts

/**
 * Defines the shape of a single implementation chunk produced by
 * the planning pipeline. Used by evaluators, file writers, and
 * graph builders.
 */
export interface ChunkDefinition {
  id: string;
  objective: string;
  files: string[];
  successCriteria: string;
  verificationCommand: string;
  dependencies: string[];
  context?: string;
  designDecisions?: string;
  interfaceContract?: string;
  edgeCases?: string;
  antiPatterns?: string;
}
```

**Step 2: Export ChunkDefinition from franken-types index**

Add to `packages/franken-types/src/index.ts`:

```typescript
// Chunk definitions
export type { ChunkDefinition } from './chunk.js';
```

**Step 3: Build franken-types to verify**

Run: `npx turbo run build --filter=franken-types`
Expected: BUILD SUCCESS

**Step 4: Update all orchestrator imports**

In every file that currently imports `ChunkDefinition` from `../cli/file-writer.js` or `./file-writer.js`, change the import to:

```typescript
import type { ChunkDefinition } from '@franken/types';
```

Files to update (8 files):
- `packages/franken-orchestrator/src/cli/file-writer.ts` — remove the interface definition, add import from `@franken/types`
- `packages/franken-orchestrator/src/cli/session.ts` — change import source
- `packages/franken-orchestrator/src/planning/chunk-decomposer.ts` — change import source
- `packages/franken-orchestrator/src/planning/chunk-validator.ts` — change import source
- `packages/franken-orchestrator/src/planning/chunk-remediator.ts` — change import source
- `packages/franken-orchestrator/src/planning/chunk-file-writer.ts` — change import source
- `packages/franken-orchestrator/src/planning/llm-graph-builder.ts` — change import source
- `packages/franken-orchestrator/src/issues/issue-graph-builder.ts` — change import source

**Step 5: Build and test the full monorepo**

Run: `npm run build && npm test`
Expected: All builds pass. All existing tests pass — no behavior change, only import paths moved.

**Step 6: Commit**

```bash
git add packages/franken-types/src/chunk.ts packages/franken-types/src/index.ts \
  packages/franken-orchestrator/src/cli/file-writer.ts \
  packages/franken-orchestrator/src/cli/session.ts \
  packages/franken-orchestrator/src/planning/chunk-decomposer.ts \
  packages/franken-orchestrator/src/planning/chunk-validator.ts \
  packages/franken-orchestrator/src/planning/chunk-remediator.ts \
  packages/franken-orchestrator/src/planning/chunk-file-writer.ts \
  packages/franken-orchestrator/src/planning/llm-graph-builder.ts \
  packages/franken-orchestrator/src/issues/issue-graph-builder.ts
git commit -m "refactor(franken-types): move ChunkDefinition to shared types package"
```

---

### Task 2: Define IPlanEvaluator interface and critique types in franken-types

**Files:**
- Create: `packages/franken-types/src/plan-evaluator.ts`
- Modify: `packages/franken-types/src/index.ts`
- Test: `packages/franken-types/tests/plan-evaluator.test.ts` (type-level tests)

**Step 1: Write the type-level test**

```typescript
// packages/franken-types/tests/plan-evaluator.test.ts
import { describe, it, expectTypeOf } from 'vitest';
import type {
  IPlanEvaluator,
  PlanCritiqueIssue,
  PlanEvaluationResult,
  PlanEvaluationContext,
  PlanIssueSeverity,
  ChunkDefinition,
} from '../src/index.js';

describe('IPlanEvaluator types', () => {
  it('PlanIssueSeverity is error or warning', () => {
    expectTypeOf<PlanIssueSeverity>().toEqualTypeOf<'error' | 'warning'>();
  });

  it('PlanCritiqueIssue has required fields', () => {
    expectTypeOf<PlanCritiqueIssue>().toHaveProperty('evaluator');
    expectTypeOf<PlanCritiqueIssue>().toHaveProperty('severity');
    expectTypeOf<PlanCritiqueIssue>().toHaveProperty('chunkId');
    expectTypeOf<PlanCritiqueIssue>().toHaveProperty('category');
    expectTypeOf<PlanCritiqueIssue>().toHaveProperty('description');
    expectTypeOf<PlanCritiqueIssue>().toHaveProperty('suggestion');
  });

  it('PlanEvaluationResult has issues and optional revisedChunks', () => {
    expectTypeOf<PlanEvaluationResult>().toHaveProperty('issues');
    const result: PlanEvaluationResult = { issues: [] };
    expectTypeOf(result.revisedChunks).toEqualTypeOf<ChunkDefinition[] | undefined>();
  });

  it('PlanEvaluationContext contains chunks and design context', () => {
    expectTypeOf<PlanEvaluationContext>().toHaveProperty('chunks');
    expectTypeOf<PlanEvaluationContext>().toHaveProperty('designDoc');
    expectTypeOf<PlanEvaluationContext>().toHaveProperty('rampUp');
    expectTypeOf<PlanEvaluationContext>().toHaveProperty('relevantSignatures');
    expectTypeOf<PlanEvaluationContext>().toHaveProperty('packageDeps');
  });

  it('IPlanEvaluator has name, evaluateLocal, buildPromptSection, parseResponse', () => {
    expectTypeOf<IPlanEvaluator>().toHaveProperty('name');
    expectTypeOf<IPlanEvaluator>().toHaveProperty('evaluateLocal');
    expectTypeOf<IPlanEvaluator>().toHaveProperty('buildPromptSection');
    expectTypeOf<IPlanEvaluator>().toHaveProperty('parseResponse');
  });

  it('evaluateLocal returns PlanCritiqueIssue[]', () => {
    type EvalLocalReturn = ReturnType<IPlanEvaluator['evaluateLocal']>;
    expectTypeOf<EvalLocalReturn>().toEqualTypeOf<PlanCritiqueIssue[]>();
  });

  it('buildPromptSection returns string | null', () => {
    type BuildReturn = ReturnType<IPlanEvaluator['buildPromptSection']>;
    expectTypeOf<BuildReturn>().toEqualTypeOf<string | null>();
  });

  it('parseResponse returns PlanEvaluationResult', () => {
    type ParseReturn = ReturnType<IPlanEvaluator['parseResponse']>;
    expectTypeOf<ParseReturn>().toEqualTypeOf<PlanEvaluationResult>();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx turbo run test --filter=franken-types`
Expected: FAIL — `plan-evaluator.ts` does not exist yet

**Step 3: Write the interface definitions**

```typescript
// packages/franken-types/src/plan-evaluator.ts

import type { ChunkDefinition } from './chunk.js';

/** Severity of a plan critique issue */
export type PlanIssueSeverity = 'error' | 'warning';

/** A single issue found by a plan evaluator */
export interface PlanCritiqueIssue {
  evaluator: string;
  severity: PlanIssueSeverity;
  chunkId: string | null;
  category: string;
  description: string;
  suggestion: string;
}

/** Result from a single evaluator */
export interface PlanEvaluationResult {
  issues: PlanCritiqueIssue[];
  revisedChunks?: ChunkDefinition[];
}

/** Input context for evaluators */
export interface PlanEvaluationContext {
  chunks: ChunkDefinition[];
  designDoc: string;
  rampUp: string;
  relevantSignatures: Array<{ path: string; signatures: string }>;
  packageDeps: Record<string, string[]>;
}

/** The core extension point — every evaluator implements this */
export interface IPlanEvaluator {
  readonly name: string;

  /** Deterministic local checks — no LLM, no cost. Return empty array if nothing to check locally. */
  evaluateLocal(ctx: PlanEvaluationContext): PlanCritiqueIssue[];

  /** Build prompt section for LLM-based evaluation. Return null to skip LLM pass. */
  buildPromptSection(ctx: PlanEvaluationContext): string | null;

  /** Parse this evaluator's section from the batched LLM response. */
  parseResponse(section: string): PlanEvaluationResult;
}
```

**Step 4: Export from index**

Add to `packages/franken-types/src/index.ts`:

```typescript
// Plan evaluator
export type {
  IPlanEvaluator,
  PlanCritiqueIssue,
  PlanEvaluationResult,
  PlanEvaluationContext,
  PlanIssueSeverity,
} from './plan-evaluator.js';
```

**Step 5: Run tests to verify they pass**

Run: `npx turbo run test --filter=franken-types && npx turbo run build --filter=franken-types`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/franken-types/src/plan-evaluator.ts packages/franken-types/src/index.ts \
  packages/franken-types/tests/plan-evaluator.test.ts
git commit -m "feat(franken-types): add IPlanEvaluator interface and plan critique types"
```

---

### Task 3: Implement StructuralEvaluator

Replaces the structural checks from `ChunkValidator`. Local checks: missing fields, cycles, dangling deps, chunk_too_thin. LLM checks: missing_component, wrong_dependency, design_gap, parallelizable, missing_interface.

**Files:**
- Create: `packages/franken-orchestrator/src/planning/evaluators/structural-evaluator.ts`
- Test: `packages/franken-orchestrator/tests/unit/planning/evaluators/structural-evaluator.test.ts`

**Step 1: Write the failing tests**

```typescript
// packages/franken-orchestrator/tests/unit/planning/evaluators/structural-evaluator.test.ts
import { describe, it, expect } from 'vitest';
import { StructuralEvaluator } from '../../../../src/planning/evaluators/structural-evaluator.js';
import type { PlanEvaluationContext, ChunkDefinition } from '@franken/types';

function makeCtx(chunks: ChunkDefinition[], designDoc = 'A design doc'): PlanEvaluationContext {
  return {
    chunks,
    designDoc,
    rampUp: '',
    relevantSignatures: [],
    packageDeps: {},
  };
}

function validChunk(overrides: Partial<ChunkDefinition> & { id: string }): ChunkDefinition {
  return {
    objective: 'Do something',
    files: ['src/foo.ts'],
    successCriteria: 'Tests pass',
    verificationCommand: 'npx vitest run',
    dependencies: [],
    context: 'Some context',
    edgeCases: 'Some edge cases',
    interfaceContract: 'interface Foo {}',
    ...overrides,
  };
}

describe('StructuralEvaluator', () => {
  const evaluator = new StructuralEvaluator();

  it('has name "structural"', () => {
    expect(evaluator.name).toBe('structural');
  });

  describe('evaluateLocal', () => {
    it('returns empty array for valid chunks', () => {
      const ctx = makeCtx([
        validChunk({ id: 'a' }),
        validChunk({ id: 'b', dependencies: ['a'] }),
      ]);
      const issues = evaluator.evaluateLocal(ctx);
      expect(issues).toEqual([]);
    });

    it('detects cyclic dependencies', () => {
      const ctx = makeCtx([
        validChunk({ id: 'a', dependencies: ['b'] }),
        validChunk({ id: 'b', dependencies: ['a'] }),
      ]);
      const issues = evaluator.evaluateLocal(ctx);
      expect(issues.some((i) => i.category === 'cycle_detected')).toBe(true);
      expect(issues[0]!.severity).toBe('error');
      expect(issues[0]!.evaluator).toBe('structural');
    });

    it('detects dangling dependency references', () => {
      const ctx = makeCtx([
        validChunk({ id: 'a', dependencies: ['nonexistent'] }),
      ]);
      const issues = evaluator.evaluateLocal(ctx);
      expect(issues.some((i) => i.category === 'missing_field')).toBe(true);
    });

    it('detects chunk_too_thin — missing context/edgeCases/interfaceContract on multi-file chunks', () => {
      const thinChunk: ChunkDefinition = {
        id: 'thin',
        objective: 'Do stuff',
        files: ['a.ts', 'b.ts', 'c.ts', 'd.ts'],
        successCriteria: 'Tests pass',
        verificationCommand: 'npx vitest run',
        dependencies: [],
        // no context, no edgeCases, no interfaceContract
      };
      const ctx = makeCtx([thinChunk]);
      const issues = evaluator.evaluateLocal(ctx);
      expect(issues.some((i) => i.category === 'chunk_too_thin')).toBe(true);
      expect(issues[0]!.severity).toBe('warning');
    });

    it('does NOT flag thin chunks with few files', () => {
      const smallChunk: ChunkDefinition = {
        id: 'small',
        objective: 'Do stuff',
        files: ['a.ts'],
        successCriteria: 'Tests pass',
        verificationCommand: 'npx vitest run',
        dependencies: [],
      };
      const ctx = makeCtx([smallChunk]);
      const issues = evaluator.evaluateLocal(ctx);
      expect(issues.filter((i) => i.category === 'chunk_too_thin')).toHaveLength(0);
    });
  });

  describe('buildPromptSection', () => {
    it('returns a non-null prompt string', () => {
      const ctx = makeCtx([validChunk({ id: 'a' })]);
      const prompt = evaluator.buildPromptSection(ctx);
      expect(prompt).not.toBeNull();
      expect(prompt).toContain('missing_component');
      expect(prompt).toContain('wrong_dependency');
      expect(prompt).toContain('parallelizable');
    });
  });

  describe('parseResponse', () => {
    it('parses valid JSON issues array', () => {
      const json = JSON.stringify({
        issues: [
          {
            severity: 'error',
            chunkId: 'a',
            category: 'missing_component',
            description: 'Missing X',
            suggestion: 'Add X',
          },
        ],
      });
      const result = evaluator.parseResponse(json);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]!.evaluator).toBe('structural');
      expect(result.issues[0]!.category).toBe('missing_component');
    });

    it('returns empty issues on parse failure', () => {
      const result = evaluator.parseResponse('not json');
      expect(result.issues).toEqual([]);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/planning/evaluators/structural-evaluator.test.ts` (from orchestrator dir)
Expected: FAIL — module not found

**Step 3: Implement StructuralEvaluator**

```typescript
// packages/franken-orchestrator/src/planning/evaluators/structural-evaluator.ts
import type {
  IPlanEvaluator,
  PlanEvaluationContext,
  PlanEvaluationResult,
  PlanCritiqueIssue,
} from '@franken/types';

export class StructuralEvaluator implements IPlanEvaluator {
  readonly name = 'structural';

  evaluateLocal(ctx: PlanEvaluationContext): PlanCritiqueIssue[] {
    const issues: PlanCritiqueIssue[] = [];
    const ids = new Set(ctx.chunks.map((c) => c.id));

    // Dangling dependency references
    for (const chunk of ctx.chunks) {
      for (const dep of chunk.dependencies) {
        if (!ids.has(dep)) {
          issues.push({
            evaluator: this.name,
            severity: 'error',
            chunkId: chunk.id,
            category: 'missing_field',
            description: `Dependency '${dep}' does not exist in the chunk list`,
            suggestion: `Remove '${dep}' from dependencies or add a chunk with that ID`,
          });
        }
      }
    }

    // Cycle detection via DFS
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const adj = new Map<string, string[]>();
    for (const c of ctx.chunks) adj.set(c.id, c.dependencies);

    const dfs = (id: string): boolean => {
      if (inStack.has(id)) return true;
      if (visited.has(id)) return false;
      inStack.add(id);
      for (const dep of adj.get(id) ?? []) {
        if (dfs(dep)) {
          issues.push({
            evaluator: this.name,
            severity: 'error',
            chunkId: id,
            category: 'cycle_detected',
            description: `Cyclic dependency detected involving chunk '${id}'`,
            suggestion: 'Remove or reorder dependencies to break the cycle',
          });
          return true;
        }
      }
      inStack.delete(id);
      visited.add(id);
      return false;
    };

    for (const c of ctx.chunks) dfs(c.id);

    // chunk_too_thin: missing context/edgeCases/interfaceContract on chunks with >3 files
    for (const chunk of ctx.chunks) {
      if (chunk.files.length > 3 && !chunk.context && !chunk.edgeCases && !chunk.interfaceContract) {
        issues.push({
          evaluator: this.name,
          severity: 'warning',
          chunkId: chunk.id,
          category: 'chunk_too_thin',
          description: `Chunk touches ${chunk.files.length} files but has no context, edgeCases, or interfaceContract`,
          suggestion: 'Add context, edge cases, or interface contract to guide implementation',
        });
      }
    }

    return issues;
  }

  buildPromptSection(ctx: PlanEvaluationContext): string | null {
    return [
      'Check the chunks for these structural issues:',
      '- **missing_component**: design doc assumes something no chunk creates',
      '- **wrong_dependency**: chunk A depends on B but does not need B\'s output',
      '- **parallelizable**: chunks are falsely serialized and could run in parallel',
      '- **missing_interface**: interfaceContract is empty/vague for an API-boundary chunk',
      '- **design_gap**: design doc says "use X" but X is not available and no chunk adds it',
      '',
      'Return a JSON object: { "issues": [{ "severity": "error"|"warning", "chunkId": string|null, "category": string, "description": string, "suggestion": string }] }',
    ].join('\n');
  }

  parseResponse(section: string): PlanEvaluationResult {
    try {
      const parsed = JSON.parse(section) as { issues?: unknown[] };
      const rawIssues = Array.isArray(parsed.issues) ? parsed.issues : [];
      const issues: PlanCritiqueIssue[] = rawIssues.map((i: any) => ({
        evaluator: this.name,
        severity: i.severity ?? 'warning',
        chunkId: i.chunkId ?? null,
        category: i.category ?? 'design_gap',
        description: i.description ?? '',
        suggestion: i.suggestion ?? '',
      }));
      return { issues };
    } catch {
      return { issues: [] };
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/planning/evaluators/structural-evaluator.test.ts` (from orchestrator dir)
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/planning/evaluators/structural-evaluator.ts \
  packages/franken-orchestrator/tests/unit/planning/evaluators/structural-evaluator.test.ts
git commit -m "feat(franken-orchestrator): add StructuralEvaluator implementing IPlanEvaluator"
```

---

### Task 4: Implement RepetitionEvaluator

Detects formulaic chunks via local heuristics (Jaccard similarity, file path patterns, shared verification commands) and LLM confirmation.

**Files:**
- Create: `packages/franken-orchestrator/src/planning/evaluators/repetition-evaluator.ts`
- Test: `packages/franken-orchestrator/tests/unit/planning/evaluators/repetition-evaluator.test.ts`

**Step 1: Write the failing tests**

```typescript
// packages/franken-orchestrator/tests/unit/planning/evaluators/repetition-evaluator.test.ts
import { describe, it, expect } from 'vitest';
import { RepetitionEvaluator } from '../../../../src/planning/evaluators/repetition-evaluator.js';
import type { PlanEvaluationContext, ChunkDefinition } from '@franken/types';

function makeCtx(chunks: ChunkDefinition[]): PlanEvaluationContext {
  return { chunks, designDoc: 'design', rampUp: '', relevantSignatures: [], packageDeps: {} };
}

describe('RepetitionEvaluator', () => {
  const evaluator = new RepetitionEvaluator();

  it('has name "repetition"', () => {
    expect(evaluator.name).toBe('repetition');
  });

  describe('evaluateLocal', () => {
    it('returns empty for diverse chunks', () => {
      const ctx = makeCtx([
        { id: 'define-types', objective: 'Define shared type interfaces', files: ['src/types.ts'], successCriteria: 'OK', verificationCommand: 'npx tsc', dependencies: [] },
        { id: 'implement-router', objective: 'Build HTTP routing layer with middleware', files: ['src/router.ts'], successCriteria: 'OK', verificationCommand: 'npx vitest run', dependencies: [] },
      ]);
      expect(evaluator.evaluateLocal(ctx)).toEqual([]);
    });

    it('flags chunks with high objective similarity', () => {
      const ctx = makeCtx([
        { id: 'impl-slack-adapter', objective: 'Implement Slack webhook adapter with signature verification and message normalization', files: ['src/adapters/slack.ts'], successCriteria: 'OK', verificationCommand: 'npx vitest run', dependencies: [] },
        { id: 'impl-discord-adapter', objective: 'Implement Discord webhook adapter with signature verification and message normalization', files: ['src/adapters/discord.ts'], successCriteria: 'OK', verificationCommand: 'npx vitest run', dependencies: [] },
        { id: 'impl-telegram-adapter', objective: 'Implement Telegram webhook adapter with signature verification and message normalization', files: ['src/adapters/telegram.ts'], successCriteria: 'OK', verificationCommand: 'npx vitest run', dependencies: [] },
      ]);
      const issues = evaluator.evaluateLocal(ctx);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0]!.category).toBe('formulaic_chunks');
      expect(issues[0]!.evaluator).toBe('repetition');
    });

    it('flags 3+ chunks sharing the same verificationCommand', () => {
      const ctx = makeCtx([
        { id: 'a', objective: 'Unique A', files: ['a.ts'], successCriteria: 'OK', verificationCommand: 'npx vitest run tests/adapters/', dependencies: [] },
        { id: 'b', objective: 'Unique B', files: ['b.ts'], successCriteria: 'OK', verificationCommand: 'npx vitest run tests/adapters/', dependencies: [] },
        { id: 'c', objective: 'Unique C', files: ['c.ts'], successCriteria: 'OK', verificationCommand: 'npx vitest run tests/adapters/', dependencies: [] },
      ]);
      const issues = evaluator.evaluateLocal(ctx);
      expect(issues.some((i) => i.category === 'formulaic_chunks')).toBe(true);
    });

    it('flags chunks whose files follow the same directory pattern', () => {
      const ctx = makeCtx([
        { id: 'a', objective: 'Implement A adapter', files: ['src/adapters/a.ts', 'tests/adapters/a.test.ts'], successCriteria: 'OK', verificationCommand: 'npx vitest run a', dependencies: [] },
        { id: 'b', objective: 'Implement B adapter', files: ['src/adapters/b.ts', 'tests/adapters/b.test.ts'], successCriteria: 'OK', verificationCommand: 'npx vitest run b', dependencies: [] },
        { id: 'c', objective: 'Implement C adapter', files: ['src/adapters/c.ts', 'tests/adapters/c.test.ts'], successCriteria: 'OK', verificationCommand: 'npx vitest run c', dependencies: [] },
      ]);
      const issues = evaluator.evaluateLocal(ctx);
      expect(issues.some((i) => i.category === 'formulaic_chunks')).toBe(true);
    });
  });

  describe('buildPromptSection', () => {
    it('returns prompt when local issues found formulaic chunks', () => {
      const ctx = makeCtx([
        { id: 'a', objective: 'Implement Slack adapter', files: ['src/adapters/slack.ts'], successCriteria: 'OK', verificationCommand: 'npx vitest run', dependencies: [] },
        { id: 'b', objective: 'Implement Discord adapter', files: ['src/adapters/discord.ts'], successCriteria: 'OK', verificationCommand: 'npx vitest run', dependencies: [] },
        { id: 'c', objective: 'Implement Telegram adapter', files: ['src/adapters/telegram.ts'], successCriteria: 'OK', verificationCommand: 'npx vitest run', dependencies: [] },
      ]);
      const prompt = evaluator.buildPromptSection(ctx);
      expect(prompt).not.toBeNull();
      expect(prompt).toContain('consolidat');
    });

    it('returns null when no repetition detected locally', () => {
      const ctx = makeCtx([
        { id: 'types', objective: 'Define types', files: ['src/types.ts'], successCriteria: 'OK', verificationCommand: 'npx tsc', dependencies: [] },
        { id: 'router', objective: 'Build HTTP router', files: ['src/router.ts'], successCriteria: 'OK', verificationCommand: 'npx vitest run', dependencies: [] },
      ]);
      const prompt = evaluator.buildPromptSection(ctx);
      expect(prompt).toBeNull();
    });
  });

  describe('parseResponse', () => {
    it('parses consolidation recommendations', () => {
      const json = JSON.stringify({
        issues: [{ severity: 'warning', chunkId: null, category: 'consolidation_recommended', description: 'Merge adapters', suggestion: 'Use template' }],
      });
      const result = evaluator.parseResponse(json);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]!.evaluator).toBe('repetition');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/planning/evaluators/repetition-evaluator.test.ts` (from orchestrator dir)
Expected: FAIL

**Step 3: Implement RepetitionEvaluator**

Implement `RepetitionEvaluator` with:
- `evaluateLocal`: Jaccard similarity on word tokens of objectives (threshold 0.6), file path directory pattern detection (3+ chunks in same dir), shared verificationCommand detection (3+)
- `buildPromptSection`: returns prompt only if local heuristics flagged candidates, null otherwise
- `parseResponse`: standard JSON parsing with evaluator name injection

Key implementation details for Jaccard:
```typescript
private jaccard(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/planning/evaluators/repetition-evaluator.test.ts` (from orchestrator dir)
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/planning/evaluators/repetition-evaluator.ts \
  packages/franken-orchestrator/tests/unit/planning/evaluators/repetition-evaluator.test.ts
git commit -m "feat(franken-orchestrator): add RepetitionEvaluator with Jaccard similarity heuristics"
```

---

### Task 5: Implement CompletenessEvaluator

Checks for missing plan-level concerns: hardening, error recovery, observability, security, migration.

**Files:**
- Create: `packages/franken-orchestrator/src/planning/evaluators/completeness-evaluator.ts`
- Test: `packages/franken-orchestrator/tests/unit/planning/evaluators/completeness-evaluator.test.ts`

**Step 1: Write the failing tests**

Test local detection for missing hardening/E2E chunk and missing error recovery mentions. Test that buildPromptSection always returns a prompt (completeness is primarily LLM-driven). Test parseResponse parsing.

Key test cases:
- No chunk with "e2e"/"harden"/"integration" → flags `missing_hardening`
- No chunk mentioning "error"/"recovery"/"retry" → flags `missing_error_recovery`
- Plan with hardening chunk → no local issues
- `buildPromptSection` always returns non-null
- `parseResponse` handles valid JSON and parse failures

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/planning/evaluators/completeness-evaluator.test.ts` (from orchestrator dir)
Expected: FAIL

**Step 3: Implement CompletenessEvaluator**

`evaluateLocal`: scan chunk IDs and objectives for keywords. `buildPromptSection`: always returns prompt asking LLM to check for missing hardening, error recovery, observability, security, migration. `parseResponse`: standard JSON parsing.

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/planning/evaluators/completeness-evaluator.test.ts` (from orchestrator dir)
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/planning/evaluators/completeness-evaluator.ts \
  packages/franken-orchestrator/tests/unit/planning/evaluators/completeness-evaluator.test.ts
git commit -m "feat(franken-orchestrator): add CompletenessEvaluator for plan-level gap detection"
```

---

### Task 6: Implement DepthEvaluator

Identifies shallow boilerplate chunks with no real design decisions.

**Files:**
- Create: `packages/franken-orchestrator/src/planning/evaluators/depth-evaluator.ts`
- Test: `packages/franken-orchestrator/tests/unit/planning/evaluators/depth-evaluator.test.ts`

**Step 1: Write the failing tests**

Key test cases:
- Chunk with empty designDecisions AND empty edgeCases touching >2 files → flags `shallow_chunk`
- Chunk with designDecisions populated → no flag
- Chunk with 1-2 files and no designDecisions → no flag (too small to matter)
- `buildPromptSection` returns prompt when shallow candidates exist, null otherwise
- `parseResponse` handles valid JSON with `merge_recommended` and `missing_design_decisions`

**Step 2-5: Standard TDD cycle — implement, test, commit**

```bash
git commit -m "feat(franken-orchestrator): add DepthEvaluator for shallow chunk detection"
```

---

### Task 7: Implement IntegrationEvaluator

Checks whether the plan connects to relevant existing Frankenbeast modules.

**Files:**
- Create: `packages/franken-orchestrator/src/planning/evaluators/integration-evaluator.ts`
- Test: `packages/franken-orchestrator/tests/unit/planning/evaluators/integration-evaluator.test.ts`

**Step 1: Write the failing tests**

Key test cases:
- `evaluateLocal` always returns empty (needs semantic LLM understanding)
- `buildPromptSection` returns non-null prompt that includes module names from RAMP_UP
- `buildPromptSection` includes context from `relevantSignatures` and `packageDeps`
- `parseResponse` handles `missing_module_integration` and `unused_existing_capability`

**Step 2-5: Standard TDD cycle — implement, test, commit**

```bash
git commit -m "feat(franken-orchestrator): add IntegrationEvaluator for module connectivity checks"
```

---

### Task 8: Implement OperationalEvaluator

Probes for production-readiness concerns: retry, rate limiting, graceful degradation, monitoring, configuration.

**Files:**
- Create: `packages/franken-orchestrator/src/planning/evaluators/operational-evaluator.ts`
- Test: `packages/franken-orchestrator/tests/unit/planning/evaluators/operational-evaluator.test.ts`

**Step 1: Write the failing tests**

Key test cases:
- `evaluateLocal` always returns empty (needs semantic LLM understanding)
- `buildPromptSection` returns non-null prompt mentioning retry, rate limiting, graceful degradation, monitoring, configuration
- `parseResponse` handles all 5 categories: `missing_retry_strategy`, `missing_rate_limiting`, `missing_graceful_degradation`, `missing_monitoring`, `missing_configuration`

**Step 2-5: Standard TDD cycle — implement, test, commit**

```bash
git commit -m "feat(franken-orchestrator): add OperationalEvaluator for production-readiness checks"
```

---

### Task 9: Implement PlanCritiqueRunner

Orchestrates all evaluators with smart-batching and iterative remediation.

**Files:**
- Create: `packages/franken-orchestrator/src/planning/plan-critique-runner.ts`
- Test: `packages/franken-orchestrator/tests/unit/planning/plan-critique-runner.test.ts`

**Step 1: Write the failing tests**

```typescript
// packages/franken-orchestrator/tests/unit/planning/plan-critique-runner.test.ts
import { describe, it, expect, vi } from 'vitest';
import { PlanCritiqueRunner } from '../../../src/planning/plan-critique-runner.js';
import type { IPlanEvaluator, PlanEvaluationContext, PlanCritiqueIssue, ILlmClient, ChunkDefinition } from '@franken/types';

function mockLlm(...responses: string[]): ILlmClient {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  return { complete: fn };
}

function stubEvaluator(overrides: Partial<IPlanEvaluator> & { name: string }): IPlanEvaluator {
  return {
    evaluateLocal: () => [],
    buildPromptSection: () => null,
    parseResponse: () => ({ issues: [] }),
    ...overrides,
  };
}

const sampleChunks: ChunkDefinition[] = [
  { id: 'a', objective: 'Do A', files: ['a.ts'], successCriteria: 'OK', verificationCommand: 'npx vitest', dependencies: [] },
];

describe('PlanCritiqueRunner', () => {
  it('collects local issues from all evaluators without LLM calls', async () => {
    const localIssue: PlanCritiqueIssue = {
      evaluator: 'test',
      severity: 'warning',
      chunkId: 'a',
      category: 'test_issue',
      description: 'Test issue',
      suggestion: 'Fix it',
    };
    const evaluator = stubEvaluator({
      name: 'test',
      evaluateLocal: () => [localIssue],
    });
    const llm = mockLlm();
    const runner = new PlanCritiqueRunner({
      llm,
      evaluators: [evaluator],
      maxIterations: 2,
      maxTokensPerBatch: 80_000,
    });

    const result = await runner.run(sampleChunks, 'design', {
      rampUp: '', relevantSignatures: [], packageDeps: {},
    });

    expect(result.issues).toContainEqual(localIssue);
    expect(llm.complete).not.toHaveBeenCalled(); // no LLM sections to batch
  });

  it('batches LLM prompt sections and calls LLM', async () => {
    const evaluator = stubEvaluator({
      name: 'test',
      buildPromptSection: () => 'Check for X',
      parseResponse: () => ({ issues: [] }),
    });
    const llm = mockLlm(JSON.stringify({ test: { issues: [] } }));
    const runner = new PlanCritiqueRunner({
      llm,
      evaluators: [evaluator],
      maxIterations: 2,
      maxTokensPerBatch: 80_000,
    });

    const result = await runner.run(sampleChunks, 'design', {
      rampUp: '', relevantSignatures: [], packageDeps: {},
    });

    expect(llm.complete).toHaveBeenCalledOnce();
    expect(result.resolved).toBe(true);
  });

  it('iterates when errors found — remediates and re-evaluates', async () => {
    const errorIssue: PlanCritiqueIssue = {
      evaluator: 'test',
      severity: 'error',
      chunkId: 'a',
      category: 'test_error',
      description: 'Bad thing',
      suggestion: 'Fix it',
    };
    let callCount = 0;
    const evaluator = stubEvaluator({
      name: 'test',
      evaluateLocal: () => {
        callCount++;
        // First call returns error, second call returns clean
        return callCount === 1 ? [errorIssue] : [];
      },
    });

    // LLM call for remediation returns patched chunks
    const llm = mockLlm(JSON.stringify(sampleChunks));

    const runner = new PlanCritiqueRunner({
      llm,
      evaluators: [evaluator],
      maxIterations: 2,
      maxTokensPerBatch: 80_000,
    });

    const result = await runner.run(sampleChunks, 'design', {
      rampUp: '', relevantSignatures: [], packageDeps: {},
    });

    expect(result.iterations).toBe(2);
    expect(result.resolved).toBe(true);
  });

  it('stops at maxIterations even if errors remain', async () => {
    const errorIssue: PlanCritiqueIssue = {
      evaluator: 'test',
      severity: 'error',
      chunkId: 'a',
      category: 'persistent_error',
      description: 'Cannot fix',
      suggestion: 'Manual review',
    };
    const evaluator = stubEvaluator({
      name: 'test',
      evaluateLocal: () => [errorIssue],
    });
    const llm = mockLlm(
      JSON.stringify(sampleChunks), // remediation 1
      JSON.stringify(sampleChunks), // remediation 2
    );

    const runner = new PlanCritiqueRunner({
      llm,
      evaluators: [evaluator],
      maxIterations: 2,
      maxTokensPerBatch: 80_000,
    });

    const result = await runner.run(sampleChunks, 'design', {
      rampUp: '', relevantSignatures: [], packageDeps: {},
    });

    expect(result.iterations).toBe(2);
    expect(result.resolved).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('smart-batches evaluators across multiple LLM calls when over token budget', async () => {
    // Create two evaluators with large prompts that exceed a tiny budget
    const bigPrompt = 'x'.repeat(1000);
    const eval1 = stubEvaluator({
      name: 'eval1',
      buildPromptSection: () => bigPrompt,
      parseResponse: () => ({ issues: [] }),
    });
    const eval2 = stubEvaluator({
      name: 'eval2',
      buildPromptSection: () => bigPrompt,
      parseResponse: () => ({ issues: [] }),
    });
    const llm = mockLlm(
      JSON.stringify({ eval1: { issues: [] } }),
      JSON.stringify({ eval2: { issues: [] } }),
    );

    const runner = new PlanCritiqueRunner({
      llm,
      evaluators: [eval1, eval2],
      maxIterations: 1,
      maxTokensPerBatch: 300, // tiny budget forces split
    });

    const result = await runner.run(sampleChunks, 'design', {
      rampUp: '', relevantSignatures: [], packageDeps: {},
    });

    // Should have made 2 LLM calls (one per evaluator)
    expect(llm.complete).toHaveBeenCalledTimes(2);
    expect(result.resolved).toBe(true);
  });

  it('warnings do not trigger remediation', async () => {
    const warningIssue: PlanCritiqueIssue = {
      evaluator: 'test',
      severity: 'warning',
      chunkId: 'a',
      category: 'minor',
      description: 'Minor issue',
      suggestion: 'Consider fixing',
    };
    const evaluator = stubEvaluator({
      name: 'test',
      evaluateLocal: () => [warningIssue],
    });
    const llm = mockLlm();

    const runner = new PlanCritiqueRunner({
      llm,
      evaluators: [evaluator],
      maxIterations: 2,
      maxTokensPerBatch: 80_000,
    });

    const result = await runner.run(sampleChunks, 'design', {
      rampUp: '', relevantSignatures: [], packageDeps: {},
    });

    expect(result.iterations).toBe(1);
    expect(result.resolved).toBe(true);
    expect(result.issues).toHaveLength(1);
    expect(llm.complete).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/planning/plan-critique-runner.test.ts` (from orchestrator dir)
Expected: FAIL

**Step 3: Implement PlanCritiqueRunner**

Key implementation details:

```typescript
// packages/franken-orchestrator/src/planning/plan-critique-runner.ts

export class PlanCritiqueRunner {
  constructor(private readonly options: PlanCritiqueRunnerOptions) {}

  async run(
    chunks: ChunkDefinition[],
    designDoc: string,
    context: Omit<PlanEvaluationContext, 'chunks' | 'designDoc'>,
  ): Promise<PlanCritiqueResult> {
    let currentChunks = chunks;
    let allIssues: PlanCritiqueIssue[] = [];
    let iteration = 0;

    while (iteration < this.options.maxIterations) {
      iteration++;
      const ctx: PlanEvaluationContext = { chunks: currentChunks, designDoc, ...context };

      // 1. Local evaluation (free)
      const localIssues = this.options.evaluators.flatMap((e) => e.evaluateLocal(ctx));

      // 2. LLM evaluation (smart-batched)
      const llmIssues = await this.runLlmEvaluation(ctx);

      allIssues = [...localIssues, ...llmIssues];

      const hasErrors = allIssues.some((i) => i.severity === 'error');
      if (!hasErrors || iteration >= this.options.maxIterations) break;

      // 3. Remediate
      currentChunks = await this.remediate(currentChunks, allIssues, ctx);
    }

    return {
      chunks: currentChunks,
      issues: allIssues,
      iterations: iteration,
      resolved: !allIssues.some((i) => i.severity === 'error'),
    };
  }

  // Smart-batching: group evaluator prompt sections by estimated token cost
  private async runLlmEvaluation(ctx: PlanEvaluationContext): Promise<PlanCritiqueIssue[]> {
    const sections = this.options.evaluators
      .map((e) => ({ evaluator: e, prompt: e.buildPromptSection(ctx) }))
      .filter((s) => s.prompt !== null);

    if (sections.length === 0) return [];

    const batches = this.smartBatch(sections, ctx);
    const allIssues: PlanCritiqueIssue[] = [];

    for (const batch of batches) {
      const combinedPrompt = this.buildBatchPrompt(batch, ctx);
      const raw = await this.options.llm.complete(combinedPrompt);
      const parsed = this.parseBatchResponse(raw, batch);
      allIssues.push(...parsed);
    }

    return allIssues;
  }
  // ... smartBatch, buildBatchPrompt, parseBatchResponse, remediate methods
}
```

Token estimation: `Math.ceil(text.length / 4)`. Batch context (design doc, chunks JSON, rampUp) is estimated once and subtracted from `maxTokensPerBatch` — the remainder is the budget for evaluator sections.

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/planning/plan-critique-runner.test.ts` (from orchestrator dir)
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/planning/plan-critique-runner.ts \
  packages/franken-orchestrator/tests/unit/planning/plan-critique-runner.test.ts
git commit -m "feat(franken-orchestrator): add PlanCritiqueRunner with smart-batching and iteration"
```

---

### Task 10: Wire PlanCritiqueRunner into LlmGraphBuilder and remove old code

Replace the validator/remediator pipeline in `LlmGraphBuilder` with `PlanCritiqueRunner`. Delete `chunk-validator.ts` and `chunk-remediator.ts`. Update `ChunkFileWriter` to use `PlanCritiqueIssue` instead of `ValidationIssue`.

**Files:**
- Modify: `packages/franken-orchestrator/src/planning/llm-graph-builder.ts`
- Modify: `packages/franken-orchestrator/src/planning/chunk-file-writer.ts`
- Modify: `packages/franken-orchestrator/src/planning/chunk-decomposer.ts` (remove hard truncation)
- Modify: `packages/franken-orchestrator/src/cli/session.ts` (update type references)
- Delete: `packages/franken-orchestrator/src/planning/chunk-validator.ts`
- Delete: `packages/franken-orchestrator/src/planning/chunk-remediator.ts`
- Create: `packages/franken-orchestrator/src/planning/evaluators/index.ts` (barrel + createDefaultEvaluators)
- Modify: `packages/franken-orchestrator/tests/unit/llm-graph-builder.test.ts`
- Modify: `packages/franken-orchestrator/tests/unit/chunk-file-writer.test.ts`
- Delete: `packages/franken-orchestrator/tests/unit/chunk-validator.test.ts`
- Delete: `packages/franken-orchestrator/tests/unit/chunk-remediator.test.ts`

**Step 1: Create evaluators barrel file**

```typescript
// packages/franken-orchestrator/src/planning/evaluators/index.ts
import type { IPlanEvaluator } from '@franken/types';
import { StructuralEvaluator } from './structural-evaluator.js';
import { RepetitionEvaluator } from './repetition-evaluator.js';
import { CompletenessEvaluator } from './completeness-evaluator.js';
import { DepthEvaluator } from './depth-evaluator.js';
import { IntegrationEvaluator } from './integration-evaluator.js';
import { OperationalEvaluator } from './operational-evaluator.js';

export function createDefaultEvaluators(): IPlanEvaluator[] {
  return [
    new StructuralEvaluator(),
    new RepetitionEvaluator(),
    new CompletenessEvaluator(),
    new DepthEvaluator(),
    new IntegrationEvaluator(),
    new OperationalEvaluator(),
  ];
}

export {
  StructuralEvaluator,
  RepetitionEvaluator,
  CompletenessEvaluator,
  DepthEvaluator,
  IntegrationEvaluator,
  OperationalEvaluator,
};
```

**Step 2: Update LlmGraphBuilder**

Replace the multi-pass pipeline:
- Remove imports of `ChunkValidator`, `ChunkRemediator`, `ValidationIssue`
- Import `PlanCritiqueRunner` and `createDefaultEvaluators`
- Change `lastValidationIssues` type from `ValidationIssue[]` to `PlanCritiqueIssue[]`
- Replace the validate/remediate/revalidate block with:

```typescript
if (!this.options?.skipValidation) {
  const runner = new PlanCritiqueRunner({
    llm: this.llm,
    evaluators: createDefaultEvaluators(),
    maxIterations: this.options?.maxCritiqueIterations ?? 2,
    maxTokensPerBatch: 80_000,
  });
  const critiqueCtx = {
    rampUp: context.rampUp,
    relevantSignatures: context.relevantSignatures,
    packageDeps: context.packageDeps,
  };
  const result = await runner.run(chunks, intent.goal, critiqueCtx);
  chunks = result.chunks;
  this.lastValidationIssues = result.issues;
}
```

**Step 3: Update ChunkDecomposer — remove hard truncation**

In `chunk-decomposer.ts`, change the truncation to a warning only:
- Remove the `chunks.slice(0, this.options.maxChunks)` line
- Keep the `console.warn` for awareness
- Change the decomposition prompt to say "aim for roughly N chunks" instead of "Maximum N chunks"

**Step 4: Update ChunkFileWriter**

Change `ValidationIssue` import to `PlanCritiqueIssue` from `@franken/types`. Update the `write()` method signature and `buildContent()` to accept `PlanCritiqueIssue[]`. The content format stays the same — `PlanCritiqueIssue` has the same `severity`, `chunkId`, `category`, `description`, `suggestion` fields plus an extra `evaluator` field which can be included in warnings output.

**Step 5: Update session.ts**

Change any references to `ValidationIssue` → `PlanCritiqueIssue`. Import from `@franken/types`.

**Step 6: Delete old files**

```bash
rm packages/franken-orchestrator/src/planning/chunk-validator.ts
rm packages/franken-orchestrator/src/planning/chunk-remediator.ts
rm packages/franken-orchestrator/tests/unit/chunk-validator.test.ts
rm packages/franken-orchestrator/tests/unit/chunk-remediator.test.ts
```

**Step 7: Update LlmGraphBuilder tests**

In `tests/unit/llm-graph-builder.test.ts`:
- The "multi-pass pipeline" tests need updating. The old tests mocked 4 sequential LLM calls (decompose → validate → remediate → revalidate). The new tests should mock the decompose call + critique runner calls.
- The "runs validate+remediate+revalidate" test becomes "runs PlanCritiqueRunner when contextGatherer provided"
- The "skips remediation when validation passes" test becomes "skips remediation when critique finds no errors"
- The "uses revisedChunks from validation" test is removed (revisedChunks now come from PlanCritiqueRunner internally)
- Keep all non-pipeline tests unchanged (JSON parsing, task pair creation, dependency wiring, sanitization, empty input)
- The maxChunks truncation tests should be updated: no more hard truncation, just a prompt hint

**Step 8: Update ChunkFileWriter tests**

In `tests/unit/chunk-file-writer.test.ts`, change `ValidationIssue` imports and test data to use `PlanCritiqueIssue` shape (add `evaluator` field).

**Step 9: Build and test everything**

Run: `npm run build && npm test`
Expected: All builds pass. All tests pass.

**Step 10: Commit**

```bash
git add -A
git commit -m "feat(franken-orchestrator): wire PlanCritiqueRunner, remove ChunkValidator/ChunkRemediator"
```

---

### Task 11: Full monorepo verification and cleanup

**Step 1: Run full build**

Run: `npm run build`
Expected: All 11 packages build successfully

**Step 2: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: No type errors

**Step 4: Check for stale imports**

Search for any remaining references to `chunk-validator` or `chunk-remediator`:

Run: `grep -r "chunk-validator\|chunk-remediator\|ValidationIssue" packages/ --include="*.ts" -l`
Expected: No results (all references removed)

**Step 5: Verify .gitignore coverage**

Run: `git status`
Expected: No untracked build artifacts. Only intentional new/modified files.

**Step 6: Commit any cleanup**

If any stale references or issues found, fix and commit:

```bash
git commit -m "chore(franken-orchestrator): clean up stale validator/remediator references"
```

---

Plan complete and saved to `docs/plans/2026-03-09-plan-critique-system-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
