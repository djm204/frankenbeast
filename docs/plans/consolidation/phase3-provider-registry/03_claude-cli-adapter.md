# Chunk 3.3: Claude CLI Adapter

**Phase:** 3 — Provider Registry + Adapters
**Depends on:** Chunk 3.1 (provider interfaces)
**Estimated size:** Medium (~100 lines + tests)

---

## Purpose

Implement `ClaudeCliAdapter` that spawns the `claude` CLI in non-interactive mode, streams NDJSON output, and translates to `LlmStreamEvent`. This is the primary v1 provider — it must work end-to-end.

## Verified CLI Flags

Source: Claude CLI reference documentation.

| Flag | Purpose |
|------|---------|
| `-p` | Print mode — non-interactive, reads from stdin or args |
| `--output-format stream-json` | NDJSON streaming output |
| `--mcp-config <file>` | MCP server configuration JSON file |
| `--append-system-prompt <text>` | Append text to system prompt (for handoff context) |
| `--max-budget-usd <n>` | Cost limit per execution |
| `--max-turns <n>` | Turn limit |
| `--tools "Bash,Read,mcp__github__*"` | Tool filtering |

## Implementation

```typescript
// packages/franken-orchestrator/src/providers/claude-cli-adapter.ts

import { spawn, type ChildProcess } from 'node:child_process';
import type { ILlmProvider, LlmRequest, LlmStreamEvent, ProviderCapabilities, BrainSnapshot } from '@frankenbeast/types';

export class ClaudeCliAdapter implements ILlmProvider {
  readonly name = 'claude-cli';
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    toolUse: true,
    vision: true,
    maxContextTokens: 200_000,
    mcpSupport: true,
    skillDiscovery: true,
  };

  constructor(private options: {
    binaryPath?: string;      // default: 'claude'
    maxBudgetUsd?: number;
    maxTurns?: number;
    tools?: string[];
  } = {}) {}

  async isAvailable(): Promise<boolean> {
    // Check 1: binary exists
    // Check 2: auth is valid (API key or CLI login)
    // Spawn: claude --version (quick check)
    try {
      const proc = spawn(this.binaryPath, ['--version'], {
        env: this.sanitizedEnv(),
        timeout: 5000,
      });
      return new Promise((resolve) => {
        proc.on('close', (code) => resolve(code === 0));
        proc.on('error', () => resolve(false));
      });
    } catch {
      return false;
    }
  }

  async *execute(request: LlmRequest): AsyncIterable<LlmStreamEvent> {
    const args = this.buildArgs(request);
    const proc = spawn(this.binaryPath, args, {
      env: this.sanitizedEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Write prompt to stdin
    proc.stdin.write(request.messages.map(m =>
      typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
    ).join('\n'));
    proc.stdin.end();

    // Parse NDJSON from stdout
    yield* this.parseStream(proc);
  }

  formatHandoff(snapshot: BrainSnapshot): string {
    // Format as a context block that Claude can understand
    return [
      '--- BRAIN STATE HANDOFF ---',
      `Previous provider: ${snapshot.metadata.lastProvider}`,
      `Switch reason: ${snapshot.metadata.switchReason}`,
      `Tokens used so far: ${snapshot.metadata.totalTokensUsed}`,
      '',
      'Working memory:',
      JSON.stringify(snapshot.working, null, 2),
      '',
      `Recent events (${snapshot.episodic.length}):`,
      ...snapshot.episodic.slice(-10).map(e =>
        `  [${e.type}] ${e.summary}`
      ),
      snapshot.checkpoint ? `\nLast checkpoint: phase=${snapshot.checkpoint.phase}, step=${snapshot.checkpoint.step}` : '',
      '--- END HANDOFF ---',
    ].join('\n');
  }

  private get binaryPath(): string {
    return this.options.binaryPath ?? 'claude';
  }

  private buildArgs(request: LlmRequest): string[] {
    const args = ['-p', '--output-format', 'stream-json'];

    if (request.systemPrompt) {
      args.push('--append-system-prompt', request.systemPrompt);
    }
    if (this.options.maxBudgetUsd) {
      args.push('--max-budget-usd', String(this.options.maxBudgetUsd));
    }
    if (this.options.maxTurns) {
      args.push('--max-turns', String(this.options.maxTurns));
    }
    if (this.options.tools?.length) {
      args.push('--tools', this.options.tools.join(','));
    }
    // MCP config is added by SkillManager via a separate mechanism (Phase 5)
    return args;
  }

  /**
   * Sanitize environment for spawned Claude process.
   * Critical: strip CLAUDE_CODE_ENTRYPOINT and other CLAUDE* vars
   * to prevent the spawned CLI from trying to connect to VS Code
   * or loading parent session plugins.
   */
  private sanitizedEnv(): Record<string, string> {
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (key.startsWith('CLAUDE')) {
        delete env[key];
      }
    }
    env.FRANKENBEAST_SPAWNED = '1';
    return env as Record<string, string>;
  }

  /**
   * Parse Claude's stream-json NDJSON output into LlmStreamEvent.
   *
   * Claude stream-json events include:
   * - { type: "message_start", message: { ... } }
   * - { type: "content_block_start", content_block: { type: "text" | "tool_use", ... } }
   * - { type: "content_block_delta", delta: { type: "text_delta", text: "..." } }
   * - { type: "content_block_stop" }
   * - { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { ... } }
   * - { type: "message_stop" }
   * - { type: "result", result: "..." } (final text output)
   */
  private async *parseStream(proc: ChildProcess): AsyncIterable<LlmStreamEvent> {
    // Implementation: read stdout line by line, parse JSON, translate to LlmStreamEvent
    // Handle: text deltas → { type: 'text', content }
    //         tool_use blocks → { type: 'tool_use', id, name, input }
    //         message_delta with usage → { type: 'done', usage }
    //         process errors → { type: 'error', error, retryable }
    // ...
  }
}
```

