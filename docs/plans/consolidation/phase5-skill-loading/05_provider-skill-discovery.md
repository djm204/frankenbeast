# Chunk 5.5: Provider Skill Discovery

**Phase:** 5 — Skill Loading
**Depends on:** Chunk 5.1 (schemas), Phase 3 (provider adapters)
**Estimated size:** Medium (~80 lines per adapter + shared helpers + tests)

---

## Purpose

Wire `discoverSkills()` into each CLI adapter to query the provider's configured MCP servers. All three CLIs (Claude, Codex, Gemini) support MCP server management commands — no stubs needed. When provider metadata exposes normalized tool schemas, include them in `SkillCatalogEntry.toolDefinitions` so installs can persist `tools.json` for API adapters.

## Shared Helper

All three adapters spawn a CLI subprocess and parse JSON output. Extract the common plumbing:

```typescript
// packages/franken-orchestrator/src/providers/discover-skills-helpers.ts

import { spawn } from 'node:child_process';

export interface CollectResult {
  stdout: string;
  exitCode: number;
}

/**
 * Spawn a CLI command with sanitized env, collect stdout, enforce timeout.
 * Returns empty stdout on any failure (timeout, non-zero exit, spawn error).
 */
export async function collectCliOutput(
  command: string,
  args: string[],
  env: Record<string, string>,
  timeoutMs = 15_000,
): Promise<CollectResult> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      env,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: timeoutMs,
    });

    const chunks: Buffer[] = [];
    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));

    proc.on('error', () => resolve({ stdout: '', exitCode: 1 }));
    proc.on('close', (code) => {
      resolve({
        stdout: Buffer.concat(chunks).toString('utf-8'),
        exitCode: code ?? 1,
      });
    });
  });
}
```

## Implementation

### Claude CLI Adapter

Claude CLI exposes `claude mcp list` which outputs configured MCP servers. With `--json` it returns structured data including server name, command, args, and environment variables.

```typescript
// In claude-cli-adapter.ts
async discoverSkills(): Promise<SkillCatalogEntry[]> {
  try {
    const { stdout, exitCode } = await collectCliOutput(
      'claude', ['mcp', 'list', '--json'],
      this.sanitizedEnv(),
    );
    if (exitCode !== 0 || !stdout.trim()) return [];

    const servers = JSON.parse(stdout);
    // claude mcp list --json returns an array of configured servers:
    // [{ name, command, args, env, scope }]
    if (!Array.isArray(servers)) return [];

    return servers.map((s: any) => ({
      name: s.name ?? 'unknown',
      description: s.description ?? '',
      provider: 'claude-cli',
      installed: true, // These are already configured in the CLI
      installConfig: {
        command: s.command ?? 'npx',
        args: s.args ?? [],
        env: s.env ?? {},
      },
      authFields: extractAuthFields(s.env),
      toolDefinitions: s.tools ?? [],
    }));
  } catch {
    return [];
  }
}
```

### Codex CLI Adapter

Codex CLI exposes `codex mcp list` for configured MCP servers. The `--json` flag returns structured output.

```typescript
// In codex-cli-adapter.ts
async discoverSkills(): Promise<SkillCatalogEntry[]> {
  try {
    const { stdout, exitCode } = await collectCliOutput(
      'codex', ['mcp', 'list', '--json'],
      this.sanitizedEnv(),
    );
    if (exitCode !== 0 || !stdout.trim()) return [];

    const servers = JSON.parse(stdout);
    if (!Array.isArray(servers)) return [];

    return servers.map((s: any) => ({
      name: s.name ?? 'unknown',
      description: s.description ?? '',
      provider: 'codex-cli',
      installed: true,
      installConfig: {
        command: s.command ?? 'npx',
        args: s.args ?? [],
        env: s.env ?? {},
      },
      authFields: s.authRequired
        ? [{ key: s.authEnvVar, label: s.authLabel ?? s.authEnvVar, type: 'secret' as const, required: true }]
        : extractAuthFields(s.env),
      toolDefinitions: s.toolDefinitions ?? [],
    }));
  } catch {
    return [];
  }
}
```

