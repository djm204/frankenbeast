# Planner Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden `LlmGraphBuilder` to produce rich, codebase-aware chunks via a multi-pass pipeline (decompose → validate → remediate → re-validate), replacing the current single-call decomposition.

**Architecture:** Extract decomposition, validation, and remediation into separate classes (`ChunkDecomposer`, `ChunkValidator`, `ChunkRemediator`), add a `PlanContextGatherer` for filesystem-only codebase context, and a `ChunkFileWriter` for writing the expanded 10-field chunk files. `LlmGraphBuilder` becomes the pipeline orchestrator coordinating these components.

**Tech Stack:** TypeScript, Vitest, Node.js fs (for context gathering and file writing), existing `ILlmClient` interface from `@franken/types`.

**Design Doc:** `docs/plans/2026-03-09-planner-hardening-design.md`

---

### Task 1: Expand ChunkDefinition to 10 fields

**Files:**
- Modify: `packages/franken-orchestrator/src/cli/file-writer.ts:5-12`
- Modify: `packages/franken-orchestrator/src/planning/llm-graph-builder.ts:10-17`
- Test: `packages/franken-orchestrator/tests/unit/llm-graph-builder.test.ts`

**Step 1: Add new optional fields to ChunkDefinition in file-writer.ts**

```ts
export interface ChunkDefinition {
  id: string;
  objective: string;
  files: string[];
  successCriteria: string;
  verificationCommand: string;
  dependencies: string[];
  // New fields — optional for backward compat with hand-written chunks
  context?: string;
  designDecisions?: string;
  interfaceContract?: string;
  edgeCases?: string;
  antiPatterns?: string;
}
```

**Step 2: Remove duplicate ChunkDefinition from llm-graph-builder.ts, import from file-writer.ts**

In `llm-graph-builder.ts`, remove lines 10-17 (the local `ChunkDefinition` interface) and add:
```ts
import type { ChunkDefinition } from '../cli/file-writer.js';
```

Update the `lastChunks` type to use the imported `ChunkDefinition`.

**Step 3: Run typecheck to verify no breakage**

Run: `npx turbo run typecheck --filter=franken-orchestrator`
Expected: PASS — all existing code uses only the 6 original fields, new fields are optional

**Step 4: Run existing tests to verify no regressions**

Run: `npx vitest run --config packages/franken-orchestrator/vitest.config.ts tests/unit/llm-graph-builder.test.ts`
Expected: All 20 tests PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/cli/file-writer.ts packages/franken-orchestrator/src/planning/llm-graph-builder.ts
git commit -m "feat(planner): expand ChunkDefinition to 10 fields, consolidate type"
```

---

### Task 2: Create PlanContextGatherer — RAMP_UP + file signatures

**Files:**
- Create: `packages/franken-orchestrator/src/planning/plan-context-gatherer.ts`
- Create: `packages/franken-orchestrator/tests/unit/plan-context-gatherer.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { PlanContextGatherer } from '../../src/planning/plan-context-gatherer.js';

const TMP = join(__dirname, '__fixtures__/plan-context');