## Key Design Decisions

1. **Env var sanitization is critical.** The existing `CLAUDE_CODE_ENTRYPOINT=claude-vscode` bug and plugin loading freeze are documented in MEMORY. This adapter MUST strip all `CLAUDE*` env vars and set `FRANKENBEAST_SPAWNED=1`.

2. **Stream-json parsing must handle nested keys.** Per MEMORY: `tryExtractTextFromNode` must have `message` and `content_block` in nestedKeys (not directKeys) to handle Claude's event structure. The existing `process-beast-executor.ts` has a working parser — reuse or reference that pattern.

3. **`formatHandoff()` produces human-readable text**, not JSON. Claude will understand a structured text block better than a raw JSON blob injected via `--append-system-prompt`.

## Tests

```typescript
// packages/franken-orchestrator/tests/unit/providers/claude-cli-adapter.test.ts

describe('ClaudeCliAdapter', () => {
  describe('isAvailable()', () => {
    it('returns true when claude binary exists and responds', () => { ... });
    it('returns false when binary not found', () => { ... });
    it('returns false on timeout', () => { ... });
  });

  describe('execute()', () => {
    it('spawns claude with correct args', () => {
      // Mock child_process.spawn, verify args
    });
    it('strips CLAUDE* env vars', () => {
      // Verify env passed to spawn has no CLAUDE* vars
      // Verify FRANKENBEAST_SPAWNED=1 is set
    });
    it('parses text stream events', () => {
      // Feed mock NDJSON, verify LlmStreamEvent output
    });
    it('parses tool_use stream events', () => { ... });
    it('emits done event with token usage', () => { ... });
    it('emits retryable error on rate limit', () => { ... });
    it('emits non-retryable error on auth failure', () => { ... });
  });

  describe('formatHandoff()', () => {
    it('formats brain snapshot as readable text', () => { ... });
    it('includes working memory, recent events, checkpoint', () => { ... });
    it('truncates long event lists to last 10', () => { ... });
  });

  describe('buildArgs()', () => {
    it('includes -p and --output-format stream-json', () => { ... });
    it('adds --append-system-prompt when systemPrompt provided', () => { ... });
    it('adds --max-budget-usd when configured', () => { ... });
    it('adds --max-turns when configured', () => { ... });
    it('adds --tools when configured', () => { ... });
  });
});
```

## Files

- **Add:** `packages/franken-orchestrator/src/providers/claude-cli-adapter.ts`
- **Add:** `packages/franken-orchestrator/tests/unit/providers/claude-cli-adapter.test.ts`

## Exit Criteria

- `ClaudeCliAdapter` implements `ILlmProvider`
- Spawns `claude -p --output-format stream-json` with sanitized env
- Parses all Claude stream-json event types into `LlmStreamEvent`
- `formatHandoff()` produces readable context block
- `isAvailable()` checks binary + auth
- All `CLAUDE*` env vars stripped, `FRANKENBEAST_SPAWNED=1` set
- Unit tests cover all methods with mocked child process