### Gemini CLI Adapter

Gemini CLI supports MCP server configuration via `settings.json`. The CLI exposes extension/tool listing that includes configured MCP servers.

```typescript
// In gemini-cli-adapter.ts
async discoverSkills(): Promise<SkillCatalogEntry[]> {
  try {
    // Gemini stores MCP config in settings.json — try CLI listing first
    const { stdout, exitCode } = await collectCliOutput(
      'gemini', ['tool', 'list', '--json'],
      this.sanitizedEnv(),
    );
    if (exitCode !== 0 || !stdout.trim()) {
      // Fallback: parse ~/.gemini/settings.json directly for MCP servers
      return this.discoverFromSettingsFile();
    }

    const tools = JSON.parse(stdout);
    if (!Array.isArray(tools)) return [];

    return tools
      .filter((t: any) => t.type === 'mcp' || t.mcpServer)
      .map((t: any) => ({
        name: t.name ?? 'unknown',
        description: t.description ?? '',
        provider: 'gemini-cli',
        installed: true,
        installConfig: {
          command: t.command ?? t.mcpServer?.command ?? 'npx',
          args: t.args ?? t.mcpServer?.args ?? [],
          env: t.env ?? t.mcpServer?.env ?? {},
        },
        authFields: extractAuthFields(t.env ?? t.mcpServer?.env),
        toolDefinitions: t.tools ?? [],
      }));
  } catch {
    return [];
  }
}

/**
 * Fallback: read MCP server configs from ~/.gemini/settings.json
 * when CLI listing is unavailable.
 */
private async discoverFromSettingsFile(): Promise<SkillCatalogEntry[]> {
  try {
    const settingsPath = path.join(os.homedir(), '.gemini', 'settings.json');
    const raw = await fs.readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(raw);
    const mcpServers = settings.mcpServers ?? {};

    return Object.entries(mcpServers).map(([name, config]: [string, any]) => ({
      name,
      description: config.description ?? '',
      provider: 'gemini-cli',
      installed: true,
      installConfig: {
        command: config.command ?? 'npx',
        args: config.args ?? [],
        env: config.env ?? {},
      },
      authFields: extractAuthFields(config.env),
      toolDefinitions: [],
    }));
  } catch {
    return [];
  }
}
```

### Auth Field Extraction Helper

When env vars suggest credential patterns, surface them as `authFields`:

```typescript
// In discover-skills-helpers.ts

const AUTH_PATTERNS = /token|secret|key|password|credential|auth/i;

export function extractAuthFields(
  env?: Record<string, string>,
): SkillAuthField[] {
  if (!env) return [];
  return Object.keys(env)
    .filter((key) => AUTH_PATTERNS.test(key))
    .map((key) => ({
      key,
      label: key,
      type: 'secret' as const,
      required: true,
    }));
}
```

## Tests

