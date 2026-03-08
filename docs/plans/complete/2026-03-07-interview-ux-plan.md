# Interview Loop UX Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix three UX issues in `frankenbeast interview`: dead air during LLM calls, output spam from design doc dump, and forced approval gate.

**Architecture:** Create a `ProgressLlmClient` decorator (wraps `ILlmClient`) with a CLI spinner for progress feedback. Replace raw design doc display with a summary card. Replace the approval gate in `session.ts` with a context-aware [c]ontinue/[r]evise/e[x]it prompt.

**Tech Stack:** Node.js, TypeScript, Vitest, raw ANSI escape codes (no external deps — matches existing BeastLogger pattern)

---

### Task 1: CLI Spinner utility

**Files:**
- Create: `src/cli/spinner.ts`
- Test: `tests/unit/cli/spinner.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/cli/spinner.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Spinner } from '../../src/cli/spinner.js';

describe('Spinner', () => {
  let writeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeSpy = vi.fn();
  });

  it('writes spinner frame on start', () => {
    const spinner = new Spinner({ write: writeSpy });
    spinner.start('Thinking...');

    expect(writeSpy).toHaveBeenCalled();
    const output = writeSpy.mock.calls[0][0] as string;
    expect(output).toContain('Thinking...');

    spinner.stop();
  });

  it('stop clears the spinner line and prints final message', () => {
    const spinner = new Spinner({ write: writeSpy });
    spinner.start('Thinking...');
    writeSpy.mockClear();

    spinner.stop('Done (5.0s)');

    expect(writeSpy).toHaveBeenCalled();
    const output = writeSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
    expect(output).toContain('Done (5.0s)');
  });

  it('stop without message just clears the line', () => {
    const spinner = new Spinner({ write: writeSpy });
    spinner.start('Working...');
    writeSpy.mockClear();

    spinner.stop();

    expect(writeSpy).toHaveBeenCalled();
  });

  it('does nothing when silent', () => {
    const spinner = new Spinner({ write: writeSpy, silent: true });
    spinner.start('Thinking...');
    spinner.stop('Done');

    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('elapsed returns milliseconds since start', async () => {
    const spinner = new Spinner({ write: writeSpy });
    spinner.start('Working...');

    // Wait a tick
    await new Promise(r => setTimeout(r, 50));
    const elapsed = spinner.elapsed();

    expect(elapsed).toBeGreaterThanOrEqual(40);
    spinner.stop();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd franken-orchestrator && npx vitest run tests/unit/cli/spinner.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// src/cli/spinner.ts
const FRAMES = ['|', '/', '-', '\\'];
const INTERVAL_MS = 100;

export interface SpinnerOptions {
  write?: (text: string) => void;
  silent?: boolean;
}

export class Spinner {
  private readonly write: (text: string) => void;
  private readonly silent: boolean;
  private interval: ReturnType<typeof setInterval> | null = null;
  private frameIdx = 0;
  private label = '';
  private startMs = 0;

  constructor(options: SpinnerOptions = {}) {
    this.write = options.write ?? ((text: string) => process.stderr.write(text));
    this.silent = options.silent ?? false;
  }

  start(label: string): void {
    if (this.silent) return;
    this.label = label;
    this.startMs = Date.now();
    this.frameIdx = 0;
    this.render();
    this.interval = setInterval(() => this.render(), INTERVAL_MS);
  }

  stop(finalMessage?: string): void {
    if (this.silent) return;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    // Clear the spinner line
    this.write('\r\x1b[K');
    if (finalMessage) {
      this.write(`${finalMessage}\n`);
    }
  }

  elapsed(): number {
    return Date.now() - this.startMs;
  }

  private render(): void {
    const frame = FRAMES[this.frameIdx % FRAMES.length];
    const secs = ((Date.now() - this.startMs) / 1000).toFixed(1);
    this.write(`\r\x1b[K${frame} ${this.label} (${secs}s)`);
    this.frameIdx++;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd franken-orchestrator && npx vitest run tests/unit/cli/spinner.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add src/cli/spinner.ts tests/unit/cli/spinner.test.ts
git commit -m "feat: add CLI spinner utility for progress feedback"
```

---

### Task 2: ProgressLlmClient decorator

**Files:**
- Create: `src/adapters/progress-llm-client.ts`
- Test: `tests/unit/adapters/progress-llm-client.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/adapters/progress-llm-client.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ProgressLlmClient } from '../../src/adapters/progress-llm-client.js';
import type { ILlmClient } from '@franken/types';

function mockLlm(response: string, delayMs = 0): ILlmClient {
  return {
    complete: vi.fn(async () => {
      if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
      return response;
    }),
  };
}

describe('ProgressLlmClient', () => {
  it('delegates to inner client and returns result', async () => {
    const inner = mockLlm('hello world');
    const client = new ProgressLlmClient(inner, { silent: true });

    const result = await client.complete('test prompt');

    expect(result).toBe('hello world');
    expect(inner.complete).toHaveBeenCalledWith('test prompt');
  });

  it('shows spinner label and completion stats when not silent', async () => {
    const writeSpy = vi.fn();
    const inner = mockLlm('a response with some tokens');
    const client = new ProgressLlmClient(inner, { label: 'Generating...', write: writeSpy });

    await client.complete('prompt');

    // Should have written spinner frames + completion message
    expect(writeSpy).toHaveBeenCalled();
    const allOutput = writeSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
    expect(allOutput).toContain('Generating...');
    // Completion line should show elapsed time
    expect(allOutput).toMatch(/\d+\.\ds/);
  });

  it('uses default label "Thinking..." when none provided', async () => {
    const writeSpy = vi.fn();
    const inner = mockLlm('response');
    const client = new ProgressLlmClient(inner, { write: writeSpy });

    await client.complete('prompt');

    const allOutput = writeSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
    expect(allOutput).toContain('Thinking...');
  });

  it('reports approximate token count in completion message', async () => {
    const writeSpy = vi.fn();
    // ~20 words = ~25 tokens
    const inner = mockLlm('This is a response with enough words to estimate token count for the test case here.');
    const client = new ProgressLlmClient(inner, { write: writeSpy });

    await client.complete('prompt');

    const allOutput = writeSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
    // Should mention tokens
    expect(allOutput).toMatch(/~?\d+\s*tokens/);
  });

  it('still returns result even if spinner write throws', async () => {
    const writeSpy = vi.fn(() => { throw new Error('write failed'); });
    const inner = mockLlm('result');
    const client = new ProgressLlmClient(inner, { write: writeSpy });

    const result = await client.complete('prompt');

    expect(result).toBe('result');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd franken-orchestrator && npx vitest run tests/unit/adapters/progress-llm-client.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// src/adapters/progress-llm-client.ts
import type { ILlmClient } from '@franken/types';
import { Spinner } from '../cli/spinner.js';

export interface ProgressLlmClientOptions {
  label?: string;
  silent?: boolean;
  write?: (text: string) => void;
}

export class ProgressLlmClient implements ILlmClient {
  private readonly inner: ILlmClient;
  private readonly label: string;
  private readonly silent: boolean;
  private readonly write: (text: string) => void;

  constructor(inner: ILlmClient, options: ProgressLlmClientOptions = {}) {
    this.inner = inner;
    this.label = options.label ?? 'Thinking...';
    this.silent = options.silent ?? false;
    this.write = options.write ?? ((text: string) => process.stderr.write(text));
  }

  async complete(prompt: string): Promise<string> {
    const spinner = new Spinner({ write: this.write, silent: this.silent });
    try {
      spinner.start(this.label);
      const result = await this.inner.complete(prompt);
      const elapsed = (spinner.elapsed() / 1000).toFixed(1);
      const tokens = estimateTokens(result);
      spinner.stop(`  Done (${elapsed}s, ~${tokens} tokens)`);
      return result;
    } catch (error) {
      spinner.stop();
      throw error;
    }
  }
}

/** Rough token estimate: ~1.3 tokens per word (GPT/Claude approximation). */
function estimateTokens(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.round(words * 1.3);
}
```

**Step 4: Run test to verify it passes**

Run: `cd franken-orchestrator && npx vitest run tests/unit/adapters/progress-llm-client.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add src/adapters/progress-llm-client.ts tests/unit/adapters/progress-llm-client.test.ts
git commit -m "feat: add ProgressLlmClient decorator with spinner and token stats"
```

---

### Task 3: Design doc summary extractor

**Files:**
- Create: `src/cli/design-summary.ts`
- Test: `tests/unit/cli/design-summary.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/cli/design-summary.test.ts
import { describe, it, expect } from 'vitest';
import { extractDesignSummary, formatDesignCard } from '../../src/cli/design-summary.js';

const sampleDoc = `# Observer Module Completeness

## Problem
The observer needs validation.

## Goal
Verify all observer features are implemented.

## Architecture
JWT-based tracing with spans.

## Components
- SpanTracer
- BudgetEnforcer
`;

describe('extractDesignSummary', () => {
  it('extracts title from first # heading', () => {
    const summary = extractDesignSummary(sampleDoc);
    expect(summary.title).toBe('Observer Module Completeness');
  });

  it('counts ## section headings', () => {
    const summary = extractDesignSummary(sampleDoc);
    expect(summary.sectionCount).toBe(4);
  });

  it('extracts first non-heading paragraph as blurb', () => {
    const summary = extractDesignSummary(sampleDoc);
    expect(summary.blurb).toContain('observer needs validation');
  });

  it('truncates blurb to ~200 chars', () => {
    const longDoc = `# Title\n\n${'A'.repeat(500)}`;
    const summary = extractDesignSummary(longDoc);
    expect(summary.blurb.length).toBeLessThanOrEqual(203); // 200 + "..."
  });

  it('handles doc with no headings', () => {
    const summary = extractDesignSummary('Just some text here.');
    expect(summary.title).toBe('Untitled');
    expect(summary.sectionCount).toBe(0);
    expect(summary.blurb).toContain('Just some text');
  });

  it('handles empty doc', () => {
    const summary = extractDesignSummary('');
    expect(summary.title).toBe('Untitled');
    expect(summary.sectionCount).toBe(0);
    expect(summary.blurb).toBe('');
  });
});

