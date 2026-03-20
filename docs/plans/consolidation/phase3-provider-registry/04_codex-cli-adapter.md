# Chunk 3.4: Codex CLI Adapter

**Phase:** 3 — Provider Registry + Adapters
**Depends on:** Chunk 3.1 (provider interfaces)
**Estimated size:** Medium (~100 lines + tests)

---

## Purpose

Implement `CodexCliAdapter` that spawns `codex exec` in non-interactive mode, parses NDJSON output, and supports MCP server management via `codex mcp add`.

## Verified CLI Flags

Source: OpenAI Codex CLI reference.

| Flag | Purpose |
|------|---------|
| `codex exec` | Non-interactive scripted mode |
| `--json` / `--experimental-json` | NDJSON streaming output |
| `codex mcp add <name>` | Add MCP server configuration |
| `codex mcp list --json` | List configured MCP servers |
| `codex mcp login <name> --scopes <s>` | OAuth for MCP servers |
| `--env KEY=VALUE` | Environment variables for MCP stdio servers |
| `-p <profile>` / `-c key=value` | Config overrides |
| `--output-last-message <path>` | Capture final response to file |
| `--ephemeral` | Skip session persistence |

## Implementation

```typescript
// packages/franken-orchestrator/src/providers/codex-cli-adapter.ts

export class CodexCliAdapter implements ILlmProvider {
  readonly name = 'codex-cli';
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    toolUse: true,
    vision: false,      // Codex CLI doesn't support vision as of v1
    maxContextTokens: 128_000,
    mcpSupport: true,
    skillDiscovery: true,
  };

  constructor(private options: {
    binaryPath?: string;   // default: 'codex'
    profile?: string;
    configOverrides?: Record<string, string>;
  } = {}) {}

  async isAvailable(): Promise<boolean> {
    // Spawn: codex --version
  }

  async *execute(request: LlmRequest): AsyncIterable<LlmStreamEvent> {
    // Spawns: codex exec --json --ephemeral [prompt]
    // Parses NDJSON output → LlmStreamEvent
    // Uses --env for MCP server env vars
    // Uses -c for config overrides
  }

  formatHandoff(snapshot: BrainSnapshot): string {
    // Format brain snapshot for Codex context injection
    // Codex uses config overrides or stdin for system prompt
  }

  async discoverSkills(): Promise<SkillCatalogEntry[]> {
    // Runs: codex mcp list --json
    // Parses output into SkillCatalogEntry[]
    // Returns available MCP servers
  }

  private get binaryPath(): string {
    return this.options.binaryPath ?? 'codex';
  }

  /**
   * Parse Codex NDJSON output.
   * Codex uses a different event format than Claude:
   * - Message events with role and content
   * - Tool call events
   * - Completion events with usage
   */
  private async *parseStream(proc: ChildProcess): AsyncIterable<LlmStreamEvent> {
    // ...
  }
}
```

## Key Differences from Claude CLI

1. **Command structure:** `codex exec` (not just `codex`)
2. **MCP config:** `codex mcp add` per server (not a single config file)
3. **Session management:** `--ephemeral` flag prevents session persistence (important for isolated agent runs)
4. **Output format:** NDJSON via `--json` but different event structure than Claude's stream-json
5. **Auth:** Supports `codex mcp login` for OAuth — unique to Codex

## Tests

```typescript
// packages/franken-orchestrator/tests/unit/providers/codex-cli-adapter.test.ts

describe('CodexCliAdapter', () => {
  describe('isAvailable()', () => {
    it('returns true when codex binary exists', () => { ... });
    it('returns false when binary not found', () => { ... });
  });

  describe('execute()', () => {
    it('spawns codex exec with correct args', () => { ... });
    it('includes --json and --ephemeral flags', () => { ... });
    it('adds --env for MCP server env vars', () => { ... });
    it('adds -c for config overrides', () => { ... });
    it('parses NDJSON output into LlmStreamEvent', () => { ... });
    it('handles tool call events', () => { ... });
    it('emits done event with usage', () => { ... });
  });

  describe('formatHandoff()', () => {
    it('formats brain snapshot for Codex context', () => { ... });
  });

  describe('discoverSkills()', () => {
    it('parses codex mcp list --json output', () => {
      // Mock spawn of `codex mcp list --json`
      // Verify SkillCatalogEntry[] output
    });
    it('returns empty array when no MCP servers configured', () => { ... });
  });
});
```

## Files

- **Add:** `packages/franken-orchestrator/src/providers/codex-cli-adapter.ts`
- **Add:** `packages/franken-orchestrator/tests/unit/providers/codex-cli-adapter.test.ts`

## Exit Criteria

- `CodexCliAdapter` implements `ILlmProvider`
- Spawns `codex exec --json --ephemeral` and parses output
- `discoverSkills()` parses `codex mcp list --json`
- `formatHandoff()` produces Codex-compatible context
- Unit tests with mocked child process cover all methods
- v1: mocked CLI — real integration testing is a future task
