# Pluggable CLI Provider Registry — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace hardcoded `'claude' | 'codex'` provider dispatch with a pluggable `ICliProvider` registry, add Gemini CLI and Aider as built-in providers, and add config-file-based provider configuration.

**Architecture:** Extract provider-specific logic (arg building, output normalization, env filtering, rate-limit detection) into self-contained `ICliProvider` implementations. A `ProviderRegistry` maps names to implementations. RalphLoop, CliLlmAdapter, and dep-factory consume the registry instead of hardcoded if/else. Config schema gains a `providers` section.

**Tech Stack:** TypeScript (strict ESM), Vitest, Zod, Node.js child_process

**Design Doc:** `docs/plans/2026-03-07-pluggable-cli-providers-design.md`

---

### Task 1: ICliProvider Interface + ProviderRegistry

**Files:**
- Create: `franken-orchestrator/src/skills/providers/cli-provider.ts`
- Test: `franken-orchestrator/tests/unit/skills/providers/cli-provider.test.ts`

**Step 1: Write the failing test**

```typescript
// franken-orchestrator/tests/unit/skills/providers/cli-provider.test.ts
import { describe, it, expect } from 'vitest';
import { ProviderRegistry } from '../../../../src/skills/providers/cli-provider.js';
import type { ICliProvider, ProviderOpts } from '../../../../src/skills/providers/cli-provider.js';

function stubProvider(name: string): ICliProvider {
  return {
    name,
    command: name,
    buildArgs: (_prompt: string, _opts: ProviderOpts) => [name],
    normalizeOutput: (raw: string) => raw,
    estimateTokens: (raw: string) => Math.ceil(raw.length / 4),
    isRateLimited: () => false,
    parseRetryAfter: () => null,
    filterEnv: (env: Record<string, string>) => env,
    supportsStreamJson: () => false,
  };
}

describe('ProviderRegistry', () => {
  it('registers and retrieves a provider', () => {
    const registry = new ProviderRegistry();
    const provider = stubProvider('test');
    registry.register(provider);
    expect(registry.get('test')).toBe(provider);
  });

  it('throws on unknown provider', () => {
    const registry = new ProviderRegistry();
    expect(() => registry.get('nope')).toThrow(/Unknown provider "nope"/);
  });

  it('returns registered names', () => {
    const registry = new ProviderRegistry();
    registry.register(stubProvider('alpha'));
    registry.register(stubProvider('beta'));
    expect(registry.names()).toEqual(['alpha', 'beta']);
  });

  it('has() returns correct boolean', () => {
    const registry = new ProviderRegistry();
    registry.register(stubProvider('exists'));
    expect(registry.has('exists')).toBe(true);
    expect(registry.has('missing')).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd franken-orchestrator && npx vitest run tests/unit/skills/providers/cli-provider.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// franken-orchestrator/src/skills/providers/cli-provider.ts
export interface ProviderOpts {
  maxTurns?: number;
  timeoutMs?: number;
  workingDir?: string;
  model?: string;
  extraArgs?: string[];
  commandOverride?: string;
}

export interface ICliProvider {
  readonly name: string;
  readonly command: string;
  buildArgs(prompt: string, opts: ProviderOpts): string[];
  normalizeOutput(raw: string): string;
  estimateTokens(raw: string): number;
  isRateLimited(stderr: string, stdout: string): boolean;
  parseRetryAfter(stderr: string, stdout: string): number | null;
  filterEnv(env: Record<string, string>): Record<string, string>;
  supportsStreamJson(): boolean;
}

export class ProviderRegistry {
  private readonly providers = new Map<string, ICliProvider>();

  register(provider: ICliProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): ICliProvider {
    const p = this.providers.get(name);
    if (!p) {
      throw new Error(`Unknown provider "${name}". Available: ${this.names().join(', ')}`);
    }
    return p;
  }

  has(name: string): boolean {
    return this.providers.has(name);
  }

  names(): string[] {
    return [...this.providers.keys()];
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd franken-orchestrator && npx vitest run tests/unit/skills/providers/cli-provider.test.ts`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
cd franken-orchestrator
git add src/skills/providers/cli-provider.ts tests/unit/skills/providers/cli-provider.test.ts
git commit -m "feat: add ICliProvider interface and ProviderRegistry"
```

---

### Task 2: ClaudeProvider

**Files:**
- Create: `franken-orchestrator/src/skills/providers/claude-provider.ts`
- Test: `franken-orchestrator/tests/unit/skills/providers/claude-provider.test.ts`

**Step 1: Write the failing test**

```typescript
// franken-orchestrator/tests/unit/skills/providers/claude-provider.test.ts
import { describe, it, expect } from 'vitest';
import { ClaudeProvider } from '../../../../src/skills/providers/claude-provider.js';

