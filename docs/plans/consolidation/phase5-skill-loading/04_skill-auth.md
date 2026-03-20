# Chunk 5.4: Skill Auth Management

**Phase:** 5 — Skill Loading
**Depends on:** Chunk 5.1 (schemas)
**Estimated size:** Small (~80 lines + tests)

---

## Purpose

Handle credential resolution for MCP servers. Skills may need API keys (stored in `.frankenbeast/.env`) or rely on CLI login (no stored credentials).

This chunk is intentionally the **read/resolve** side only. Install-time credential capture, `.env` persistence, and OAuth follow-up flows are defined in Chunk 5.9.

## Implementation

```typescript
// packages/franken-orchestrator/src/skills/skill-auth.ts

import fs from 'node:fs';
import path from 'node:path';

/**
 * Resolve environment variable placeholders in MCP configs.
 *
 * mcp.json uses ${VAR} syntax for credentials:
 * { "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" } }
 *
 * Resolution order:
 * 1. .frankenbeast/.env file (project-local, gitignored)
 * 2. Process environment (inherited)
 * 3. Throw if required var is unresolved
 */
export class SkillAuthResolver {
  private envOverrides: Record<string, string>;

  constructor(private projectRoot: string) {
    this.envOverrides = this.loadDotEnv();
  }

  /**
   * Resolve ${VAR} placeholders in a string.
   * Returns the resolved string or throws if a required var is missing.
   */
  resolve(template: string): string {
    return template.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      const value = this.envOverrides[varName] ?? process.env[varName];
      if (value === undefined) {
        throw new MissingCredentialError(varName, match);
      }
      return value;
    });
  }

  /**
   * Resolve all env vars in an MCP server config.
   * Returns a new config with all ${VAR} placeholders resolved to actual values.
   */
  resolveConfig(env: Record<string, string>): Record<string, string> {
    const resolved: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      resolved[key] = this.resolve(value);
    }
    return resolved;
  }

  /**
   * Check if all required credentials for a skill are available.
   */
  checkCredentials(env: Record<string, string>): Array<{ var: string; available: boolean }> {
    return Object.entries(env).map(([key, value]) => {
      const varMatch = value.match(/\$\{([^}]+)\}/);
      if (!varMatch) return { var: key, available: true };
      const varName = varMatch[1];
      return {
        var: varName,
        available: !!(this.envOverrides[varName] ?? process.env[varName]),
      };
    });
  }

  private loadDotEnv(): Record<string, string> {
    const envPath = path.join(this.projectRoot, '.frankenbeast', '.env');
    if (!fs.existsSync(envPath)) return {};

    const content = fs.readFileSync(envPath, 'utf-8');
    const result: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      // Strip quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
    return result;
  }
}

export class MissingCredentialError extends Error {
  constructor(public readonly varName: string, public readonly template: string) {
    super(`Missing credential: ${varName} (from ${template}). ` +
      `Set it in .frankenbeast/.env or as an environment variable.`);
    this.name = 'MissingCredentialError';
  }
}
```

## Tests

```typescript
describe('SkillAuthResolver', () => {
  // Use temp directory with .frankenbeast/.env for each test

  describe('resolve()', () => {
    it('resolves ${VAR} from .frankenbeast/.env', () => { ... });
    it('falls back to process.env', () => { ... });
    it('throws MissingCredentialError for unresolved vars', () => { ... });
    it('resolves multiple vars in one string', () => { ... });
    it('passes through strings without placeholders', () => { ... });
  });

  describe('resolveConfig()', () => {
    it('resolves all env vars in a config object', () => { ... });
  });

  describe('checkCredentials()', () => {
    it('reports available/missing credentials', () => { ... });
  });

  describe('loadDotEnv()', () => {
    it('parses KEY=VALUE format', () => { ... });
    it('strips quotes from values', () => { ... });
    it('ignores comments and blank lines', () => { ... });
    it('returns empty object when .env missing', () => { ... });
  });
});
```

## Files

- **Add:** `packages/franken-orchestrator/src/skills/skill-auth.ts`
- **Add:** `packages/franken-orchestrator/tests/unit/skills/skill-auth.test.ts`

## Exit Criteria

- `${VAR}` placeholders in `mcp.json` env fields resolve from `.frankenbeast/.env` or process env
- `MissingCredentialError` thrown for unresolved required vars
- `checkCredentials()` reports which vars are available/missing (for dashboard UI)
- `.env` parser handles quotes, comments, blank lines
- Install-time persistence and OAuth follow-up remain out of scope for this chunk and are covered by Chunk 5.9