describe('PlanContextGatherer', () => {
  beforeEach(() => {
    mkdirSync(join(TMP, 'docs'), { recursive: true });
    mkdirSync(join(TMP, 'packages/franken-orchestrator/src'), { recursive: true });
    writeFileSync(join(TMP, 'docs/RAMP_UP.md'), '# Ramp Up\nThis is the ramp up doc.');
    writeFileSync(
      join(TMP, 'packages/franken-orchestrator/src/example.ts'),
      'export interface Foo { bar(): void; }\nexport function baz(): string { return ""; }\nconst internal = 1;\n'
    );
    writeFileSync(
      join(TMP, 'packages/franken-orchestrator/package.json'),
      JSON.stringify({ name: 'franken-orchestrator', dependencies: { vitest: '^1.0.0' }, devDependencies: { typescript: '^5.0.0' } })
    );
  });

  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('gathers RAMP_UP.md content', async () => {
    const gatherer = new PlanContextGatherer(TMP);
    const ctx = await gatherer.gather('Design doc mentioning packages/franken-orchestrator/src/example.ts');

    expect(ctx.rampUp).toContain('Ramp Up');
  });

  it('extracts file signatures for paths mentioned in design doc', async () => {
    const gatherer = new PlanContextGatherer(TMP);
    const ctx = await gatherer.gather('Modify packages/franken-orchestrator/src/example.ts to add feature');

    expect(ctx.relevantSignatures.length).toBeGreaterThanOrEqual(1);
    const sig = ctx.relevantSignatures.find(s => s.path.includes('example.ts'));
    expect(sig).toBeDefined();
    expect(sig!.signatures).toContain('Foo');
    expect(sig!.signatures).toContain('baz');
    // Internal non-exported symbols should NOT appear
    expect(sig!.signatures).not.toContain('internal');
  });

  it('gathers package dependencies', async () => {
    const gatherer = new PlanContextGatherer(TMP);
    const ctx = await gatherer.gather('Work on packages/franken-orchestrator');

    expect(ctx.packageDeps['franken-orchestrator']).toBeDefined();
    expect(ctx.packageDeps['franken-orchestrator']).toContain('vitest');
  });

  it('returns empty context when no RAMP_UP.md exists', async () => {
    rmSync(join(TMP, 'docs/RAMP_UP.md'));
    const gatherer = new PlanContextGatherer(TMP);
    const ctx = await gatherer.gather('Some design doc');

    expect(ctx.rampUp).toBe('');
  });

  it('returns empty signatures when no paths are mentioned', async () => {
    const gatherer = new PlanContextGatherer(TMP);
    const ctx = await gatherer.gather('A design doc that mentions no file paths at all');

    expect(ctx.relevantSignatures).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run --config packages/franken-orchestrator/vitest.config.ts tests/unit/plan-context-gatherer.test.ts`
Expected: FAIL — module not found

**Step 3: Implement PlanContextGatherer**

```ts
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

export interface PlanContext {
  rampUp: string;
  relevantSignatures: Array<{ path: string; signatures: string }>;
  packageDeps: Record<string, string[]>;
  existingPatterns: Array<{ description: string; example: string }>;
}

/**
 * Collects codebase context for LLM-based planning.
 * No LLM calls — filesystem reads only.
 */
export class PlanContextGatherer {
  constructor(private readonly repoRoot: string) {}

  async gather(designDoc: string): Promise<PlanContext> {
    return {
      rampUp: this.readRampUp(),
      relevantSignatures: this.extractSignatures(designDoc),
      packageDeps: this.gatherPackageDeps(designDoc),
      existingPatterns: [], // Phase 2: pattern detection
    };
  }

  private readRampUp(): string {
    const rampUpPath = join(this.repoRoot, 'docs', 'RAMP_UP.md');
    try {
      return readFileSync(rampUpPath, 'utf-8');
    } catch {
      return '';
    }
  }

  /**
   * Extracts exported type/function/class signatures from files
   * mentioned in the design doc. Filters to only export lines.
   */
  private extractSignatures(designDoc: string): Array<{ path: string; signatures: string }> {
    const paths = this.findMentionedPaths(designDoc);
    const results: Array<{ path: string; signatures: string }> = [];

    for (const relPath of paths) {
      const absPath = resolve(this.repoRoot, relPath);
      if (!existsSync(absPath)) continue;

      try {
        const content = readFileSync(absPath, 'utf-8');
        const sigs = this.extractExportedSignatures(content);
        if (sigs.length > 0) {
          results.push({ path: relPath, signatures: sigs.join('\n') });
        }
      } catch {
        // Skip unreadable files
      }
    }

    return results;
  }

  /**
   * Find file paths mentioned in the design doc.
   * Matches patterns like src/foo/bar.ts, packages/name/src/file.ts, etc.
   */
  private findMentionedPaths(designDoc: string): string[] {
    const pathPattern = /(?:packages\/[\w-]+\/)?(?:src|lib|tests?)\/[\w/.-]+\.(?:ts|js|json)/g;
    const matches = designDoc.match(pathPattern) ?? [];
    return [...new Set(matches)];
  }

  /**
   * Extracts lines that are exported declarations.
   */
  private extractExportedSignatures(content: string): string[] {
    const lines = content.split('\n');
    const sigs: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (
        trimmed.startsWith('export ') &&
        (trimmed.includes('interface ') ||
         trimmed.includes('type ') ||
         trimmed.includes('function ') ||
         trimmed.includes('class ') ||
         trimmed.includes('const ') ||
         trimmed.includes('enum '))
      ) {
        // Take just the signature line, not the body
        sigs.push(trimmed.replace(/\{[^}]*$/, '{...}').replace(/\s*=\s*[^;]+;/, ';'));
      }
    }

    return sigs;
  }

  /**
   * Gathers dependencies from package.json files for packages
   * mentioned in the design doc.
   */
  private gatherPackageDeps(designDoc: string): Record<string, string[]> {
    const packagePattern = /packages\/([\w-]+)/g;
    const packageNames = new Set<string>();
    let match: RegExpExecArray | null;

    while ((match = packagePattern.exec(designDoc)) !== null) {
      packageNames.add(match[1]!);
    }

    const result: Record<string, string[]> = {};

    for (const pkg of packageNames) {
      const pkgJsonPath = join(this.repoRoot, 'packages', pkg, 'package.json');
      try {
        const raw = readFileSync(pkgJsonPath, 'utf-8');
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const deps = [
          ...Object.keys((parsed.dependencies as Record<string, string>) ?? {}),
          ...Object.keys((parsed.devDependencies as Record<string, string>) ?? {}),
        ];
        result[pkg] = deps;
      } catch {
        // Skip missing package.json
      }
    }

    return result;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run --config packages/franken-orchestrator/vitest.config.ts tests/unit/plan-context-gatherer.test.ts`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/planning/plan-context-gatherer.ts packages/franken-orchestrator/tests/unit/plan-context-gatherer.test.ts
git commit -m "feat(planner): add PlanContextGatherer for codebase-aware planning"
```

---

### Task 3: Create ChunkDecomposer

**Files:**
- Create: `packages/franken-orchestrator/src/planning/chunk-decomposer.ts`
- Create: `packages/franken-orchestrator/tests/unit/chunk-decomposer.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { ChunkDecomposer } from '../../src/planning/chunk-decomposer.js';
import type { ILlmClient } from '@franken/types';
import type { PlanContext } from '../../src/planning/plan-context-gatherer.js';

function mockLlm(response: string): ILlmClient {
  return { complete: vi.fn().mockResolvedValue(response) };
}

const emptyContext: PlanContext = {
  rampUp: '',
  relevantSignatures: [],
  packageDeps: {},
  existingPatterns: [],
};

const contextWithSignatures: PlanContext = {
  rampUp: '# Ramp Up\nThis is a monorepo.',
  relevantSignatures: [{ path: 'src/deps.ts', signatures: 'export interface ILogger { info(msg: string): void; }' }],
  packageDeps: { 'franken-orchestrator': ['vitest', 'typescript'] },
  existingPatterns: [],
};

const validResponse = JSON.stringify([
  {
    id: 'define-types',
    objective: 'Define shared types',
    files: ['src/types.ts'],
    successCriteria: 'Types compile',
    verificationCommand: 'npx tsc --noEmit',
    dependencies: [],
    context: 'No existing types in this area',
    designDecisions: 'Use branded types for IDs',
    interfaceContract: 'export interface Foo { bar: string; }',
    edgeCases: 'Empty string IDs',
    antiPatterns: 'Do not use `any` type',
  },
]);

describe('ChunkDecomposer', () => {
  it('sends design doc + codebase context to LLM', async () => {
    const llm = mockLlm(validResponse);
    const decomposer = new ChunkDecomposer(llm, { maxChunks: 12 });
    await decomposer.decompose('Build a widget system', contextWithSignatures);

    const prompt = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).toContain('Build a widget system');
    expect(prompt).toContain('ILogger');
    expect(prompt).toContain('Ramp Up');
  });

  it('parses valid 10-field chunk response', async () => {
    const llm = mockLlm(validResponse);
    const decomposer = new ChunkDecomposer(llm, { maxChunks: 12 });
    const chunks = await decomposer.decompose('Build a widget system', emptyContext);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.id).toBe('define-types');
    expect(chunks[0]!.context).toBe('No existing types in this area');
    expect(chunks[0]!.interfaceContract).toContain('Foo');
  });

  it('tolerates chunks missing optional new fields', async () => {
    const minimalResponse = JSON.stringify([
      {
        id: 'setup',
        objective: 'Setup',
        files: ['src/index.ts'],
        successCriteria: 'Compiles',
        verificationCommand: 'npx tsc',
        dependencies: [],
      },
    ]);
    const llm = mockLlm(minimalResponse);
    const decomposer = new ChunkDecomposer(llm, { maxChunks: 12 });
    const chunks = await decomposer.decompose('Simple task', emptyContext);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.context).toBeUndefined();
  });

  it('respects maxChunks limit', async () => {
    const manyChunks = Array.from({ length: 15 }, (_, i) => ({
      id: `chunk-${i}`,
      objective: `Task ${i}`,
      files: [],
      successCriteria: '',
      verificationCommand: '',
      dependencies: [],
    }));
    const llm = mockLlm(JSON.stringify(manyChunks));
    const decomposer = new ChunkDecomposer(llm, { maxChunks: 5 });
    const chunks = await decomposer.decompose('Big project', emptyContext);

    expect(chunks.length).toBeLessThanOrEqual(5);
  });

  it('throws on unparseable response', async () => {
    const llm = mockLlm('This is not JSON');
    const decomposer = new ChunkDecomposer(llm, { maxChunks: 12 });

    await expect(decomposer.decompose('Task', emptyContext)).rejects.toThrow(/parse|JSON/i);
  });

  it('validates dependency references exist', async () => {
    const badDeps = JSON.stringify([
      { id: 'a', objective: 'A', files: [], successCriteria: '', verificationCommand: '', dependencies: ['nonexistent'] },
    ]);
    const llm = mockLlm(badDeps);
    const decomposer = new ChunkDecomposer(llm, { maxChunks: 12 });

    await expect(decomposer.decompose('Task', emptyContext)).rejects.toThrow(/nonexistent/);
  });

  it('detects cyclic dependencies', async () => {
    const cyclic = JSON.stringify([
      { id: 'a', objective: 'A', files: [], successCriteria: '', verificationCommand: '', dependencies: ['b'] },
      { id: 'b', objective: 'B', files: [], successCriteria: '', verificationCommand: '', dependencies: ['a'] },
    ]);
    const llm = mockLlm(cyclic);
    const decomposer = new ChunkDecomposer(llm, { maxChunks: 12 });

    await expect(decomposer.decompose('Task', emptyContext)).rejects.toThrow(/cycl/i);
  });

  it('includes codebase package deps in prompt', async () => {
    const llm = mockLlm(validResponse);
    const decomposer = new ChunkDecomposer(llm, { maxChunks: 12 });
    await decomposer.decompose('Build a thing', contextWithSignatures);

    const prompt = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).toContain('vitest');
    expect(prompt).toContain('typescript');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run --config packages/franken-orchestrator/vitest.config.ts tests/unit/chunk-decomposer.test.ts`
Expected: FAIL — module not found

**Step 3: Implement ChunkDecomposer**

The `ChunkDecomposer` is extracted from the current `LlmGraphBuilder` but with:
- Enhanced prompt that includes `PlanContext` (RAMP_UP, signatures, deps)
- 10-field chunk schema in the prompt
- Action-verb ID convention instruction
- Existing validation (cycles, missing deps, required fields) moved here

Key: reuse `cleanLlmJson` from `stream-json-utils.ts` for JSON extraction.

```ts
import type { ILlmClient } from '@franken/types';
import type { ChunkDefinition } from '../cli/file-writer.js';
import type { PlanContext } from './plan-context-gatherer.js';
import { cleanLlmJson } from '../skills/providers/stream-json-utils.js';

export class ChunkDecomposer {
  private readonly maxChunks: number;

  constructor(
    private readonly llm: ILlmClient,
    private readonly options: { maxChunks: number },
  ) {
    this.maxChunks = options.maxChunks;
  }

  async decompose(designDoc: string, context: PlanContext): Promise<ChunkDefinition[]> {
    const prompt = this.buildPrompt(designDoc, context);
    const raw = await this.llm.complete(prompt);
    const chunks = this.parseResponse(raw);
    this.validateStructure(chunks);

    if (chunks.length > this.maxChunks) {
      console.warn(
        `LLM produced ${chunks.length} chunks, exceeding max of ${this.maxChunks}. Truncating to first ${this.maxChunks}.`,
      );
      return chunks.slice(0, this.maxChunks);
    }
    return chunks;
  }

  // ... buildPrompt includes PlanContext sections, 10-field schema, action-verb IDs
  // ... parseResponse uses cleanLlmJson + JSON.parse
  // ... validateStructure checks required fields, dependency refs, cycles
}
```

The full prompt includes sections for:
- Codebase context (RAMP_UP, file signatures, package deps)
- 10-field chunk schema with descriptions
- Naming convention (action-verb kebab-case IDs)
- Parallelization instruction
- Existing `validate` / `detectCycles` / `validateChunkShape` logic from current `LlmGraphBuilder`

**Step 4: Run test to verify it passes**

Run: `npx vitest run --config packages/franken-orchestrator/vitest.config.ts tests/unit/chunk-decomposer.test.ts`
Expected: All 8 tests PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/planning/chunk-decomposer.ts packages/franken-orchestrator/tests/unit/chunk-decomposer.test.ts
git commit -m "feat(planner): add ChunkDecomposer with codebase-aware decomposition prompt"
```

---

### Task 4: Create ChunkValidator

**Files:**
- Create: `packages/franken-orchestrator/src/planning/chunk-validator.ts`
- Create: `packages/franken-orchestrator/tests/unit/chunk-validator.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { ChunkValidator } from '../../src/planning/chunk-validator.js';
import type { ValidationResult } from '../../src/planning/chunk-validator.js';
import type { ILlmClient } from '@franken/types';
import type { PlanContext } from '../../src/planning/plan-context-gatherer.js';
import type { ChunkDefinition } from '../../src/cli/file-writer.js';

function mockLlm(response: string): ILlmClient {
  return { complete: vi.fn().mockResolvedValue(response) };
}

const emptyContext: PlanContext = {
  rampUp: '',
  relevantSignatures: [],
  packageDeps: {},
  existingPatterns: [],
};

const goodChunks: ChunkDefinition[] = [
  {
    id: 'define-types',
    objective: 'Define shared types',
    files: ['src/types.ts'],
    successCriteria: 'Types compile',
    verificationCommand: 'npx tsc --noEmit',
    dependencies: [],
    context: 'No existing types',
    designDecisions: 'Use branded types',
    interfaceContract: 'export interface Foo { bar: string; }',
    edgeCases: 'Empty strings',
    antiPatterns: 'No any',
  },
];

describe('ChunkValidator', () => {
  it('returns valid: true with no issues for good chunks', async () => {
    const validationResponse = JSON.stringify({ valid: true, issues: [] });
    const llm = mockLlm(validationResponse);
    const validator = new ChunkValidator(llm);

    const result = await validator.validate(goodChunks, 'design doc text', emptyContext);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('returns issues with correct structure', async () => {
    const validationResponse = JSON.stringify({
      valid: false,
      issues: [
        {
          severity: 'error',
          chunkId: 'define-types',
          category: 'missing_interface',
          description: 'interfaceContract is vague',
          suggestion: 'Add concrete TS signatures',
        },
      ],
    });
    const llm = mockLlm(validationResponse);
    const validator = new ChunkValidator(llm);

    const result = await validator.validate(goodChunks, 'design doc text', emptyContext);

    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.category).toBe('missing_interface');
    expect(result.issues[0]!.severity).toBe('error');
  });

  it('includes chunk array + design doc + context in LLM prompt', async () => {
    const llm = mockLlm(JSON.stringify({ valid: true, issues: [] }));
    const validator = new ChunkValidator(llm);
    const contextWithData: PlanContext = {
      ...emptyContext,
      rampUp: 'Project overview here',
    };

    await validator.validate(goodChunks, 'My design doc', contextWithData);

    const prompt = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).toContain('define-types');
    expect(prompt).toContain('My design doc');
    expect(prompt).toContain('Project overview here');
  });

  it('handles unparseable LLM response gracefully as invalid', async () => {
    const llm = mockLlm('Not valid JSON at all');
    const validator = new ChunkValidator(llm);

    const result = await validator.validate(goodChunks, 'doc', emptyContext);

    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0]!.category).toBe('design_gap');
  });

  it('passes through revisedChunks when validator provides them', async () => {
    const revised = [{ ...goodChunks[0]!, context: 'Updated context' }];
    const validationResponse = JSON.stringify({
      valid: true,
      issues: [{ severity: 'warning', chunkId: 'define-types', category: 'chunk_too_thin', description: 'Thin', suggestion: 'Added context' }],
      revisedChunks: revised,
    });
    const llm = mockLlm(validationResponse);
    const validator = new ChunkValidator(llm);

    const result = await validator.validate(goodChunks, 'doc', emptyContext);

    expect(result.revisedChunks).toBeDefined();
    expect(result.revisedChunks![0]!.context).toBe('Updated context');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run --config packages/franken-orchestrator/vitest.config.ts tests/unit/chunk-validator.test.ts`
Expected: FAIL — module not found

**Step 3: Implement ChunkValidator**

```ts
import type { ILlmClient } from '@franken/types';
import type { ChunkDefinition } from '../cli/file-writer.js';
import type { PlanContext } from './plan-context-gatherer.js';
import { cleanLlmJson } from '../skills/providers/stream-json-utils.js';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  chunkId: string | null;
  category:
    | 'missing_component'
    | 'wrong_dependency'
    | 'parallelizable'
    | 'missing_interface'
    | 'design_gap'
    | 'chunk_too_large'
    | 'chunk_too_thin';
  description: string;
  suggestion: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  revisedChunks?: ChunkDefinition[];
}

export class ChunkValidator {
  constructor(private readonly llm: ILlmClient) {}

  async validate(
    chunks: ChunkDefinition[],
    designDoc: string,
    context: PlanContext,
  ): Promise<ValidationResult> {
    const prompt = this.buildValidationPrompt(chunks, designDoc, context);
    const raw = await this.llm.complete(prompt);
    return this.parseValidationResponse(raw);
  }

  // ... buildValidationPrompt instructs LLM to check for:
  //     missing_component, wrong_dependency, parallelizable,
  //     missing_interface, design_gap, chunk_too_large, chunk_too_thin
  // ... parseValidationResponse uses cleanLlmJson, falls back to
  //     { valid: false, issues: [{ category: 'design_gap', ... }] }
  //     on parse failure
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run --config packages/franken-orchestrator/vitest.config.ts tests/unit/chunk-validator.test.ts`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/planning/chunk-validator.ts packages/franken-orchestrator/tests/unit/chunk-validator.test.ts
git commit -m "feat(planner): add ChunkValidator for multi-pass validation"
```

---

### Task 5: Create ChunkRemediator

**Files:**
- Create: `packages/franken-orchestrator/src/planning/chunk-remediator.ts`
- Create: `packages/franken-orchestrator/tests/unit/chunk-remediator.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { ChunkRemediator } from '../../src/planning/chunk-remediator.js';
import type { ILlmClient } from '@franken/types';
import type { PlanContext } from '../../src/planning/plan-context-gatherer.js';
import type { ValidationIssue } from '../../src/planning/chunk-validator.js';
import type { ChunkDefinition } from '../../src/cli/file-writer.js';

function mockLlm(response: string): ILlmClient {
  return { complete: vi.fn().mockResolvedValue(response) };
}

const emptyContext: PlanContext = {
  rampUp: '',
  relevantSignatures: [],
  packageDeps: {},
  existingPatterns: [],
};

const originalChunks: ChunkDefinition[] = [
  {
    id: 'define-types',
    objective: 'Define types',
    files: ['src/types.ts'],
    successCriteria: 'Compiles',
    verificationCommand: 'npx tsc --noEmit',
    dependencies: [],
  },
];

const issues: ValidationIssue[] = [
  {
    severity: 'error',
    chunkId: 'define-types',
    category: 'missing_interface',
    description: 'No interface contract',
    suggestion: 'Add concrete TS signatures',
  },
];

describe('ChunkRemediator', () => {
  it('sends original chunks + issues to LLM for patching', async () => {
    const patchedResponse = JSON.stringify([
      { ...originalChunks[0], interfaceContract: 'export interface Foo { bar: string; }' },
    ]);
    const llm = mockLlm(patchedResponse);
    const remediator = new ChunkRemediator(llm);

    const result = await remediator.remediate(originalChunks, issues, emptyContext);

    const prompt = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).toContain('missing_interface');
    expect(prompt).toContain('define-types');
    expect(result).toHaveLength(1);
    expect(result[0]!.interfaceContract).toContain('Foo');
  });

  it('preserves chunk count — does not add or remove chunks', async () => {
    const twoChunks: ChunkDefinition[] = [
      { ...originalChunks[0]! },
      { id: 'implement-feature', objective: 'Feature', files: ['src/feature.ts'], successCriteria: '', verificationCommand: '', dependencies: ['define-types'] },
    ];
    const patchedResponse = JSON.stringify(twoChunks.map(c => ({ ...c, context: 'Added context' })));
    const llm = mockLlm(patchedResponse);
    const remediator = new ChunkRemediator(llm);

    const result = await remediator.remediate(twoChunks, issues, emptyContext);

    expect(result).toHaveLength(2);
  });

  it('falls back to original chunks on parse failure', async () => {
    const llm = mockLlm('Not JSON');
    const remediator = new ChunkRemediator(llm);

    const result = await remediator.remediate(originalChunks, issues, emptyContext);

    expect(result).toEqual(originalChunks);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run --config packages/franken-orchestrator/vitest.config.ts tests/unit/chunk-remediator.test.ts`
Expected: FAIL — module not found

**Step 3: Implement ChunkRemediator**

```ts
import type { ILlmClient } from '@franken/types';
import type { ChunkDefinition } from '../cli/file-writer.js';
import type { PlanContext } from './plan-context-gatherer.js';
import type { ValidationIssue } from './chunk-validator.js';
import { cleanLlmJson } from '../skills/providers/stream-json-utils.js';

export class ChunkRemediator {
  constructor(private readonly llm: ILlmClient) {}

  async remediate(
    chunks: ChunkDefinition[],
    issues: ValidationIssue[],
    context: PlanContext,
  ): Promise<ChunkDefinition[]> {
    const prompt = this.buildRemediationPrompt(chunks, issues, context);
    const raw = await this.llm.complete(prompt);
    return this.parseResponse(raw, chunks);
  }

  // ... buildRemediationPrompt: "Patch these chunks to fix these issues.
  //     Do NOT add or remove chunks. Return the full array."
  // ... parseResponse: try cleanLlmJson + JSON.parse, fall back to original chunks
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run --config packages/franken-orchestrator/vitest.config.ts tests/unit/chunk-remediator.test.ts`
Expected: All 3 tests PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/planning/chunk-remediator.ts packages/franken-orchestrator/tests/unit/chunk-remediator.test.ts
git commit -m "feat(planner): add ChunkRemediator for auto-patching validation issues"
```

---

### Task 6: Create ChunkFileWriter

**Files:**
- Create: `packages/franken-orchestrator/src/planning/chunk-file-writer.ts`
- Create: `packages/franken-orchestrator/tests/unit/chunk-file-writer.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ChunkFileWriter } from '../../src/planning/chunk-file-writer.js';
import type { ChunkDefinition } from '../../src/cli/file-writer.js';
import type { ValidationIssue } from '../../src/planning/chunk-validator.js';

const TMP = join(__dirname, '__fixtures__/chunk-writer');

describe('ChunkFileWriter', () => {
  beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('writes numbered chunk files with action-verb names', () => {
    const chunks: ChunkDefinition[] = [
      {
        id: 'define-types',
        objective: 'Define shared types',
        files: ['src/types.ts'],
        successCriteria: 'Types compile',
        verificationCommand: 'npx tsc --noEmit',
        dependencies: [],
        context: 'No existing types',
        designDecisions: 'Use branded types',
        interfaceContract: 'export interface Foo { bar: string; }',
        edgeCases: 'Empty strings',
        antiPatterns: 'Do not use any',
      },
    ];
    const writer = new ChunkFileWriter(TMP);
    const paths = writer.write(chunks);

    expect(paths).toHaveLength(1);
    const content = readFileSync(paths[0]!, 'utf-8');
    expect(content).toContain('# Chunk 01: define-types');
    expect(content).toContain('## Context');
    expect(content).toContain('No existing types');
    expect(content).toContain('## Design Decisions');
    expect(content).toContain('## Interface Contract');
    expect(content).toContain('## Edge Cases');
    expect(content).toContain('## Anti-patterns');
  });

  it('writes all 10-field sections when present', () => {
    const chunks: ChunkDefinition[] = [
      {
        id: 'implement-router',
        objective: 'Build the router',
        files: ['src/router.ts'],
        successCriteria: 'Routes work',
        verificationCommand: 'npx vitest run',
        dependencies: [],
        context: 'Existing Hono app',
        designDecisions: 'Use Hono router',
        interfaceContract: 'export function createRouter(): Router;',
        edgeCases: '404 handling',
        antiPatterns: 'No Express patterns',
      },
    ];
    const writer = new ChunkFileWriter(TMP);
    writer.write(chunks);

    const files = readdirSync(TMP);
    expect(files).toContain('01_implement-router.md');
  });

  it('omits sections for undefined optional fields', () => {
    const chunks: ChunkDefinition[] = [
      {
        id: 'setup',
        objective: 'Setup',
        files: ['src/index.ts'],
        successCriteria: 'Compiles',
        verificationCommand: 'npx tsc',
        dependencies: [],
      },
    ];
    const writer = new ChunkFileWriter(TMP);
    writer.write(chunks);

    const content = readFileSync(join(TMP, '01_setup.md'), 'utf-8');
    expect(content).not.toContain('## Context');
    expect(content).not.toContain('## Anti-patterns');
    expect(content).toContain('## Objective');
    expect(content).toContain('## Success Criteria');
  });

  it('appends warnings section when validation issues exist', () => {
    const chunks: ChunkDefinition[] = [
      { id: 'define-types', objective: 'Types', files: [], successCriteria: '', verificationCommand: '', dependencies: [] },
    ];
    const issues: ValidationIssue[] = [
      {
        severity: 'warning',
        chunkId: 'define-types',
        category: 'chunk_too_thin',
        description: 'Missing interface contract',
        suggestion: 'Add concrete signatures',
      },
    ];
    const writer = new ChunkFileWriter(TMP);
    writer.write(chunks, issues);

    const content = readFileSync(join(TMP, '01_define-types.md'), 'utf-8');
    expect(content).toContain('## Warnings');
    expect(content).toContain('Missing interface contract');
  });

  it('clears existing chunk files before writing', () => {
    const writer = new ChunkFileWriter(TMP);
    // Write first set
    writer.write([
      { id: 'old-chunk', objective: 'Old', files: [], successCriteria: '', verificationCommand: '', dependencies: [] },
    ]);
    expect(readdirSync(TMP)).toContain('01_old-chunk.md');

    // Write second set — should clear old
    writer.write([
      { id: 'new-chunk', objective: 'New', files: [], successCriteria: '', verificationCommand: '', dependencies: [] },
    ]);
    const files = readdirSync(TMP);
    expect(files).toContain('01_new-chunk.md');
    expect(files).not.toContain('01_old-chunk.md');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run --config packages/franken-orchestrator/vitest.config.ts tests/unit/chunk-file-writer.test.ts`
Expected: FAIL — module not found

**Step 3: Implement ChunkFileWriter**

```ts
import { writeFileSync, readdirSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ChunkDefinition } from '../cli/file-writer.js';
import type { ValidationIssue } from './chunk-validator.js';

export class ChunkFileWriter {
  constructor(private readonly outputDir: string) {}

  write(chunks: ChunkDefinition[], validationIssues?: ValidationIssue[]): string[] {
    mkdirSync(this.outputDir, { recursive: true });
    this.clearExistingChunks();

    return chunks.map((chunk, idx) => {
      const num = String(idx + 1).padStart(2, '0');
      const safeName = chunk.id.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${num}_${safeName}.md`;
      const filePath = resolve(this.outputDir, filename);

      const content = this.buildContent(num, chunk, validationIssues);
      writeFileSync(filePath, content, 'utf-8');
      return filePath;
    });
  }

  private clearExistingChunks(): void {
    if (!existsSync(this.outputDir)) return;
    const files = readdirSync(this.outputDir);
    for (const f of files) {
      if (/^\d{2}/.test(f) && f.endsWith('.md')) {
        unlinkSync(join(this.outputDir, f));
      }
    }
  }

  private buildContent(num: string, chunk: ChunkDefinition, issues?: ValidationIssue[]): string {
    const sections: string[] = [
      `# Chunk ${num}: ${chunk.id}`,
      '',
      '## Objective',
      '',
      chunk.objective,
      '',
      '## Files',
      '',
      ...chunk.files.map(f => `- ${f}`),
      '',
    ];

    // Optional new fields — only include if defined
    if (chunk.context) {
      sections.push('## Context', '', chunk.context, '');
    }
    if (chunk.designDecisions) {
      sections.push('## Design Decisions', '', chunk.designDecisions, '');
    }
    if (chunk.interfaceContract) {
      sections.push('## Interface Contract', '', '```ts', chunk.interfaceContract, '```', '');
    }
    if (chunk.edgeCases) {
      sections.push('## Edge Cases', '', chunk.edgeCases, '');
    }

    sections.push('## Success Criteria', '', chunk.successCriteria, '');

    if (chunk.antiPatterns) {
      sections.push('## Anti-patterns', '', chunk.antiPatterns, '');
    }

    sections.push('## Verification Command', '', '```bash', chunk.verificationCommand, '```', '');

    if (chunk.dependencies.length > 0) {
      sections.push('## Dependencies', '', ...chunk.dependencies.map(d => `- ${d}`), '');
    }

    // Append warnings for this chunk
    const chunkIssues = issues?.filter(i => i.chunkId === chunk.id) ?? [];
    if (chunkIssues.length > 0) {
      sections.push('## Warnings', '');
      for (const issue of chunkIssues) {
        sections.push(`- **[${issue.severity}] ${issue.category}**: ${issue.description}`);
        sections.push(`  - Suggestion: ${issue.suggestion}`);
      }
      sections.push('');
    }

    return sections.join('\n');
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run --config packages/franken-orchestrator/vitest.config.ts tests/unit/chunk-file-writer.test.ts`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/planning/chunk-file-writer.ts packages/franken-orchestrator/tests/unit/chunk-file-writer.test.ts
git commit -m "feat(planner): add ChunkFileWriter for 10-field .md chunk output"
```

---

### Task 7: Refactor LlmGraphBuilder to multi-pass pipeline

This is the core refactor. `LlmGraphBuilder.build()` becomes a pipeline orchestrator.

**Files:**
- Modify: `packages/franken-orchestrator/src/planning/llm-graph-builder.ts`
- Modify: `packages/franken-orchestrator/tests/unit/llm-graph-builder.test.ts`

**Step 1: Update LlmGraphBuilder constructor and build() method**

Change constructor to accept `PlanContextGatherer` and `skipValidation` option:

```ts
import type { ILlmClient } from '@franken/types';
import type { PlanGraph, PlanTask, PlanIntent } from '../deps.js';
import type { GraphBuilder } from './chunk-file-graph-builder.js';
import type { ChunkDefinition } from '../cli/file-writer.js';
import { ChunkDecomposer } from './chunk-decomposer.js';
import { ChunkValidator, type ValidationIssue, type ValidationResult } from './chunk-validator.js';
import { ChunkRemediator } from './chunk-remediator.js';
import type { PlanContextGatherer, PlanContext } from './plan-context-gatherer.js';
import { CHUNK_GUARDRAILS } from './chunk-guardrails.js';

export class LlmGraphBuilder implements GraphBuilder {
  private readonly maxChunks: number;
  public lastChunks: ChunkDefinition[] = [];
  public lastValidationIssues: ValidationIssue[] = [];

  constructor(
    private readonly llm: ILlmClient,
    private readonly contextGatherer?: PlanContextGatherer,
    private readonly options?: { maxChunks?: number; skipValidation?: boolean },
  ) {
    this.maxChunks = options?.maxChunks ?? 12;
  }

  async build(intent: PlanIntent): Promise<PlanGraph> {
    const emptyContext: PlanContext = {
      rampUp: '',
      relevantSignatures: [],
      packageDeps: {},
      existingPatterns: [],
    };

    // Gather codebase context (or use empty if no gatherer provided)
    const context = this.contextGatherer
      ? await this.contextGatherer.gather(intent.goal)
      : emptyContext;

    // Pass 1: Decompose
    const decomposer = new ChunkDecomposer(this.llm, { maxChunks: this.maxChunks });
    let chunks = await decomposer.decompose(intent.goal, context);

    let validationIssues: ValidationIssue[] = [];

    // Pass 2-4: Validate → Remediate → Re-validate (unless skipped)
    if (!this.options?.skipValidation && this.contextGatherer) {
      const validator = new ChunkValidator(this.llm);
      const result = await validator.validate(chunks, intent.goal, context);

      if (result.revisedChunks) {
        chunks = result.revisedChunks;
      }

      if (!result.valid) {
        // Pass 3: Remediate
        const remediator = new ChunkRemediator(this.llm);
        chunks = await remediator.remediate(chunks, result.issues, context);

        // Pass 4: Re-validate
        const revalidation = await validator.validate(chunks, intent.goal, context);
        if (revalidation.revisedChunks) {
          chunks = revalidation.revisedChunks;
        }
        // Remaining issues become warnings
        validationIssues = revalidation.issues;
      } else {
        validationIssues = result.issues; // warnings only
      }
    }

    this.lastChunks = chunks;
    this.lastValidationIssues = validationIssues;
    return this.buildGraph(chunks);
  }

  // buildGraph, buildImplPrompt, buildHardenPrompt, sanitizeId — keep existing logic
  // Update buildImplPrompt and buildHardenPrompt to include all 10 fields
}
```

**Step 2: Update existing tests for new constructor signature**

The constructor now takes `(llm, contextGatherer?, options?)` instead of `(llm, options?)`.
Existing tests that pass `new LlmGraphBuilder(llm)` still work (contextGatherer is optional).
Tests that pass `new LlmGraphBuilder(llm, { maxChunks: 5 })` need to change to
`new LlmGraphBuilder(llm, undefined, { maxChunks: 5 })`.

Add new tests for the pipeline:

```ts
describe('multi-pass pipeline', () => {
  it('uses contextGatherer when provided', async () => {
    // Create mock contextGatherer
    // Verify decomposer receives context
  });

  it('skips validation when skipValidation: true', async () => {
    // Only 1 LLM call (decompose only)
  });

  it('runs validation when contextGatherer is provided', async () => {
    // At least 2 LLM calls
  });

  it('exposes lastValidationIssues after build', async () => {
    // Check issues are accessible
  });
});
```

**Step 3: Run all tests**

Run: `npx vitest run --config packages/franken-orchestrator/vitest.config.ts tests/unit/llm-graph-builder.test.ts`
Expected: All tests PASS (existing + new)

**Step 4: Run typecheck**

Run: `npx turbo run typecheck --filter=franken-orchestrator`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/planning/llm-graph-builder.ts packages/franken-orchestrator/tests/unit/llm-graph-builder.test.ts
git commit -m "feat(planner): refactor LlmGraphBuilder to multi-pass pipeline"
```

---

### Task 8: Update impl/harden prompts for 10-field chunks

**Files:**
- Modify: `packages/franken-orchestrator/src/planning/llm-graph-builder.ts` (buildImplPrompt, buildHardenPrompt)
- Test: `packages/franken-orchestrator/tests/unit/llm-graph-builder.test.ts`

**Step 1: Write failing test for 10-field prompt content**

```ts
it('buildImplPrompt includes context, designDecisions, interfaceContract, edgeCases, antiPatterns', async () => {
  const fullChunk = JSON.stringify([
    {
      id: 'define-types',
      objective: 'Define types',
      files: ['src/types.ts'],
      successCriteria: 'Compiles',
      verificationCommand: 'npx tsc',
      dependencies: [],
      context: 'Existing codebase uses branded types',
      designDecisions: 'Use branded type pattern',
      interfaceContract: 'export interface TaskId extends String {}',
      edgeCases: 'Empty task ID should throw',
      antiPatterns: 'Never use raw string for IDs',
    },
  ]);
  const llm = mockLlm(fullChunk);
  const builder = new LlmGraphBuilder(llm);
  const graph = await builder.build(intent);

  const implTask = taskById(graph.tasks, 'impl:define-types');
  expect(implTask!.objective).toContain('Existing codebase uses branded types');
  expect(implTask!.objective).toContain('branded type pattern');
  expect(implTask!.objective).toContain('TaskId');
  expect(implTask!.objective).toContain('Empty task ID should throw');
  expect(implTask!.objective).toContain('Never use raw string');
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run --config packages/franken-orchestrator/vitest.config.ts tests/unit/llm-graph-builder.test.ts`
Expected: FAIL — prompt doesn't contain new fields yet

**Step 3: Update buildImplPrompt and buildHardenPrompt**

```ts
private buildImplPrompt(chunkId: string, chunk: ChunkDefinition): string {
  const parts: string[] = [
    `Implement chunk '${chunkId}': ${chunk.objective}`,
    `Files: ${chunk.files.join(', ')}`,
  ];

  if (chunk.context) parts.push(`Context: ${chunk.context}`);
  if (chunk.designDecisions) parts.push(`Design decisions: ${chunk.designDecisions}`);
  if (chunk.interfaceContract) parts.push(`Interface contract:\n${chunk.interfaceContract}`);
  if (chunk.edgeCases) parts.push(`Edge cases: ${chunk.edgeCases}`);
  if (chunk.antiPatterns) parts.push(`Anti-patterns: ${chunk.antiPatterns}`);

  parts.push(`Success criteria: ${chunk.successCriteria}`);
  parts.push(`Verification: ${chunk.verificationCommand}`);
  parts.push('');
  parts.push(
    `Use TDD: write failing tests first, then implement, then commit atomically. ` +
    CHUNK_GUARDRAILS +
    `Output <promise>IMPL_${chunkId}_DONE</promise> when all success criteria are met and verification passes.`
  );

  return parts.join('\n');
}
```

Apply similar expansion to `buildHardenPrompt`.

**Step 4: Run test to verify it passes**

Run: `npx vitest run --config packages/franken-orchestrator/vitest.config.ts tests/unit/llm-graph-builder.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/planning/llm-graph-builder.ts packages/franken-orchestrator/tests/unit/llm-graph-builder.test.ts
git commit -m "feat(planner): expand impl/harden prompts to include all 10 chunk fields"
```

---

### Task 9: Integrate into session.ts and dep-factory.ts

**Files:**
- Modify: `packages/franken-orchestrator/src/cli/session.ts:258-316`
- Modify: `packages/franken-orchestrator/src/cli/dep-factory.ts`
- Modify: `packages/franken-orchestrator/tests/unit/cli/session-plan.test.ts` (if exists)

**Step 1: Update session.ts runPlan() to use ChunkFileWriter and PlanContextGatherer**

In `session.ts`, update imports:
```ts
import { PlanContextGatherer } from '../planning/plan-context-gatherer.js';
import { ChunkFileWriter } from '../planning/chunk-file-writer.js';
```

Update `runPlan()`:
```ts
private async runPlan(): Promise<void> {
  const { paths, io, designDocPath } = this.config;
  const depOptions = this.buildDepOptions();
  depOptions.adapterWorkingDir = tmpdir();
  const progress = createStreamProgressWithSpinner({ label: 'Planning...' });
  depOptions.onStreamLine = progress.onLine;
  const { cliLlmAdapter, logger } = await createCliDeps(depOptions);

  // Load design doc
  let designContent: string;
  if (designDocPath) {
    designContent = readFileSync(designDocPath, 'utf-8');
  } else {
    const stored = readDesignDoc(paths);
    if (!stored) {
      throw new Error('No design document found. Run "frankenbeast interview" first, or provide --design-doc.');
    }
    designContent = stored;
  }

  const adapterLlm = new AdapterLlmClient(cliLlmAdapter);
  const cachingLlm = this.wrapWithResponseCache(adapterLlm, paths);
  const contextGatherer = new PlanContextGatherer(paths.root);
  const llmGraphBuilder = new LlmGraphBuilder(cachingLlm, contextGatherer);
  const chunkWriter = new ChunkFileWriter(paths.plansDir);

  logger.info('Decomposing design into chunks...', 'planner');

  try {
    await llmGraphBuilder.build({ goal: designContent });
  } finally {
    progress.stop();
  }

  const chunks = llmGraphBuilder.lastChunks;
  const issues = llmGraphBuilder.lastValidationIssues;
  logger.info(`Planned ${chunks.length} chunk(s)`, 'planner');

  if (issues.length > 0) {
    logger.warn(`${issues.length} validation warning(s) attached to chunks`, 'planner');
  }

  // Write chunk files using ChunkFileWriter
  let chunkPaths = chunkWriter.write(chunks, issues);
  logger.info(`Wrote chunk files to ${paths.plansDir}`, 'planner');

  // Review loop
  await reviewLoop({
    filePaths: chunkPaths,
    artifactLabel: 'Chunk files',
    io,
    onRevise: async (feedback) => {
      await llmGraphBuilder.build({
        goal: `${designContent}\n\nRevision feedback: ${feedback}`,
      });
      chunkPaths = chunkWriter.write(
        llmGraphBuilder.lastChunks,
        llmGraphBuilder.lastValidationIssues,
      );
      return chunkPaths;
    },
  });
}
```

**Step 2: Remove writeChunkFiles import from session.ts if no longer used elsewhere**

Check if `writeChunkFiles` is still imported/used. If the only caller was `runPlan()`, remove the import.
Keep `readDesignDoc`, `writeDesignDoc` imports — those are still needed.

**Step 3: Run typecheck**

Run: `npx turbo run typecheck --filter=franken-orchestrator`
Expected: PASS

**Step 4: Run all tests**

Run: `npx vitest run --config packages/franken-orchestrator/vitest.config.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/cli/session.ts packages/franken-orchestrator/src/cli/dep-factory.ts
git commit -m "feat(planner): wire multi-pass pipeline into session.ts"
```

---

### Task 10: Full integration test and cleanup

**Files:**
- All modified/created files
- Modify: `packages/franken-orchestrator/tests/unit/cli/session-plan.test.ts` (if exists, update mocks)

**Step 1: Run full test suite**

Run: `npx turbo run test --filter=franken-orchestrator`
Expected: All tests PASS

**Step 2: Run typecheck across entire monorepo**

Run: `npx turbo run typecheck`
Expected: PASS

**Step 3: Verify no lint issues**

Run: `npx turbo run lint --filter=franken-orchestrator` (if lint script exists)
Expected: PASS or no lint script

**Step 4: Commit any remaining cleanup**

```bash
git add -A
git commit -m "chore(planner): cleanup and verify full test suite passes"
```

---

## Summary of New Files

| File | Purpose | LLM calls |
|------|---------|-----------|
| `src/planning/plan-context-gatherer.ts` | Collects RAMP_UP, file signatures, package deps | 0 |
| `src/planning/chunk-decomposer.ts` | Design doc + context → ChunkDefinition[] | 1 |
| `src/planning/chunk-validator.ts` | Validates chunks, finds gaps | 1 |
| `src/planning/chunk-remediator.ts` | Patches chunks from validation issues | 1 (conditional) |
| `src/planning/chunk-file-writer.ts` | Writes 10-field .md chunk files | 0 |

## Summary of Modified Files

| File | Change |
|------|--------|
| `src/cli/file-writer.ts` | Expand ChunkDefinition to 10 fields |
| `src/planning/llm-graph-builder.ts` | Multi-pass pipeline orchestrator, 10-field prompts |
| `src/cli/session.ts` | Use ChunkFileWriter + PlanContextGatherer |

## Execution Order

Tasks 1-6 are independent new modules that can be parallelized (tasks 2-6 depend on task 1 for the expanded type). Tasks 7-8 depend on tasks 2-6 (pipeline uses all new modules). Task 9 depends on tasks 7-8. Task 10 is final verification.

```
Task 1 (types) ──→ Task 2 (context gatherer) ──┐
                  → Task 3 (decomposer)    ──┤
                  → Task 4 (validator)     ──┤──→ Task 7 (pipeline) → Task 8 (prompts) → Task 9 (integration) → Task 10 (verify)
                  → Task 5 (remediator)    ──┤
                  → Task 6 (file writer)   ──┘
```