describe('ClaudeProvider', () => {
  const provider = new ClaudeProvider();

  it('has name "claude" and command "claude"', () => {
    expect(provider.name).toBe('claude');
    expect(provider.command).toBe('claude');
  });

  it('builds correct args with default opts', () => {
    const args = provider.buildArgs('Do something', {});
    expect(args).toContain('--print');
    expect(args).toContain('--dangerously-skip-permissions');
    expect(args).toContain('--output-format');
    expect(args[args.indexOf('--output-format') + 1]).toBe('stream-json');
    expect(args).toContain('--verbose');
    expect(args).toContain('--disable-slash-commands');
    expect(args).toContain('--no-session-persistence');
    expect(args).toContain('--plugin-dir');
    expect(args[args.indexOf('--plugin-dir') + 1]).toBe('/dev/null');
    expect(args).toContain('--');
    expect(args[args.length - 1]).toBe('Do something');
  });

  it('includes --max-turns when opts.maxTurns is set', () => {
    const args = provider.buildArgs('prompt', { maxTurns: 5 });
    expect(args).toContain('--max-turns');
    expect(args[args.indexOf('--max-turns') + 1]).toBe('5');
  });

  it('appends extraArgs', () => {
    const args = provider.buildArgs('prompt', { extraArgs: ['--custom', 'val'] });
    expect(args).toContain('--custom');
    expect(args).toContain('val');
  });

  it('supportsStreamJson returns true', () => {
    expect(provider.supportsStreamJson()).toBe(true);
  });

  it('filters out all CLAUDE* env vars', () => {
    const env = {
      CLAUDE_CODE_ENTRYPOINT: 'vscode',
      CLAUDE_SESSION_ID: 'abc',
      CLAUDECODE_PLUGIN: 'x',
      PATH: '/usr/bin',
      HOME: '/home/test',
    };
    const filtered = provider.filterEnv(env);
    expect(filtered).not.toHaveProperty('CLAUDE_CODE_ENTRYPOINT');
    expect(filtered).not.toHaveProperty('CLAUDE_SESSION_ID');
    expect(filtered).not.toHaveProperty('CLAUDECODE_PLUGIN');
    expect(filtered.PATH).toBe('/usr/bin');
    expect(filtered.HOME).toBe('/home/test');
  });

  it('detects rate limit patterns in stderr', () => {
    expect(provider.isRateLimited('429 Too Many Requests', '')).toBe(true);
    expect(provider.isRateLimited('rate limit exceeded', '')).toBe(true);
    expect(provider.isRateLimited('', '')).toBe(false);
    expect(provider.isRateLimited('', 'rate limit in stdout should be ignored')).toBe(false);
  });

  it('parses retry-after from stderr', () => {
    expect(provider.parseRetryAfter('retry-after: 30', '')).toBe(30_000);
    expect(provider.parseRetryAfter('try again in 2 minutes', '')).toBe(120_000);
    expect(provider.parseRetryAfter('no info here', '')).toBeNull();
  });

  it('estimates tokens as length / 4', () => {
    const output = 'x'.repeat(100);
    expect(provider.estimateTokens(output)).toBe(25);
  });

  it('normalizeOutput passes through (stream-json handled by StreamLineBuffer)', () => {
    expect(provider.normalizeOutput('raw text')).toBe('raw text');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd franken-orchestrator && npx vitest run tests/unit/skills/providers/claude-provider.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Extract logic from `ralph-loop.ts:114-125` (buildClaudeArgs), `ralph-loop.ts:4-11` (rate limit patterns), `ralph-loop.ts:14-58` (parseResetTime), and `ralph-loop.ts:258-268` (env filtering).

```typescript
// franken-orchestrator/src/skills/providers/claude-provider.ts
import type { ICliProvider, ProviderOpts } from './cli-provider.js';

const RATE_LIMIT_PATTERNS =
  /rate.?limit|429|too many requests|retry.?after|overloaded|capacity|temporarily unavailable|out of extra usage|usage limit|resets?\s+\d|resets?\s+in\s+\d+\s*s/i;

export class ClaudeProvider implements ICliProvider {
  readonly name = 'claude';
  readonly command = 'claude';

  buildArgs(prompt: string, opts: ProviderOpts): string[] {
    const args = [
      '--print', '--dangerously-skip-permissions',
      '--output-format', 'stream-json',
      '--verbose',
      '--disable-slash-commands',
      '--no-session-persistence',
      '--plugin-dir', '/dev/null',
    ];
    if (opts.maxTurns !== undefined) {
      args.push('--max-turns', String(opts.maxTurns));
    }
    if (opts.extraArgs) {
      args.push(...opts.extraArgs);
    }
    args.push('--', prompt);
    return args;
  }

  normalizeOutput(raw: string): string {
    // Stream-json normalization handled by StreamLineBuffer in RalphLoop
    return raw;
  }

  estimateTokens(raw: string): number {
    return Math.ceil(raw.length / 4);
  }

  isRateLimited(stderr: string, _stdout: string): boolean {
    return RATE_LIMIT_PATTERNS.test(stderr);
  }

  parseRetryAfter(stderr: string, stdout: string): number | null {
    const combined = `${stderr}\n${stdout}`;

    const retryAfterMatch = combined.match(/retry.?after:?\s*(\d+)\s*s?/i);
    if (retryAfterMatch?.[1]) return parseInt(retryAfterMatch[1], 10) * 1000;

    const minutesMatch = combined.match(/try again in (\d+) minute/i);
    if (minutesMatch?.[1]) return parseInt(minutesMatch[1], 10) * 60_000;

    const secondsMatch = combined.match(/try again in (\d+) second/i);
    if (secondsMatch?.[1]) return parseInt(secondsMatch[1], 10) * 1000;

    const isoMatch = combined.match(/resets?\s+(?:at\s+)?(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/i);
    if (isoMatch?.[1]) {
      const resetAt = new Date(isoMatch[1]).getTime();
      const now = Date.now();
      if (resetAt > now) return resetAt - now;
    }

    const epochMatch = combined.match(/x-ratelimit-reset:\s*(\d{10,13})/i);
    if (epochMatch?.[1]) {
      const epoch = parseInt(epochMatch[1], 10);
      const resetMs = epoch > 1e12 ? epoch : epoch * 1000;
      const now = Date.now();
      if (resetMs > now) return resetMs - now;
    }

    const resetsInMatch = combined.match(/resets?\s+in\s+(\d+)\s*s/i);
    if (resetsInMatch?.[1]) return parseInt(resetsInMatch[1], 10) * 1000;

    return null;
  }

  filterEnv(env: Record<string, string>): Record<string, string> {
    const filtered = { ...env };
    for (const key of Object.keys(filtered)) {
      if (key.startsWith('CLAUDE')) {
        delete filtered[key];
      }
    }
    return filtered;
  }

  supportsStreamJson(): boolean {
    return true;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd franken-orchestrator && npx vitest run tests/unit/skills/providers/claude-provider.test.ts`
Expected: PASS (10 tests)

**Step 5: Commit**

```bash
cd franken-orchestrator
git add src/skills/providers/claude-provider.ts tests/unit/skills/providers/claude-provider.test.ts
git commit -m "feat: add ClaudeProvider implementing ICliProvider"
```

---

### Task 3: CodexProvider

**Files:**
- Create: `franken-orchestrator/src/skills/providers/codex-provider.ts`
- Test: `franken-orchestrator/tests/unit/skills/providers/codex-provider.test.ts`

**Step 1: Write the failing test**

```typescript
// franken-orchestrator/tests/unit/skills/providers/codex-provider.test.ts
import { describe, it, expect } from 'vitest';
import { CodexProvider } from '../../../../src/skills/providers/codex-provider.js';

describe('CodexProvider', () => {
  const provider = new CodexProvider();

  it('has name "codex" and command "codex"', () => {
    expect(provider.name).toBe('codex');
    expect(provider.command).toBe('codex');
  });

  it('builds correct args', () => {
    const args = provider.buildArgs('Do something', {});
    expect(args).toEqual(['exec', '--full-auto', '--json', '--color', 'never', 'Do something']);
  });

  it('appends extraArgs', () => {
    const args = provider.buildArgs('prompt', { extraArgs: ['--timeout', '60'] });
    expect(args).toContain('--timeout');
  });

  it('supportsStreamJson returns false', () => {
    expect(provider.supportsStreamJson()).toBe(false);
  });

  it('filterEnv is a no-op (returns copy)', () => {
    const env = { PATH: '/usr/bin', CODEX_VAR: 'x' };
    const filtered = provider.filterEnv(env);
    expect(filtered).toEqual(env);
    expect(filtered).not.toBe(env); // different reference
  });

  it('detects codex rate limit patterns', () => {
    expect(provider.isRateLimited('resets in 30s', '')).toBe(true);
    expect(provider.isRateLimited('429 Too Many Requests', '')).toBe(true);
    expect(provider.isRateLimited('', '')).toBe(false);
  });

  it('parses resets-in pattern', () => {
    expect(provider.parseRetryAfter('resets in 30s', '')).toBe(30_000);
    expect(provider.parseRetryAfter('no info', '')).toBeNull();
  });

  it('estimates tokens as length / 16', () => {
    const output = 'x'.repeat(160);
    expect(provider.estimateTokens(output)).toBe(10);
  });

  it('normalizes JSON output to plain text', () => {
    const jsonOutput = [
      '{"type":"event","content":[{"type":"output_text","text":"Hello world"}]}',
      '{"type":"event","content":[{"type":"output_text","text":"Done"}]}',
    ].join('\n');
    const normalized = provider.normalizeOutput(jsonOutput);
    expect(normalized).toContain('Hello world');
    expect(normalized).toContain('Done');
  });

  it('preserves plain text output when not JSON', () => {
    expect(provider.normalizeOutput('plain text output')).toBe('plain text output');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd franken-orchestrator && npx vitest run tests/unit/skills/providers/codex-provider.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Extract logic from `ralph-loop.ts:127-129` (buildCodexArgs) and `ralph-loop.ts:223-246` (normalizeCodexOutput).

```typescript
// franken-orchestrator/src/skills/providers/codex-provider.ts
import type { ICliProvider, ProviderOpts } from './cli-provider.js';

const RATE_LIMIT_PATTERNS =
  /rate.?limit|429|too many requests|overloaded|resets?\s+in\s+\d+\s*s/i;

function tryExtractTextFromNode(node: unknown, out: string[]): void {
  if (typeof node === 'string') {
    if (node.trim().length > 0) out.push(node);
    return;
  }
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) tryExtractTextFromNode(item, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  for (const key of ['text', 'output_text', 'output']) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim().length > 0) out.push(v);
  }
  for (const key of ['delta', 'content', 'parts', 'data', 'result', 'response', 'message', 'content_block']) {
    if (obj[key] !== undefined) tryExtractTextFromNode(obj[key], out);
  }
}

export class CodexProvider implements ICliProvider {
  readonly name = 'codex';
  readonly command = 'codex';

  buildArgs(prompt: string, opts: ProviderOpts): string[] {
    const args = ['exec', '--full-auto', '--json', '--color', 'never', prompt];
    if (opts.extraArgs) args.push(...opts.extraArgs);
    return args;
  }

  normalizeOutput(raw: string): string {
    const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const extracted: string[] = [];
    let parsedJsonLines = 0;
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as unknown;
        parsedJsonLines++;
        tryExtractTextFromNode(parsed, extracted);
      } catch {
        extracted.push(line);
      }
    }
    if (parsedJsonLines > 0 && extracted.length === 0) return raw;
    return extracted.join('\n').trim();
  }

  estimateTokens(raw: string): number {
    return Math.ceil(raw.length / 16);
  }

  isRateLimited(stderr: string, _stdout: string): boolean {
    return RATE_LIMIT_PATTERNS.test(stderr);
  }

  parseRetryAfter(stderr: string, stdout: string): number | null {
    const combined = `${stderr}\n${stdout}`;
    const match = combined.match(/resets?\s+in\s+(\d+)\s*s/i);
    if (match?.[1]) return parseInt(match[1], 10) * 1000;
    return null;
  }

  filterEnv(env: Record<string, string>): Record<string, string> {
    return { ...env };
  }

  supportsStreamJson(): boolean {
    return false;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd franken-orchestrator && npx vitest run tests/unit/skills/providers/codex-provider.test.ts`
Expected: PASS (10 tests)

**Step 5: Commit**

```bash
cd franken-orchestrator
git add src/skills/providers/codex-provider.ts tests/unit/skills/providers/codex-provider.test.ts
git commit -m "feat: add CodexProvider implementing ICliProvider"
```

---

### Task 4: GeminiProvider

**Files:**
- Create: `franken-orchestrator/src/skills/providers/gemini-provider.ts`
- Test: `franken-orchestrator/tests/unit/skills/providers/gemini-provider.test.ts`

**Step 1: Write the failing test**

```typescript
// franken-orchestrator/tests/unit/skills/providers/gemini-provider.test.ts
import { describe, it, expect } from 'vitest';
import { GeminiProvider } from '../../../../src/skills/providers/gemini-provider.js';

describe('GeminiProvider', () => {
  const provider = new GeminiProvider();

  it('has name "gemini" and command "gemini"', () => {
    expect(provider.name).toBe('gemini');
    expect(provider.command).toBe('gemini');
  });

  it('builds correct args with default opts', () => {
    const args = provider.buildArgs('Do something', {});
    expect(args).toContain('-p');
    expect(args).toContain('--yolo');
    expect(args).toContain('--output-format');
    expect(args[args.indexOf('--output-format') + 1]).toBe('stream-json');
    expect(args).toContain('Do something');
  });

  it('includes -m when opts.model is set', () => {
    const args = provider.buildArgs('prompt', { model: 'gemini-2.5-pro' });
    expect(args).toContain('-m');
    expect(args[args.indexOf('-m') + 1]).toBe('gemini-2.5-pro');
  });

  it('appends extraArgs', () => {
    const args = provider.buildArgs('prompt', { extraArgs: ['--sandbox'] });
    expect(args).toContain('--sandbox');
  });

  it('supportsStreamJson returns true', () => {
    expect(provider.supportsStreamJson()).toBe(true);
  });

  it('filters out GEMINI* and GOOGLE* env vars', () => {
    const env = {
      GEMINI_API_KEY: 'key1',
      GOOGLE_API_KEY: 'key2',
      GOOGLE_CLOUD_PROJECT: 'proj',
      PATH: '/usr/bin',
      HOME: '/home/test',
    };
    const filtered = provider.filterEnv(env);
    expect(filtered).not.toHaveProperty('GEMINI_API_KEY');
    expect(filtered).not.toHaveProperty('GOOGLE_API_KEY');
    expect(filtered).not.toHaveProperty('GOOGLE_CLOUD_PROJECT');
    expect(filtered.PATH).toBe('/usr/bin');
  });

  it('detects RESOURCE_EXHAUSTED rate limit', () => {
    expect(provider.isRateLimited('RESOURCE_EXHAUSTED', '')).toBe(true);
    expect(provider.isRateLimited('429', '')).toBe(true);
    expect(provider.isRateLimited('', '')).toBe(false);
  });

  it('parses retry delay from RESOURCE_EXHAUSTED response', () => {
    expect(provider.parseRetryAfter('retry-after: 60', '')).toBe(60_000);
    expect(provider.parseRetryAfter('no info', '')).toBeNull();
  });

  it('estimates tokens as length / 4', () => {
    expect(provider.estimateTokens('x'.repeat(100))).toBe(25);
  });

  it('normalizeOutput passes through (stream-json handled by StreamLineBuffer)', () => {
    expect(provider.normalizeOutput('raw')).toBe('raw');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd franken-orchestrator && npx vitest run tests/unit/skills/providers/gemini-provider.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// franken-orchestrator/src/skills/providers/gemini-provider.ts
import type { ICliProvider, ProviderOpts } from './cli-provider.js';

const RATE_LIMIT_PATTERNS = /RESOURCE_EXHAUSTED|429|too many requests|rate.?limit/i;

export class GeminiProvider implements ICliProvider {
  readonly name = 'gemini';
  readonly command = 'gemini';

  buildArgs(prompt: string, opts: ProviderOpts): string[] {
    const args = ['-p', prompt, '--yolo', '--output-format', 'stream-json'];
    if (opts.model) {
      args.push('-m', opts.model);
    }
    if (opts.extraArgs) {
      args.push(...opts.extraArgs);
    }
    return args;
  }

  normalizeOutput(raw: string): string {
    return raw;
  }

  estimateTokens(raw: string): number {
    return Math.ceil(raw.length / 4);
  }

  isRateLimited(stderr: string, _stdout: string): boolean {
    return RATE_LIMIT_PATTERNS.test(stderr);
  }

  parseRetryAfter(stderr: string, stdout: string): number | null {
    const combined = `${stderr}\n${stdout}`;
    const match = combined.match(/retry.?after:?\s*(\d+)\s*s?/i);
    if (match?.[1]) return parseInt(match[1], 10) * 1000;
    return null;
  }

  filterEnv(env: Record<string, string>): Record<string, string> {
    const filtered = { ...env };
    for (const key of Object.keys(filtered)) {
      if (key.startsWith('GEMINI') || key.startsWith('GOOGLE')) {
        delete filtered[key];
      }
    }
    return filtered;
  }

  supportsStreamJson(): boolean {
    return true;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd franken-orchestrator && npx vitest run tests/unit/skills/providers/gemini-provider.test.ts`
Expected: PASS (10 tests)

**Step 5: Commit**

```bash
cd franken-orchestrator
git add src/skills/providers/gemini-provider.ts tests/unit/skills/providers/gemini-provider.test.ts
git commit -m "feat: add GeminiProvider implementing ICliProvider"
```

---

### Task 5: AiderProvider

**Files:**
- Create: `franken-orchestrator/src/skills/providers/aider-provider.ts`
- Test: `franken-orchestrator/tests/unit/skills/providers/aider-provider.test.ts`

**Step 1: Write the failing test**

```typescript
// franken-orchestrator/tests/unit/skills/providers/aider-provider.test.ts
import { describe, it, expect } from 'vitest';
import { AiderProvider } from '../../../../src/skills/providers/aider-provider.js';

describe('AiderProvider', () => {
  const provider = new AiderProvider();

  it('has name "aider" and command "aider"', () => {
    expect(provider.name).toBe('aider');
    expect(provider.command).toBe('aider');
  });

  it('builds correct args with default opts', () => {
    const args = provider.buildArgs('Do something', {});
    expect(args).toContain('--message');
    expect(args[args.indexOf('--message') + 1]).toBe('Do something');
    expect(args).toContain('--yes-always');
    expect(args).toContain('--no-stream');
    expect(args).toContain('--no-auto-commits');
  });

  it('includes --model when opts.model is set', () => {
    const args = provider.buildArgs('prompt', { model: 'anthropic/claude-sonnet-4-20250514' });
    expect(args).toContain('--model');
    expect(args[args.indexOf('--model') + 1]).toBe('anthropic/claude-sonnet-4-20250514');
  });

  it('appends extraArgs', () => {
    const args = provider.buildArgs('prompt', { extraArgs: ['--no-git'] });
    expect(args).toContain('--no-git');
  });

  it('supportsStreamJson returns false', () => {
    expect(provider.supportsStreamJson()).toBe(false);
  });

  it('filters out AIDER* env vars', () => {
    const env = {
      AIDER_MODEL: 'gpt-4',
      AIDER_YES_ALWAYS: 'true',
      PATH: '/usr/bin',
      HOME: '/home/test',
    };
    const filtered = provider.filterEnv(env);
    expect(filtered).not.toHaveProperty('AIDER_MODEL');
    expect(filtered).not.toHaveProperty('AIDER_YES_ALWAYS');
    expect(filtered.PATH).toBe('/usr/bin');
  });

  it('isRateLimited always returns false (LiteLLM handles retries)', () => {
    expect(provider.isRateLimited('429 error', '')).toBe(false);
    expect(provider.isRateLimited('rate limit', '')).toBe(false);
  });

  it('parseRetryAfter always returns null', () => {
    expect(provider.parseRetryAfter('anything', '')).toBeNull();
  });

  it('estimates tokens as length / 4', () => {
    expect(provider.estimateTokens('x'.repeat(100))).toBe(25);
  });

  it('normalizeOutput strips ANSI codes', () => {
    const ansi = '\x1b[32mgreen text\x1b[0m normal';
    expect(provider.normalizeOutput(ansi)).toBe('green text normal');
  });

  it('normalizeOutput passes through clean text', () => {
    expect(provider.normalizeOutput('clean output')).toBe('clean output');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd franken-orchestrator && npx vitest run tests/unit/skills/providers/aider-provider.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// franken-orchestrator/src/skills/providers/aider-provider.ts
import type { ICliProvider, ProviderOpts } from './cli-provider.js';

// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1b\[[0-9;]*m/g;

export class AiderProvider implements ICliProvider {
  readonly name = 'aider';
  readonly command = 'aider';

  buildArgs(prompt: string, opts: ProviderOpts): string[] {
    const args = ['--message', prompt, '--yes-always', '--no-stream', '--no-auto-commits'];
    if (opts.model) {
      args.push('--model', opts.model);
    }
    if (opts.extraArgs) {
      args.push(...opts.extraArgs);
    }
    return args;
  }

  normalizeOutput(raw: string): string {
    return raw.replace(ANSI_REGEX, '');
  }

  estimateTokens(raw: string): number {
    return Math.ceil(raw.length / 4);
  }

  isRateLimited(_stderr: string, _stdout: string): boolean {
    // Aider uses LiteLLM which handles rate limit retries internally
    return false;
  }

  parseRetryAfter(_stderr: string, _stdout: string): number | null {
    return null;
  }

  filterEnv(env: Record<string, string>): Record<string, string> {
    const filtered = { ...env };
    for (const key of Object.keys(filtered)) {
      if (key.startsWith('AIDER')) {
        delete filtered[key];
      }
    }
    return filtered;
  }

  supportsStreamJson(): boolean {
    return false;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd franken-orchestrator && npx vitest run tests/unit/skills/providers/aider-provider.test.ts`
Expected: PASS (11 tests)

**Step 5: Commit**

```bash
cd franken-orchestrator
git add src/skills/providers/aider-provider.ts tests/unit/skills/providers/aider-provider.test.ts
git commit -m "feat: add AiderProvider implementing ICliProvider"
```

---

### Task 6: createDefaultRegistry + barrel export

**Files:**
- Modify: `franken-orchestrator/src/skills/providers/cli-provider.ts`
- Create: `franken-orchestrator/src/skills/providers/index.ts`
- Test: `franken-orchestrator/tests/unit/skills/providers/cli-provider.test.ts` (add tests)

**Step 1: Add failing test for createDefaultRegistry**

Append to the existing `cli-provider.test.ts`:

```typescript
import { createDefaultRegistry } from '../../../../src/skills/providers/cli-provider.js';

describe('createDefaultRegistry', () => {
  it('includes all 4 built-in providers', () => {
    const registry = createDefaultRegistry();
    expect(registry.names()).toEqual(['claude', 'codex', 'gemini', 'aider']);
  });

  it('returns a new instance each call', () => {
    const a = createDefaultRegistry();
    const b = createDefaultRegistry();
    expect(a).not.toBe(b);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd franken-orchestrator && npx vitest run tests/unit/skills/providers/cli-provider.test.ts`
Expected: FAIL — createDefaultRegistry not exported

**Step 3: Implement createDefaultRegistry and index.ts**

Add to bottom of `cli-provider.ts`:

```typescript
import { ClaudeProvider } from './claude-provider.js';
import { CodexProvider } from './codex-provider.js';
import { GeminiProvider } from './gemini-provider.js';
import { AiderProvider } from './aider-provider.js';

export function createDefaultRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register(new ClaudeProvider());
  registry.register(new CodexProvider());
  registry.register(new GeminiProvider());
  registry.register(new AiderProvider());
  return registry;
}
```

Create barrel:

```typescript
// franken-orchestrator/src/skills/providers/index.ts
export { ProviderRegistry, createDefaultRegistry } from './cli-provider.js';
export type { ICliProvider, ProviderOpts } from './cli-provider.js';
export { ClaudeProvider } from './claude-provider.js';
export { CodexProvider } from './codex-provider.js';
export { GeminiProvider } from './gemini-provider.js';
export { AiderProvider } from './aider-provider.js';
```

**Step 4: Run test to verify it passes**

Run: `cd franken-orchestrator && npx vitest run tests/unit/skills/providers/cli-provider.test.ts`
Expected: PASS (6 tests)

**Step 5: Commit**

```bash
cd franken-orchestrator
git add src/skills/providers/ tests/unit/skills/providers/cli-provider.test.ts
git commit -m "feat: add createDefaultRegistry and barrel export for providers"
```

---

### Task 7: Add ProvidersConfig to OrchestratorConfigSchema

**Files:**
- Modify: `franken-orchestrator/src/config/orchestrator-config.ts:1-28`
- Test: `franken-orchestrator/tests/unit/config/orchestrator-config.test.ts` (create or extend)

**Step 1: Write the failing test**

```typescript
// franken-orchestrator/tests/unit/config/orchestrator-config-providers.test.ts
import { describe, it, expect } from 'vitest';
import { OrchestratorConfigSchema } from '../../../src/config/orchestrator-config.js';

describe('OrchestratorConfigSchema — providers section', () => {
  it('provides sensible defaults when providers is omitted', () => {
    const config = OrchestratorConfigSchema.parse({});
    expect(config.providers).toEqual({
      default: 'claude',
      fallbackChain: ['claude', 'codex'],
      overrides: {},
    });
  });

  it('accepts a full providers section', () => {
    const config = OrchestratorConfigSchema.parse({
      providers: {
        default: 'gemini',
        fallbackChain: ['gemini', 'claude', 'aider'],
        overrides: {
          gemini: { model: 'gemini-2.5-pro' },
          aider: { command: '/usr/local/bin/aider', model: 'anthropic/claude-sonnet-4-20250514' },
          claude: { extraArgs: ['--max-turns', '5'] },
        },
      },
    });
    expect(config.providers.default).toBe('gemini');
    expect(config.providers.fallbackChain).toEqual(['gemini', 'claude', 'aider']);
    expect(config.providers.overrides.gemini?.model).toBe('gemini-2.5-pro');
    expect(config.providers.overrides.aider?.command).toBe('/usr/local/bin/aider');
    expect(config.providers.overrides.claude?.extraArgs).toEqual(['--max-turns', '5']);
  });

  it('partially overrides providers (merges with defaults)', () => {
    const config = OrchestratorConfigSchema.parse({
      providers: { default: 'aider' },
    });
    expect(config.providers.default).toBe('aider');
    expect(config.providers.fallbackChain).toEqual(['claude', 'codex']);
    expect(config.providers.overrides).toEqual({});
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd franken-orchestrator && npx vitest run tests/unit/config/orchestrator-config-providers.test.ts`
Expected: FAIL — `providers` not on config

**Step 3: Add ProvidersConfig to the schema**

Edit `franken-orchestrator/src/config/orchestrator-config.ts` to add:

```typescript
// After existing imports, before OrchestratorConfigSchema:
const ProviderOverrideSchema = z.object({
  command: z.string().optional(),
  model: z.string().optional(),
  extraArgs: z.array(z.string()).optional(),
});

const ProvidersConfigSchema = z.object({
  default: z.string().default('claude'),
  fallbackChain: z.array(z.string()).default(['claude', 'codex']),
  overrides: z.record(z.string(), ProviderOverrideSchema).default({}),
});

// Add to OrchestratorConfigSchema:
  providers: ProvidersConfigSchema.default({}),
```

**Step 4: Run test to verify it passes**

Run: `cd franken-orchestrator && npx vitest run tests/unit/config/orchestrator-config-providers.test.ts`
Expected: PASS (3 tests)

**Step 5: Run existing config tests to check no regressions**

Run: `cd franken-orchestrator && npx vitest run tests/unit/config/`
Expected: All PASS

**Step 6: Commit**

```bash
cd franken-orchestrator
git add src/config/orchestrator-config.ts tests/unit/config/orchestrator-config-providers.test.ts
git commit -m "feat: add providers section to OrchestratorConfigSchema"
```

---

### Task 8: Update CLI args — --providers flag + string provider type

**Files:**
- Modify: `franken-orchestrator/src/cli/args.ts:1-107`
- Test: Extend existing args tests or create `franken-orchestrator/tests/unit/cli/args-providers.test.ts`

**Step 1: Write the failing test**

```typescript
// franken-orchestrator/tests/unit/cli/args-providers.test.ts
import { describe, it, expect } from 'vitest';
import { parseArgs } from '../../../src/cli/args.js';

describe('parseArgs — provider support', () => {
  it('--provider accepts any string (not just claude|codex)', () => {
    const args = parseArgs(['--provider', 'gemini']);
    expect(args.provider).toBe('gemini');
  });

  it('--provider defaults to claude', () => {
    const args = parseArgs([]);
    expect(args.provider).toBe('claude');
  });

  it('--providers parses comma-separated fallback chain', () => {
    const args = parseArgs(['--providers', 'claude,gemini,aider']);
    expect(args.providers).toEqual(['claude', 'gemini', 'aider']);
  });

  it('--providers is undefined when not specified', () => {
    const args = parseArgs([]);
    expect(args.providers).toBeUndefined();
  });

  it('--provider normalizes to lowercase', () => {
    const args = parseArgs(['--provider', 'GEMINI']);
    expect(args.provider).toBe('gemini');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd franken-orchestrator && npx vitest run tests/unit/cli/args-providers.test.ts`
Expected: FAIL — provider still union type / providers not recognized

**Step 3: Update args.ts**

Key changes to `franken-orchestrator/src/cli/args.ts`:
1. Change `CliArgs.provider` type from `'claude' | 'codex'` to `string` (line 10)
2. Add `providers?: string[]` to `CliArgs` (after line 10)
3. Add `providers: { type: 'string' }` to parseArgs options (after line 75)
4. Change provider assignment (line 88-89) from hardcoded fallback to: `const provider = providerRaw ?? 'claude';`
5. Parse providers: `const providersRaw = values.providers; const providers = providersRaw ? providersRaw.split(',').map(p => p.trim().toLowerCase()) : undefined;`
6. Add `providers` to return object
7. Update USAGE string to show all providers and `--providers` flag

**Step 4: Run test to verify it passes**

Run: `cd franken-orchestrator && npx vitest run tests/unit/cli/args-providers.test.ts`
Expected: PASS (5 tests)

**Step 5: Run existing args tests for regressions**

Run: `cd franken-orchestrator && npx vitest run tests/unit/cli/`
Expected: All PASS (some tests may need `'claude' | 'codex'` type references updated to `string`)

**Step 6: Commit**

```bash
cd franken-orchestrator
git add src/cli/args.ts tests/unit/cli/args-providers.test.ts
git commit -m "feat: update CLI args for pluggable providers and --providers flag"
```

---

### Task 9: Update config-loader to merge providers config

**Files:**
- Modify: `franken-orchestrator/src/cli/config-loader.ts:1-71`
- Test: Extend or create `franken-orchestrator/tests/unit/cli/config-loader-providers.test.ts`

**Step 1: Write the failing test**

```typescript
// franken-orchestrator/tests/unit/cli/config-loader-providers.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../../../src/cli/config-loader.js';
import type { CliArgs } from '../../../src/cli/args.js';

function baseArgs(overrides?: Partial<CliArgs>): CliArgs {
  return {
    subcommand: undefined,
    baseDir: '/tmp',
    budget: 10,
    provider: 'claude',
    noPr: false,
    verbose: false,
    reset: false,
    resume: false,
    help: false,
    ...overrides,
  };
}

describe('loadConfig — providers merging', () => {
  it('returns default providers when no config file', async () => {
    const config = await loadConfig(baseArgs());
    expect(config.providers.default).toBe('claude');
    expect(config.providers.fallbackChain).toEqual(['claude', 'codex']);
  });

  it('CLI --provider overrides config default in the returned config', async () => {
    // Note: actual override happens in dep-factory, but config should carry through
    const config = await loadConfig(baseArgs({ provider: 'gemini' }));
    // The config file wasn't loaded, so providers.default stays 'claude'
    // The CLI arg override happens at dep-factory level
    expect(config.providers.default).toBe('claude');
  });
});
```

**Step 2: Run test to verify it passes (or fails if config shape changed)**

Run: `cd franken-orchestrator && npx vitest run tests/unit/cli/config-loader-providers.test.ts`
Expected: Should PASS if OrchestratorConfigSchema was already updated in Task 7. If not, will fail.

**Step 3: Verify config-loader properly passes through providers section**

The existing `loadConfig` in `config-loader.ts` already does `OrchestratorConfigSchema.parse(merged)` which will include the new `providers` field. The main change needed is ensuring `fromCli` doesn't accidentally strip it. Review and verify — if no code change needed, just add the test and commit.

**Step 4: Commit**

```bash
cd franken-orchestrator
git add src/cli/config-loader.ts tests/unit/cli/config-loader-providers.test.ts
git commit -m "feat: config-loader passes through providers config section"
```

---

### Task 10: Update cli-types.ts — remove hardcoded provider union

**Files:**
- Modify: `franken-orchestrator/src/skills/cli-types.ts:1-60`
- Modify: `franken-orchestrator/tests/unit/skills/cli-types.test.ts:1-154`

**Step 1: Update cli-types.ts**

Key changes:
1. Line 23: `provider: 'claude' | 'codex'` → `provider: string`
2. Lines 24-25: Remove `claudeCmd` and `codexCmd`, add `command?: string`
3. Line 29: `providers?: readonly ('claude' | 'codex')[]` → `providers?: readonly string[]`

Updated `RalphLoopConfig`:

```typescript
export interface RalphLoopConfig {
  readonly prompt: string;
  readonly promiseTag: string;
  readonly maxIterations: number;
  readonly maxTurns: number;
  readonly provider: string;
  readonly command?: string | undefined;
  readonly timeoutMs: number;
  readonly workingDir?: string | undefined;
  readonly abortSignal?: AbortSignal | undefined;
  readonly providers?: readonly string[] | undefined;
  readonly onRateLimit?: ((provider: string) => string | undefined) | undefined;
  readonly onIteration?: ((iteration: number, result: IterationResult) => void) | undefined;
  readonly onSleep?: ((durationMs: number, source: string) => void) | undefined;
  readonly onProviderAttempt?: ((provider: string, iteration: number) => void) | undefined;
  readonly onProviderSwitch?: ((fromProvider: string, toProvider: string, reason: 'rate-limit' | 'post-sleep-reset') => void) | undefined;
  readonly onSpawnError?: ((provider: string, error: string) => void) | undefined;
  readonly onProviderTimeout?: ((provider: string, timeoutMs: number) => void) | undefined;
  readonly _sleepFn?: ((ms: number) => Promise<void>) | undefined;
}
```

**Step 2: Update cli-types.test.ts**

- Remove `it('restricts provider to claude or codex')` test (line 50-52)
- Update `RalphLoopConfig` test to use `provider: string` and single `command` field
- Remove references to `claudeCmd`/`codexCmd` in test objects

**Step 3: Run tests**

Run: `cd franken-orchestrator && npx vitest run tests/unit/skills/cli-types.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
cd franken-orchestrator
git add src/skills/cli-types.ts tests/unit/skills/cli-types.test.ts
git commit -m "refactor: cli-types uses string provider, removes claudeCmd/codexCmd"
```

---

### Task 11: Refactor RalphLoop to use ProviderRegistry

This is the biggest refactor. Replace all hardcoded dispatch in `ralph-loop.ts`.

**Files:**
- Modify: `franken-orchestrator/src/skills/ralph-loop.ts:1-505`
- Modify: `franken-orchestrator/tests/unit/skills/ralph-loop.test.ts:1-396`

**Step 1: Update RalphLoop constructor to accept ProviderRegistry**

```typescript
import { ProviderRegistry, createDefaultRegistry } from './providers/cli-provider.js';
import type { ICliProvider, ProviderOpts } from './providers/cli-provider.js';

export class RalphLoop {
  private readonly registry: ProviderRegistry;

  constructor(registry?: ProviderRegistry) {
    this.registry = registry ?? createDefaultRegistry();
  }
  // ...
}
```

**Step 2: Replace spawnIteration dispatch**

Replace `spawnIteration` function (lines 248-349). Key changes:
- Remove `buildClaudeArgs` and `buildCodexArgs` functions (lines 114-129)
- Remove `normalizeCodexOutput` function (lines 223-246)
- Remove inline `RATE_LIMIT_PATTERNS` and `isRateLimited` (lines 4-12)
- The `spawnIteration` function takes `ICliProvider` instead of `'claude' | 'codex'`
- Command: `opts.commandOverride ?? provider.command`
- Args: `provider.buildArgs(config.prompt, providerOpts)`
- Env: `provider.filterEnv({...process.env})`
- StreamLineBuffer: `provider.supportsStreamJson() ? new StreamLineBuffer() : null`

**Step 3: Replace dispatch in run() method**

In `run()` (lines 352-499):
- `activeProvider` becomes `string` not `'claude' | 'codex'`
- Resolve provider: `const p = this.registry.get(activeProvider)`
- Normalize: `p.supportsStreamJson() ? result.cleanStdout : p.normalizeOutput(result.stdout)`
- Token estimate: `p.estimateTokens(normalizedStdout)`
- Rate limit: `!result.timedOut && p.isRateLimited(result.stderr, normalizedStdout)`
- Retry after: `p.parseRetryAfter(data.stderr, data.stdout)` returns `number | null` (ms), replace `parseResetTime` logic

**Step 4: Keep StreamLineBuffer and processStreamLine as-is**

These utilities stay in `ralph-loop.ts` — they're used by the spawn logic for stream-json providers.

**Step 5: Keep `parseResetTime` as a fallback**

`parseResetTime` is still useful as the generic fallback when `provider.parseRetryAfter()` returns null. Keep it exported but the primary path goes through the provider first.

**Step 6: Update tests**

In `ralph-loop.test.ts`:
- Import `ProviderRegistry` and built-in providers
- Update `baseConfig()` — remove `claudeCmd`/`codexCmd`, add `command`
- For provider-specific arg tests (tests 4 and 5), verify via mock spawn's received args
- Inject registry into `new RalphLoop(registry)` in tests that need custom providers
- Add a test: `'accepts custom provider via registry'`

**Step 7: Run tests**

Run: `cd franken-orchestrator && npx vitest run tests/unit/skills/ralph-loop.test.ts`
Expected: All PASS

**Step 8: Run full test suite for regressions**

Run: `cd franken-orchestrator && npx vitest run`
Expected: All PASS

**Step 9: Commit**

```bash
cd franken-orchestrator
git add src/skills/ralph-loop.ts tests/unit/skills/ralph-loop.test.ts
git commit -m "refactor: RalphLoop uses ProviderRegistry instead of hardcoded dispatch"
```

---

### Task 12: Refactor CliLlmAdapter to use ICliProvider

**Files:**
- Modify: `franken-orchestrator/src/adapters/cli-llm-adapter.ts:1-184`
- Modify: `franken-orchestrator/tests/unit/adapters/cli-llm-adapter.test.ts:1-302`

**Step 1: Update CliLlmAdapter constructor**

Replace `CliLlmAdapterConfig` with `ICliProvider` injection:

```typescript
import type { ICliProvider } from '../skills/providers/cli-provider.js';

export class CliLlmAdapter implements IAdapter {
  readonly provider: ICliProvider;
  private readonly workingDir: string;
  private readonly timeoutMs: number;
  private readonly _spawn: SpawnFn;

  constructor(
    provider: ICliProvider,
    opts: { workingDir: string; timeoutMs?: number; commandOverride?: string },
    _spawnFn?: SpawnFn,
  ) {
    this.provider = provider;
    this.workingDir = opts.workingDir;
    this.timeoutMs = opts.timeoutMs ?? 120_000;
    this._spawn = _spawnFn ?? (nodeSpawn as SpawnFn);
  }
```

**Step 2: Update execute()**

Replace hardcoded args and env filtering:

```typescript
async execute(providerRequest: unknown): Promise<string> {
  const { prompt, maxTurns } = providerRequest as CliTransformed;
  const cmd = this.provider.command;
  const args = this.provider.buildArgs(prompt, { maxTurns });
  const env = this.provider.filterEnv({ ...process.env } as Record<string, string>);
  // ... rest stays the same
}
```

**Step 3: Update transformResponse()**

Use `provider.supportsStreamJson()` to choose parsing path. If stream-json, parse JSON lines. If not, pass through.

**Step 4: Remove `CliLlmAdapterConfig` interface and `tryExtractTextFromNode` duplicate**

The `tryExtractTextFromNode` in cli-llm-adapter.ts is a duplicate of the one in ralph-loop.ts. Extract to a shared utility or import from codex-provider. For now, keep it local since it's used by `transformResponse`.

**Step 5: Update tests**

- Import `ClaudeProvider`, `CodexProvider` from providers
- Replace `baseConfig` with provider injection: `new CliLlmAdapter(new ClaudeProvider(), { workingDir: '/tmp/test' }, spawnFn)`
- Update assertions for the new constructor shape
- Verify that codex provider produces correct args when injected

**Step 6: Run tests**

Run: `cd franken-orchestrator && npx vitest run tests/unit/adapters/cli-llm-adapter.test.ts`
Expected: All PASS

**Step 7: Commit**

```bash
cd franken-orchestrator
git add src/adapters/cli-llm-adapter.ts tests/unit/adapters/cli-llm-adapter.test.ts
git commit -m "refactor: CliLlmAdapter uses ICliProvider instead of hardcoded config"
```

---

### Task 13: Update dep-factory.ts and session.ts

**Files:**
- Modify: `franken-orchestrator/src/cli/dep-factory.ts:1-155`
- Modify: `franken-orchestrator/src/cli/session.ts:1-267`

**Step 1: Update CliDepOptions and CliDeps**

In `dep-factory.ts`:
- Change `provider: 'claude' | 'codex'` to `provider: string` in `CliDepOptions` (line 24)
- Add `providers?: string[]` to `CliDepOptions`
- Add `providersConfig?: { overrides?: Record<string, { command?: string; model?: string; extraArgs?: string[] }> }` to `CliDepOptions`
- Import `createDefaultRegistry` from providers
- Create registry in `createCliDeps`, apply overrides, resolve provider

```typescript
import { createDefaultRegistry } from '../skills/providers/cli-provider.js';

// In createCliDeps:
const registry = createDefaultRegistry();

// Apply config overrides
if (options.providersConfig?.overrides) {
  // Overrides are passed through ProviderOpts at execution time, not mutating the provider
}

const provider = registry.get(options.provider);
const ralph = new RalphLoop(registry);
const cliLlmAdapter = new CliLlmAdapter(provider, {
  workingDir: paths.root,
  commandOverride: options.providersConfig?.overrides?.[options.provider]?.command,
});
```

**Step 2: Update SessionConfig in session.ts**

- Change `provider: 'claude' | 'codex'` to `provider: string` (line 22)
- Add `providers?: string[]` (for fallback chain)
- Update `buildDepOptions()` to pass `providers` through

**Step 3: Run full test suite**

Run: `cd franken-orchestrator && npx vitest run`
Expected: All PASS

**Step 4: Commit**

```bash
cd franken-orchestrator
git add src/cli/dep-factory.ts src/cli/session.ts
git commit -m "refactor: dep-factory and session use ProviderRegistry"
```

---

### Task 14: Update run.ts (CLI entrypoint) to wire providers config

**Files:**
- Modify: `franken-orchestrator/src/cli/run.ts` (wire config.providers into SessionConfig)

**Step 1: Read run.ts to find exact wiring point**

The CLI entrypoint creates `SessionConfig` from parsed args + loaded config. Add `providers` and `providersConfig` fields.

**Step 2: Wire it**

When constructing `SessionConfig`:
- `provider`: use `args.provider` (CLI override) or `config.providers.default`
- `providers`: use `args.providers` (CLI override) or `config.providers.fallbackChain`
- Pass `config.providers.overrides` through to dep-factory

**Step 3: Run full test suite**

Run: `cd franken-orchestrator && npx vitest run`
Expected: All PASS

**Step 4: Commit**

```bash
cd franken-orchestrator
git add src/cli/run.ts
git commit -m "feat: wire providers config from CLI args and config file into session"
```

---

### Task 15: Fail-fast validation at startup

**Files:**
- Modify: `franken-orchestrator/src/cli/dep-factory.ts` (add validation)
- Test: Add to existing dep-factory tests or create `franken-orchestrator/tests/unit/cli/dep-factory-providers.test.ts`

**Step 1: Write failing test**

```typescript
// franken-orchestrator/tests/unit/cli/dep-factory-providers.test.ts
import { describe, it, expect } from 'vitest';
import { createCliDeps } from '../../../src/cli/dep-factory.js';

describe('createCliDeps — provider validation', () => {
  it('throws on unknown provider', async () => {
    await expect(createCliDeps({
      paths: { root: '/tmp', plansDir: '/tmp', checkpointFile: '/tmp/cp', tracesDb: '/tmp/traces.db', logFile: '/tmp/log' },
      baseBranch: 'main',
      budget: 10,
      provider: 'nonexistent',
      noPr: true,
      verbose: false,
      reset: false,
    })).rejects.toThrow(/Unknown provider "nonexistent"/);
  });
});
```

**Step 2: Verify it fails** (currently won't throw)

**Step 3: Add validation** — `registry.get(options.provider)` already throws. Ensure it's called early in `createCliDeps`.

**Step 4: Run test, commit**

```bash
cd franken-orchestrator
git add src/cli/dep-factory.ts tests/unit/cli/dep-factory-providers.test.ts
git commit -m "feat: fail-fast validation for unknown provider names"
```

---

### Task 16: ADR 010 — Pluggable CLI Providers

**Files:**
- Create: `docs/adr/010-pluggable-cli-providers.md`

**Step 1: Write ADR**

```markdown
# ADR-010: Pluggable CLI Provider Registry

## Status
Accepted

## Context
The orchestrator hardcoded CLI agent support as a `'claude' | 'codex'` union type
with if/else dispatch in ralph-loop.ts, cli-llm-adapter.ts, and several CLI files.
Adding new agents (Gemini CLI, Aider) required touching 5+ files per provider with
no isolation or testability.

## Decision
Extract provider-specific logic into self-contained `ICliProvider` implementations
behind a `ProviderRegistry`. Built-in providers: Claude, Codex, Gemini CLI, Aider.
Config schema gains a `providers` section for default, fallback chain, and overrides.

## Consequences
- Adding a new CLI agent requires implementing one interface in one file
- RalphLoop and CliLlmAdapter are provider-agnostic
- Config file supports provider overrides (command path, model, extra args)
- Warp is deferred (terminal host, not CLI agent)
- API-key providers can be added later without rework
```

**Step 2: Commit**

```bash
git add docs/adr/010-pluggable-cli-providers.md
git commit -m "docs: ADR 010 — pluggable CLI provider registry"
```

---

### Task 17: Update ARCHITECTURE.md

**Files:**
- Modify: `docs/ARCHITECTURE.md`

**Step 1: Read current ARCHITECTURE.md**

Find the CLI pipeline / orchestrator section and update.

**Step 2: Add provider registry to component diagram**

Add a section or update the existing CLI pipeline section to show:
- `ICliProvider` interface
- `ProviderRegistry` with 4 built-in providers
- How RalphLoop and CliLlmAdapter consume the registry
- Config-based provider selection

**Step 3: Commit**

```bash
git add docs/ARCHITECTURE.md
git commit -m "docs: update ARCHITECTURE.md with provider registry"
```

---

### Task 18: Update RAMP_UP.md

**Files:**
- Modify: `docs/RAMP_UP.md`

**Step 1: Update orchestrator internals tree**

Add `providers/` directory under `skills/`:
```
├── skills/                # CliSkillExecutor, RalphLoop, GitBranchIsolator
│   └── providers/         # ICliProvider, Claude/Codex/Gemini/Aider providers
```

**Step 2: Update CLI pipeline section**

Replace hardcoded `claude --print, codex exec` references with:
- `CliSkillExecutor` spawns CLI tools via `ProviderRegistry` (claude, codex, gemini, aider)
- Mention `--provider` and `--providers` flags
- Mention config file `providers` section

**Step 3: Update known limitations**

Remove "CLI requires `--dry-run`" if no longer accurate. Add note about Warp being deferred.

**Step 4: Commit**

```bash
git add docs/RAMP_UP.md
git commit -m "docs: update RAMP_UP.md with provider registry"
```

---

### Task 19: Full regression test + typecheck

**Step 1: Run typecheck**

Run: `cd franken-orchestrator && npx tsc --noEmit`
Expected: No errors

**Step 2: Run all orchestrator tests**

Run: `cd franken-orchestrator && npm test`
Expected: All PASS

**Step 3: Run root-level integration tests**

Run: `npm run test`
Expected: All PASS

**Step 4: Build**

Run: `npm run build`
Expected: Clean build

**Step 5: Commit (if any fixups needed)**

```bash
git add -A
git commit -m "fix: address typecheck and test regressions"
```

---

### Task 20: Update orchestrator gitlink in root repo

**Step 1: Push orchestrator changes**

```bash
cd franken-orchestrator
git push origin HEAD
```

**Step 2: Update gitlink in root frankenbeast repo**

```bash
cd /home/pfk/dev/frankenbeast
git add franken-orchestrator
git commit -m "chore: update orchestrator gitlink — pluggable CLI providers"
git push origin HEAD
```
