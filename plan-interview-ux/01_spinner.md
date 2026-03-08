# Chunk 01: CLI Spinner Utility

## Objective

Create a `Spinner` class for CLI progress feedback during LLM calls. Uses raw ANSI escape codes (no external deps — matches existing BeastLogger pattern). This is the foundation for the `ProgressLlmClient` decorator in chunk 02.

## Files

- **Create**: `franken-orchestrator/src/cli/spinner.ts`
- **Test**: `franken-orchestrator/tests/unit/cli/spinner.test.ts`

## Success Criteria

- [ ] `Spinner` class exported with `start(label)`, `stop(finalMessage?)`, `elapsed()` methods
- [ ] `SpinnerOptions` interface exported with `write?` and `silent?` properties
- [ ] `start()` immediately renders a spinner frame with the label
- [ ] `stop()` clears the spinner line; if `finalMessage` provided, prints it
- [ ] `stop()` without message just clears the line (no leftover text)
- [ ] `silent: true` suppresses all output (no calls to `write`)
- [ ] `elapsed()` returns milliseconds since `start()` was called
- [ ] All 5 tests pass
- [ ] `npx tsc --noEmit` passes in `franken-orchestrator/`

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run tests/unit/cli/spinner.test.ts
```

## Implementation Reference

**Test file** (`tests/unit/cli/spinner.test.ts`):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    await new Promise(r => setTimeout(r, 50));
    const elapsed = spinner.elapsed();
    expect(elapsed).toBeGreaterThanOrEqual(40);
    spinner.stop();
  });
});
```

**Implementation** (`src/cli/spinner.ts`):

```typescript
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

## Hardening Requirements

- Use `setInterval` for frame animation, NOT recursive `setTimeout`
- Default `write` targets `process.stderr` (not stdout — keeps stdout clean for piped output)
- `stop()` must always `clearInterval` before writing — prevents race conditions
- Do NOT add external dependencies (ora, cli-spinners, etc.)
- Spinner frames use simple ASCII (`|`, `/`, `-`, `\`) — no Unicode spinners