```typescript
describe('Provider skill discovery', () => {
  describe('collectCliOutput()', () => {
    it('returns stdout and exit code on success', () => { ... });
    it('returns empty stdout on spawn error (CLI not installed)', () => { ... });
    it('returns empty stdout on timeout', () => { ... });
  });

  describe('extractAuthFields()', () => {
    it('extracts env vars matching auth patterns', () => {
      expect(extractAuthFields({ GITHUB_TOKEN: 'xxx', PORT: '8080' }))
        .toEqual([{ key: 'GITHUB_TOKEN', label: 'GITHUB_TOKEN', type: 'secret', required: true }]);
    });
    it('returns empty array for undefined env', () => { ... });
    it('returns empty array when no keys match', () => { ... });
  });

  describe('ClaudeCliAdapter.discoverSkills()', () => {
    it('parses claude mcp list --json output', () => {
      // Mock spawn of `claude mcp list --json`
      // Return: [{ name: "github", command: "npx", args: ["-y", "@modelcontextprotocol/server-github"], env: { GITHUB_TOKEN: "..." } }]
      // Verify SkillCatalogEntry[] with provider='claude-cli', installed=true
    });
    it('returns empty array on non-zero exit code', () => { ... });
    it('returns empty array on invalid JSON', () => { ... });
    it('returns empty array when CLI is not installed', () => { ... });
    it('extracts auth fields from env vars', () => { ... });
    it('preserves tool definitions when present', () => { ... });
    it('uses sanitized env (no CLAUDE* vars leaked)', () => { ... });
  });

  describe('CodexCliAdapter.discoverSkills()', () => {
    it('parses codex mcp list --json output', () => {
      // Mock spawn of `codex mcp list --json`
      // Return sample JSON with 2 servers
      // Verify SkillCatalogEntry[] output
    });
    it('returns empty array on error', () => { ... });
    it('returns empty array on timeout', () => { ... });
    it('maps explicit authRequired to authFields', () => { ... });
    it('falls back to extractAuthFields from env', () => { ... });
    it('maps normalized tool schemas to toolDefinitions when present', () => { ... });
  });

  describe('GeminiCliAdapter.discoverSkills()', () => {
    it('parses gemini tool list --json output', () => {
      // Mock spawn of `gemini tool list --json`
      // Return: [{ name: "github", type: "mcp", command: "npx", args: [...] }]
      // Verify SkillCatalogEntry[] with provider='gemini-cli'
    });
    it('filters to MCP-type tools only', () => { ... });
    it('falls back to ~/.gemini/settings.json when CLI listing fails', () => {
      // Mock spawn returning non-zero exit
      // Mock fs.readFile for settings.json with mcpServers
      // Verify entries parsed from settings file
    });
    it('returns empty array when both CLI and settings file fail', () => { ... });
    it('extracts auth fields from env vars', () => { ... });
  });
});
```

## Files

- **Add:** `packages/franken-orchestrator/src/providers/discover-skills-helpers.ts` — shared `collectCliOutput()` + `extractAuthFields()`
- **Modify:** `packages/franken-orchestrator/src/providers/claude-cli-adapter.ts` — add `discoverSkills()`
- **Modify:** `packages/franken-orchestrator/src/providers/codex-cli-adapter.ts` — add `discoverSkills()`
- **Modify:** `packages/franken-orchestrator/src/providers/gemini-cli-adapter.ts` — add `discoverSkills()` + `discoverFromSettingsFile()`
- **Add:** `packages/franken-orchestrator/tests/unit/skills/provider-skill-discovery.test.ts`

## Exit Criteria

- All 3 CLI adapters have real `discoverSkills()` implementations (no stubs)
- Claude adapter parses `claude mcp list --json` into `SkillCatalogEntry[]`
- Codex adapter parses `codex mcp list --json` into `SkillCatalogEntry[]`
- Gemini adapter parses `gemini tool list --json` with fallback to `~/.gemini/settings.json`
- Shared `collectCliOutput()` helper handles spawn errors, timeouts, and non-zero exits
- `extractAuthFields()` surfaces credential-pattern env vars as `SkillAuthField[]`
- Discovery preserves normalized `toolDefinitions` when provider metadata exposes them
- All entries include `installed: true` (these are configured servers, not marketplace browsing)
- **API adapters do NOT implement `discoverSkills()`** — the method is optional on `ILlmProvider` (declared with `?`). API adapters communicate via SDK, not CLI tooling, so marketplace browsing is CLI-only for v1. The dashboard gracefully handles providers without discovery (shows "Discovery not available" instead of a catalog tab).
- All discovery methods handle errors gracefully (return empty array, don't throw)
- Spawned CLI processes use `sanitizedEnv()` from the respective provider (no leaked `CLAUDE*`/`GEMINI*`/`GOOGLE*` vars)
