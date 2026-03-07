# Chunk 05: HITM Review Loop

## Objective

Create `review-loop.ts` — a generic Human-In-The-Middle review loop used at each phase boundary. Displays file paths, asks the user if they want to proceed or change something, and feeds change requests back to a regeneration callback.

## Files

- **Create**: `franken-orchestrator/src/cli/review-loop.ts`
- **Create**: `franken-orchestrator/tests/unit/cli/review-loop.test.ts`
- **Modify**: `franken-orchestrator/src/index.ts` — export `reviewLoop`

## Key Reference Files

- `franken-orchestrator/src/planning/interview-loop.ts` — `InterviewIO` interface
- `docs/plans/2026-03-06-cli-e2e-design.md` — review loop spec

## Implementation

```typescript
import type { InterviewIO } from '../planning/interview-loop.js';

export interface ReviewLoopOptions {
  /** Paths to display to the user */
  filePaths: string[];
  /** Label for what was generated (e.g., "Design document", "Chunk files") */
  artifactLabel: string;
  /** Called when user wants changes. Receives user feedback, returns updated file paths. */
  onRevise: (feedback: string) => Promise<string[]>;
  /** InterviewIO for user interaction */
  io: InterviewIO;
  /** Maximum revision rounds before forcing proceed (default: 10) */
  maxRevisions?: number;
}

const PROCEED_PATTERNS = /^(y|yes|proceed|ok|lgtm|looks good|go|continue|ship it)$/i;

/**
 * Runs a HITM review loop.
 * Displays file paths, asks user to proceed or request changes.
 * Returns when user approves.
 */
export async function reviewLoop(options: ReviewLoopOptions): Promise<void> {
  const { artifactLabel, onRevise, io, maxRevisions = 10 } = options;
  let { filePaths } = options;

  for (let i = 0; i < maxRevisions; i++) {
    io.display(`\n${artifactLabel} written to:\n${filePaths.map((p) => `  ${p}`).join('\n')}\n`);

    const answer = await io.ask(
      'Would you like to proceed, or is there something you\'d like to change?',
    );
    const trimmed = answer.trim();

    if (PROCEED_PATTERNS.test(trimmed)) {
      return;
    }

    // User wants changes — pass feedback to regeneration callback
    filePaths = await onRevise(trimmed);
  }

  io.display(`Maximum revisions (${maxRevisions}) reached. Proceeding with current output.`);
}
```

## Test Cases

```typescript
import { describe, it, expect, vi } from 'vitest';
import { reviewLoop } from '../../../src/cli/review-loop.js';
import type { InterviewIO } from '../../../src/planning/interview-loop.js';

function mockIO(answers: string[]): InterviewIO {
  let idx = 0;
  return {
    ask: vi.fn(async () => answers[idx++] ?? 'yes'),
    display: vi.fn(),
  };
}

describe('reviewLoop', () => {
  it('proceeds immediately on "yes"', async () => {
    const io = mockIO(['yes']);
    const onRevise = vi.fn();
    await reviewLoop({
      filePaths: ['/path/design.md'],
      artifactLabel: 'Design document',
      onRevise,
      io,
    });
    expect(onRevise).not.toHaveBeenCalled();
    expect(io.display).toHaveBeenCalledWith(expect.stringContaining('/path/design.md'));
  });

  it('proceeds on "proceed"', async () => {
    const io = mockIO(['proceed']);
    const onRevise = vi.fn();
    await reviewLoop({ filePaths: ['/a.md'], artifactLabel: 'Test', onRevise, io });
    expect(onRevise).not.toHaveBeenCalled();
  });

  it('proceeds on "lgtm"', async () => {
    const io = mockIO(['lgtm']);
    const onRevise = vi.fn();
    await reviewLoop({ filePaths: ['/a.md'], artifactLabel: 'Test', onRevise, io });
    expect(onRevise).not.toHaveBeenCalled();
  });

  it('calls onRevise with user feedback then loops', async () => {
    const io = mockIO(['make it shorter', 'yes']);
    const onRevise = vi.fn(async () => ['/path/design-v2.md']);
    await reviewLoop({
      filePaths: ['/path/design.md'],
      artifactLabel: 'Design document',
      onRevise,
      io,
    });
    expect(onRevise).toHaveBeenCalledWith('make it shorter');
    expect(io.display).toHaveBeenCalledWith(expect.stringContaining('/path/design-v2.md'));
  });

  it('supports multiple revision rounds', async () => {
    const io = mockIO(['change A', 'change B', 'yes']);
    const onRevise = vi.fn(async () => ['/updated.md']);
    await reviewLoop({
      filePaths: ['/orig.md'],
      artifactLabel: 'Doc',
      onRevise,
      io,
    });
    expect(onRevise).toHaveBeenCalledTimes(2);
  });

  it('stops after maxRevisions', async () => {
    const io = mockIO(['change', 'change', 'change']);
    const onRevise = vi.fn(async () => ['/f.md']);
    await reviewLoop({
      filePaths: ['/f.md'],
      artifactLabel: 'Doc',
      onRevise,
      io,
      maxRevisions: 2,
    });
    expect(onRevise).toHaveBeenCalledTimes(2);
    expect(io.display).toHaveBeenCalledWith(expect.stringContaining('Maximum revisions'));
  });

  it('displays all file paths', async () => {
    const io = mockIO(['yes']);
    await reviewLoop({
      filePaths: ['/a.md', '/b.md', '/c.md'],
      artifactLabel: 'Chunks',
      onRevise: vi.fn(),
      io,
    });
    const displayed = (io.display as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(displayed).toContain('/a.md');
    expect(displayed).toContain('/b.md');
    expect(displayed).toContain('/c.md');
  });
});
```

## Success Criteria

- [ ] `reviewLoop()` displays file paths and artifact label
- [ ] Proceeds immediately on approval keywords (yes, proceed, lgtm, etc.)
- [ ] Calls `onRevise` with user feedback on non-approval answers
- [ ] Updates displayed paths from `onRevise` return value
- [ ] Supports multiple revision rounds
- [ ] Enforces `maxRevisions` limit
- [ ] All tests pass: `cd franken-orchestrator && npx vitest run tests/unit/cli/review-loop.test.ts`
- [ ] `npx tsc --noEmit` passes

## Verification Command

```bash
cd franken-orchestrator && npx vitest run tests/unit/cli/review-loop.test.ts && npx tsc --noEmit
```

## Hardening Requirements

- Approval detection is case-insensitive
- Trim whitespace from user input before matching
- `onRevise` is async — it may call an LLM
- `maxRevisions` default is generous (10) — this is a safety valve, not a normal limit
- Do NOT import readline or any I/O primitives — use `InterviewIO` only
- Use `.js` extensions in all import paths
