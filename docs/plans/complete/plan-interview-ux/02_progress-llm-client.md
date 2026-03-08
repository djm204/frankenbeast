# Chunk 02: ProgressLlmClient Decorator

## Objective

Create a `ProgressLlmClient` that wraps any `ILlmClient` with spinner progress feedback and approximate token counting. This decorator eliminates dead air during LLM calls.

Depends on chunk 01 (Spinner).

## Files

- **Create**: `franken-orchestrator/src/adapters/progress-llm-client.ts`
- **Test**: `franken-orchestrator/tests/unit/adapters/progress-llm-client.test.ts`

## Success Criteria

- [ ] `ProgressLlmClient` class implements `ILlmClient`
- [ ] `ProgressLlmClientOptions` interface exported with `label?`, `silent?`, `write?`
- [ ] Delegates `complete()` to inner client and returns the exact result
- [ ] Shows spinner with configurable label (default: `"Thinking..."`)
- [ ] Stop message includes elapsed time and approximate token count
- [ ] Token estimation uses ~1.3 tokens/word heuristic
- [ ] If spinner `write` throws, `complete()` still returns the LLM result (resilient)
- [ ] All 5 tests pass
- [ ] `npx tsc --noEmit` passes in `franken-orchestrator/`

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run tests/unit/adapters/progress-llm-client.test.ts
```

## Implementation Reference

**Test file** (`tests/unit/adapters/progress-llm-client.test.ts`):

```typescript
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
    expect(writeSpy).toHaveBeenCalled();
    const allOutput = writeSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
    expect(allOutput).toContain('Generating...');
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
    const inner = mockLlm('This is a response with enough words to estimate token count for the test case here.');
    const client = new ProgressLlmClient(inner, { write: writeSpy });
    await client.complete('prompt');
    const allOutput = writeSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
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

**Implementation** (`src/adapters/progress-llm-client.ts`):

```typescript
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

function estimateTokens(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.round(words * 1.3);
}
```

## Hardening Requirements

- `ProgressLlmClient` must implement `ILlmClient` (same contract — drop-in replacement)
- If the inner `complete()` throws, spinner must be stopped BEFORE re-throwing
- If the spinner's `write` function throws, swallow the error and still return the LLM result — progress display is never worth breaking the pipeline
- Do NOT import or depend on any concrete LLM adapter — only `ILlmClient`
- `estimateTokens` is a private helper, not exported — it's a rough heuristic, not a public API
