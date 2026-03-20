# Chunk 3.5: Gemini CLI Adapter

**Phase:** 3 — Provider Registry + Adapters
**Depends on:** Chunk 3.1 (provider interfaces)
**Estimated size:** Medium (~100 lines + tests)

---

## Purpose

Implement `GeminiCliAdapter` that spawns the `gemini` CLI in non-interactive mode, uses `GEMINI.md` for context injection, and configures MCP servers via `settings.json`.

## Verified CLI Flags

Source: google-gemini/gemini-cli GitHub repository.

| Flag | Purpose |
|------|---------|
| `-p` | Non-interactive mode (pipe/print) |
| `--output-format stream-json` | NDJSON streaming output |
| `--output-format json` | Complete JSON response (non-streaming) |
| `-m <model>` | Model selection (e.g., `gemini-2.5-flash`) |
| `--include-directories <dirs>` | Scope control for file access |
| `GEMINI.md` | Project-level context injection (file in CWD) |
| `~/.gemini/settings.json` | MCP server configuration |
| `@servername` syntax | Invoke MCP tool in prompt |

## Implementation

```typescript
// packages/franken-orchestrator/src/providers/gemini-cli-adapter.ts

export class GeminiCliAdapter implements ILlmProvider {
  readonly name = 'gemini-cli';
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    toolUse: true,
    vision: true,
    maxContextTokens: 1_000_000,  // Gemini supports 1M context
    mcpSupport: true,
    skillDiscovery: true,
  };

  constructor(private options: {
    binaryPath?: string;    // default: 'gemini'
    model?: string;         // default: 'gemini-2.5-flash'
    workingDir?: string;    // where to write GEMINI.md
  } = {}) {}

  async isAvailable(): Promise<boolean> {
    // Spawn: gemini --version (or equivalent)
  }

  async *execute(request: LlmRequest): AsyncIterable<LlmStreamEvent> {
    // 1. Write/update GEMINI.md with system prompt + handoff context
    // 2. Spawn: gemini -p --output-format stream-json [prompt]
    // 3. Parse NDJSON output → LlmStreamEvent
  }

  formatHandoff(snapshot: BrainSnapshot): string {
    // Format brain snapshot for GEMINI.md injection
    // Gemini reads GEMINI.md in the working directory for context
    // This method returns the text to prepend to GEMINI.md
  }

  async discoverSkills(): Promise<SkillCatalogEntry[]> {
    // Query Gemini extension registry for available tools
    // Parse into SkillCatalogEntry[]
    // Falls back to empty array if discovery not available
  }

  /**
   * Write or update GEMINI.md in the working directory.
   * This is how Gemini CLI receives system prompts and handoff context.
   * Care: don't clobber existing GEMINI.md — prepend our section with clear delimiters.
   */
  private writeGeminiMd(systemPrompt: string, handoffContext?: string): void {
    const sections = [
      '<!-- FRANKENBEAST MANAGED SECTION - DO NOT EDIT -->',
      systemPrompt,
    ];
    if (handoffContext) {
      sections.push('', handoffContext);
    }
    sections.push('<!-- END FRANKENBEAST SECTION -->');

    // Read existing GEMINI.md, replace managed section or prepend
    // ...
  }

  /**
   * Configure MCP servers for Gemini via settings.json.
   * Location: ~/.gemini/settings.json or project-level
   */
  private configureMcpServers(servers: McpServerConfig[]): void {
    // Write to settings.json format that Gemini CLI expects
    // ...
  }

  /**
   * Parse Gemini CLI stream-json output.
   * Format is similar to Claude's stream-json but with Gemini-specific event types.
   */
  private async *parseStream(proc: ChildProcess): AsyncIterable<LlmStreamEvent> {
    // ...
  }
}
```

## Key Differences from Other CLIs

1. **Context injection via file:** Gemini uses `GEMINI.md` — a file in the working directory, not a CLI flag. The adapter must write/manage this file carefully to avoid clobbering user content.
2. **MCP via settings.json:** Not a CLI flag per server. MCP servers are configured in `~/.gemini/settings.json` or a project-level config file.
3. **`@servername` syntax:** MCP tools are invoked in prompts using `@servername` prefix. The adapter may need to translate tool calls.
4. **1M token context:** Gemini supports much larger context windows than Claude or Codex.

## Tests

```typescript
// packages/franken-orchestrator/tests/unit/providers/gemini-cli-adapter.test.ts

describe('GeminiCliAdapter', () => {
  describe('isAvailable()', () => {
    it('returns true when gemini binary exists', () => { ... });
    it('returns false when binary not found', () => { ... });
  });

  describe('execute()', () => {
    it('writes GEMINI.md before spawning', () => { ... });
    it('spawns gemini -p --output-format stream-json', () => { ... });
    it('parses stream-json output into LlmStreamEvent', () => { ... });
    it('does not clobber existing GEMINI.md content', () => { ... });
    it('uses managed section delimiters', () => { ... });
  });

  describe('formatHandoff()', () => {
    it('formats brain snapshot for GEMINI.md injection', () => { ... });
  });

  describe('discoverSkills()', () => {
    it('returns available Gemini extensions', () => { ... });
    it('returns empty array on discovery failure', () => { ... });
  });

  describe('writeGeminiMd()', () => {
    it('creates GEMINI.md if not exists', () => { ... });
    it('replaces managed section if exists', () => { ... });
    it('preserves user content outside managed section', () => { ... });
  });

  describe('configureMcpServers()', () => {
    it('writes settings.json in correct format', () => { ... });
    it('merges with existing settings', () => { ... });
  });
});
```

## Files

- **Add:** `packages/franken-orchestrator/src/providers/gemini-cli-adapter.ts`
- **Add:** `packages/franken-orchestrator/tests/unit/providers/gemini-cli-adapter.test.ts`

## Exit Criteria

- `GeminiCliAdapter` implements `ILlmProvider`
- Manages `GEMINI.md` for context injection without clobbering user content
- Configures MCP servers via `settings.json`
- Parses Gemini CLI stream-json output
- Unit tests with mocked child process and filesystem
- v1: mocked CLI — real integration is future