describe('formatDesignCard', () => {
  it('formats a card with title, section count, path, and blurb', () => {
    const card = formatDesignCard({
      title: 'Observer Module',
      sectionCount: 4,
      blurb: 'The observer needs validation.',
      filePath: '.frankenbeast/plans/design.md',
    });

    expect(card).toContain('Observer Module');
    expect(card).toContain('4');
    expect(card).toContain('.frankenbeast/plans/design.md');
    expect(card).toContain('observer needs validation');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd franken-orchestrator && npx vitest run tests/unit/cli/design-summary.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// src/cli/design-summary.ts
import { ANSI } from '../logging/beast-logger.js';

export interface DesignSummary {
  title: string;
  sectionCount: number;
  blurb: string;
}

export function extractDesignSummary(markdown: string): DesignSummary {
  const lines = markdown.split('\n');

  // Title: first # heading
  const titleLine = lines.find(l => /^# /.test(l));
  const title = titleLine ? titleLine.replace(/^# /, '').trim() : 'Untitled';

  // Section count: number of ## headings
  const sectionCount = lines.filter(l => /^## /.test(l)).length;

  // Blurb: first non-heading, non-empty paragraph
  let blurb = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('-') || trimmed.startsWith('*')) continue;
    blurb = trimmed;
    break;
  }
  if (blurb.length > 200) {
    blurb = blurb.slice(0, 200) + '...';
  }

  return { title, sectionCount, blurb };
}

export function formatDesignCard(opts: {
  title: string;
  sectionCount: number;
  blurb: string;
  filePath: string;
}): string {
  const A = ANSI;
  const line = `${A.cyan}${'─'.repeat(50)}${A.reset}`;
  const parts = [
    `\n${line}`,
    `${A.cyan}│${A.reset} ${A.bold}Design Document${A.reset}`,
    `${line}`,
    `  ${A.dim}Title:${A.reset}    ${opts.title}`,
    `  ${A.dim}Sections:${A.reset} ${opts.sectionCount}`,
    `  ${A.dim}Saved to:${A.reset} ${opts.filePath}`,
  ];
  if (opts.blurb) {
    parts.push('');
    parts.push(`  ${A.dim}${opts.blurb}${A.reset}`);
  }
  parts.push(line);
  return parts.join('\n');
}
```

**Step 4: Run test to verify it passes**

Run: `cd franken-orchestrator && npx vitest run tests/unit/cli/design-summary.test.ts`
Expected: PASS (7 tests)

**Step 5: Commit**

```bash
git add src/cli/design-summary.ts tests/unit/cli/design-summary.test.ts
git commit -m "feat: add design doc summary extractor and card formatter"
```

---

### Task 4: No-op detector

**Files:**
- Create: `src/cli/noop-detector.ts`
- Test: `tests/unit/cli/noop-detector.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/cli/noop-detector.test.ts
import { describe, it, expect } from 'vitest';
import { isNoOpDesign } from '../../src/cli/noop-detector.js';

describe('isNoOpDesign', () => {
  it('detects "code complete" as no-op', () => {
    expect(isNoOpDesign('The module is code complete. All features implemented.')).toBe(true);
  });

  it('detects "no changes required" as no-op', () => {
    expect(isNoOpDesign('After analysis, no changes required.')).toBe(true);
  });

  it('detects "fully implemented" as no-op', () => {
    expect(isNoOpDesign('The observer is fully implemented with all features.')).toBe(true);
  });

  it('detects "nothing to do" as no-op', () => {
    expect(isNoOpDesign('There is nothing to do here.')).toBe(true);
  });

  it('detects "no work needed" as no-op', () => {
    expect(isNoOpDesign('Analysis shows no work needed.')).toBe(true);
  });

  it('detects "no implementation needed" as no-op', () => {
    expect(isNoOpDesign('This is complete. No implementation needed.')).toBe(true);
  });

  it('detects very short docs as no-op', () => {
    expect(isNoOpDesign('Done.')).toBe(true);
  });

  it('returns false for real design docs', () => {
    const realDoc = `# Auth System Design

## Problem
Need authentication.

## Implementation
Add JWT tokens and refresh flow.

## Tasks
1. Create auth middleware
2. Add login endpoint`;
    expect(isNoOpDesign(realDoc)).toBe(false);
  });

  it('returns false for docs with ## Implementation section', () => {
    expect(isNoOpDesign('# Design\n\n## Implementation\nDo stuff.')).toBe(false);
  });

  it('returns false for docs with ## Tasks section', () => {
    expect(isNoOpDesign('# Design\n\n## Tasks\n1. Build it.')).toBe(false);
  });

  it('returns false for docs with ## Changes section', () => {
    expect(isNoOpDesign('# Design\n\n## Changes\nModify auth module.')).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd franken-orchestrator && npx vitest run tests/unit/cli/noop-detector.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// src/cli/noop-detector.ts

const NOOP_KEYWORDS = [
  'code complete',
  'no changes required',
  'no changes needed',
  'fully implemented',
  'nothing to do',
  'no work needed',
  'no work required',
  'no implementation needed',
  'no implementation required',
  'already complete',
  'already implemented',
];

const WORK_SECTIONS = [
  /^## Implementation/m,
  /^## Tasks/m,
  /^## Changes/m,
  /^## Components to Build/m,
  /^## Steps/m,
];

const MIN_CONTENT_LENGTH = 200;

/**
 * Detects if a design doc signals "no work to do".
 * Returns true if the doc is a no-op (analysis only, nothing to implement).
 */
export function isNoOpDesign(markdown: string): boolean {
  const lower = markdown.toLowerCase();

  // If the doc has implementation/tasks sections, it's real work
  for (const pattern of WORK_SECTIONS) {
    if (pattern.test(markdown)) return false;
  }

  // Very short docs are likely "nothing to do" responses
  if (markdown.trim().length < MIN_CONTENT_LENGTH) return true;

  // Check for no-op keywords
  return NOOP_KEYWORDS.some(kw => lower.includes(kw));
}
```

**Step 4: Run test to verify it passes**

Run: `cd franken-orchestrator && npx vitest run tests/unit/cli/noop-detector.test.ts`
Expected: PASS (11 tests)

**Step 5: Commit**

```bash
git add src/cli/noop-detector.ts tests/unit/cli/noop-detector.test.ts
git commit -m "feat: add no-op design doc detector"
```

---

### Task 5: Wire everything into session.ts runInterview()

**Files:**
- Modify: `src/cli/session.ts:1-14` (imports), `src/cli/session.ts:80-119` (runInterview method)
- Test: `tests/unit/cli/session-interview-ux.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/cli/session-interview-ux.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { getProjectPaths, scaffoldFrankenbeast } from '../../../src/cli/project-root.js';
import type { ProjectPaths } from '../../../src/cli/project-root.js';
import type { InterviewIO } from '../../../src/planning/interview-loop.js';

// Mock createCliDeps
const mockCliLlmAdapter = {
  transformRequest: vi.fn((r: unknown) => r),
  execute: vi.fn(async () => ''),
  transformResponse: vi.fn(() => ({ content: 'mock response' })),
  validateCapabilities: vi.fn(() => true),
};

vi.mock('../../../src/cli/dep-factory.js', () => ({
  createCliDeps: vi.fn(() => ({
    deps: {},
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
    finalize: vi.fn(async () => {}),
    cliLlmAdapter: mockCliLlmAdapter,
  })),
}));

// Mock InterviewLoop to capture the LLM client passed to it
let capturedLlm: unknown = null;
vi.mock('../../../src/planning/interview-loop.js', async (importOriginal) => {
  const orig = await importOriginal() as Record<string, unknown>;
  return {
    ...orig,
    InterviewLoop: vi.fn().mockImplementation((llm: unknown) => {
      capturedLlm = llm;
      return {
        build: vi.fn(async () => ({ tasks: [] })),
      };
    }),
  };
});

describe('Session runInterview UX', () => {
  let tmpDir: string;
  let paths: ProjectPaths;

  beforeEach(() => {
    tmpDir = resolve(tmpdir(), `franken-interview-ux-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
    paths = getProjectPaths(tmpDir);
    scaffoldFrankenbeast(paths);
    capturedLlm = null;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('wraps LLM client with ProgressLlmClient', async () => {
    const io: InterviewIO = {
      ask: vi.fn().mockResolvedValue('x'),
      display: vi.fn(),
    };

    const { Session } = await import('../../../src/cli/session.js');
    const session = new Session({
      paths,
      baseBranch: 'main',
      budget: 10,
      provider: 'claude',
      noPr: true,
      verbose: false,
      reset: false,
      io,
      entryPhase: 'interview',
      exitAfter: 'interview',
    });

    await session.start();

    // The LLM passed to InterviewLoop should be a ProgressLlmClient
    expect(capturedLlm).toBeDefined();
    expect(capturedLlm!.constructor.name).toBe('ProgressLlmClient');
  });

  it('shows design summary card instead of raw doc', async () => {
    const displayFn = vi.fn();
    const io: InterviewIO = {
      ask: vi.fn().mockResolvedValue('x'),
      display: displayFn,
    };

    const { Session } = await import('../../../src/cli/session.js');
    const session = new Session({
      paths,
      baseBranch: 'main',
      budget: 10,
      provider: 'claude',
      noPr: true,
      verbose: false,
      reset: false,
      io,
      entryPhase: 'interview',
      exitAfter: 'interview',
    });

    await session.start();

    // Should display design card (contains "Design Document" header)
    const displayed = displayFn.mock.calls.map((c: unknown[]) => c[0]).join('');
    expect(displayed).toContain('Design Document');
    expect(displayed).toContain('Saved to');
  });

  it('exits on [x] without continuing to plan phase', async () => {
    const io: InterviewIO = {
      ask: vi.fn().mockResolvedValue('x'),
      display: vi.fn(),
    };

    const { Session } = await import('../../../src/cli/session.js');
    const session = new Session({
      paths,
      baseBranch: 'main',
      budget: 10,
      provider: 'claude',
      noPr: true,
      verbose: false,
      reset: false,
      io,
      entryPhase: 'interview',
      // No exitAfter — would normally continue to plan
    });

    const result = await session.start();

    // Should have exited early
    expect(result).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd franken-orchestrator && npx vitest run tests/unit/cli/session-interview-ux.test.ts`
Expected: FAIL — ProgressLlmClient not wired, tests fail on assertions

**Step 3: Modify session.ts**

Replace the `runInterview()` method in `src/cli/session.ts`. Key changes:

1. Add imports at top of file:
```typescript
import { ProgressLlmClient } from '../adapters/progress-llm-client.js';
import { extractDesignSummary, formatDesignCard } from './design-summary.js';
import { isNoOpDesign } from './noop-detector.js';
```

2. Replace the `runInterview()` method (lines 80-119):
```typescript
  private async runInterview(): Promise<'continue' | 'exit'> {
    const { paths, io } = this.config;
    const { cliLlmAdapter } = await createCliDeps(this.buildDepOptions());

    const adapterLlm = new AdapterLlmClient(cliLlmAdapter);
    const progressLlm = new ProgressLlmClient(adapterLlm);

    let capturedDesignDoc = '';
    const capturingGraphBuilder = {
      build: async (intent: { goal: string }) => {
        capturedDesignDoc = intent.goal;
        return { tasks: [] };
      },
    };

    const capturingInterview = new InterviewLoop(progressLlm, io, capturingGraphBuilder);
    await capturingInterview.build({ goal: 'Gather requirements' });

    // Write design doc to disk
    const designPath = writeDesignDoc(paths, capturedDesignDoc);

    // Show summary card instead of raw doc
    const summary = extractDesignSummary(capturedDesignDoc);
    io.display(formatDesignCard({
      ...summary,
      filePath: designPath,
    }));

    // Context-aware approval gate
    const noOp = isNoOpDesign(capturedDesignDoc);

    while (true) {
      const header = noOp
        ? 'Analysis complete: no implementation changes needed.'
        : 'Design ready. What next?';

      const choice = await io.ask(
        `${header}\n\n  [c] Continue to planning phase${noOp ? ' anyway' : ''}\n  [r] Revise — give feedback to regenerate\n  [x] Exit\n`,
      );

      const normalized = choice.trim().toLowerCase();

      if (normalized === 'x' || normalized === 'exit') {
        return 'exit';
      }

      if (normalized === 'c' || normalized === 'continue') {
        return 'continue';
      }

      if (normalized === 'r' || normalized === 'revise') {
        const feedback = await io.ask('What would you like to change?');
        const revised = await progressLlm.complete(
          `Revise this design document based on the following feedback:\n\nFeedback: ${feedback}\n\nCurrent document:\n${capturedDesignDoc}`,
        );
        capturedDesignDoc = revised;
        const revisedPath = writeDesignDoc(paths, revised);
        const revisedSummary = extractDesignSummary(revised);
        io.display(formatDesignCard({
          ...revisedSummary,
          filePath: revisedPath,
        }));
        continue;
      }

      // Unrecognized input — re-prompt
      io.display('Please enter c, r, or x.');
    }
  }
```

3. Update `start()` to handle the new return value from `runInterview()`:
```typescript
  async start(): Promise<BeastResult | undefined> {
    const { entryPhase, exitAfter } = this.config;
    const phases: SessionPhase[] = ['interview', 'plan', 'execute'];
    const startIdx = phases.indexOf(entryPhase);

    for (let i = startIdx; i < phases.length; i++) {
      const phase = phases[i];

      if (phase === 'interview') {
        const decision = await this.runInterview();
        if (decision === 'exit') return undefined;
        if (exitAfter === 'interview') return undefined;
      }

      if (phase === 'plan') {
        await this.runPlan();
        if (exitAfter === 'plan') return undefined;
      }

      if (phase === 'execute') {
        return this.runExecute();
      }
    }

    return undefined;
  }
```

**Step 4: Run test to verify it passes**

Run: `cd franken-orchestrator && npx vitest run tests/unit/cli/session-interview-ux.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/cli/session.ts tests/unit/cli/session-interview-ux.test.ts
git commit -m "feat: wire ProgressLlmClient, summary card, and context-aware gate into interview flow"
```

---

### Task 6: Wire ProgressLlmClient into runPlan()

**Files:**
- Modify: `src/cli/session.ts:122-166` (runPlan method)

**Step 1: Write the failing test**

Add a test to `tests/unit/cli/session-plan.test.ts` (or a new file) that verifies the plan phase uses ProgressLlmClient:

```typescript
it('wraps LLM with ProgressLlmClient in plan phase', async () => {
  // Verify that LlmGraphBuilder receives a ProgressLlmClient
  // by checking that the LLM passed has spinner behavior
  // (This may be best verified via integration or by checking constructor name)
});
```

This is a light-touch change — just wrap `adapterLlm` with `ProgressLlmClient` in `runPlan()`:

**Step 2: Modify runPlan()**

In `runPlan()`, after creating `adapterLlm`, wrap it:

```typescript
const adapterLlm = new AdapterLlmClient(cliLlmAdapter);
const progressLlm = new ProgressLlmClient(adapterLlm, { label: 'Decomposing design...' });
const llmGraphBuilder = new LlmGraphBuilder(progressLlm);
```

And wrap the revision LLM call too (line ~158):

```typescript
onRevise: async (feedback) => {
  const revisedGraph = await llmGraphBuilder.build({
    goal: `${designContent}\n\nRevision feedback: ${feedback}`,
  });
```

(This already goes through `llmGraphBuilder` which uses `progressLlm`, so no extra wrapping needed for the revision path.)

**Step 3: Run full test suite**

Run: `cd franken-orchestrator && npx vitest run`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add src/cli/session.ts
git commit -m "feat: add progress spinner to plan decomposition phase"
```

---

### Task 7: Update existing tests and run full suite

**Files:**
- Modify: `tests/unit/cli/session.test.ts` (update mocks/assertions affected by runInterview changes)
- Modify: `tests/unit/interview-loop.test.ts` (no changes expected — InterviewLoop is unchanged)

**Step 1: Run full test suite to find breakages**

Run: `cd franken-orchestrator && npx vitest run`

**Step 2: Fix any failing tests**

The main expected breakage is in `tests/unit/cli/session.test.ts` — the test mocks `reviewLoop` which is no longer called by `runInterview()`. Update those tests to match the new approval gate flow (mock `io.ask` to return `'c'` or `'x'`).

**Step 3: Run full suite again**

Run: `cd franken-orchestrator && npx vitest run`
Expected: All PASS

**Step 4: Commit**

```bash
git add tests/
git commit -m "test: update session tests for new interview UX flow"
```

---

### Task 8: Typecheck and final verification

**Step 1: Run typecheck**

Run: `cd franken-orchestrator && npx tsc --noEmit`
Expected: No errors

**Step 2: Run full test suite one more time**

Run: `cd franken-orchestrator && npx vitest run`
Expected: All PASS

**Step 3: Push**

```bash
git push
```

Then update the gitlink in root frankenbeast repo:

```bash
cd /home/pfk/dev/frankenbeast
git add franken-orchestrator
git commit -m "chore(submodule): update orchestrator — interview loop UX improvements"
git push
```
