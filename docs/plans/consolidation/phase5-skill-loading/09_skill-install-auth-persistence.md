# Chunk 5.9: Skill Install Auth Persistence

**Phase:** 5 — Skill Loading
**Depends on:** Chunk 5.4 (auth resolver), Chunk 5.5 (discovery metadata), Chunk 5.6 (skill routes)
**Estimated size:** Medium (~150 lines + tests)

---

## Purpose

Capture auth requirements during skill installation, persist secrets safely to `.frankenbeast/.env`, and ensure installed `mcp.json` files reference placeholders rather than raw credentials. Phase 5.4 only resolves existing credentials; this chunk defines how credentials get there in the first place.

## Implementation

### 1. Add a credential store

```typescript
// packages/franken-orchestrator/src/skills/skill-credential-store.ts

import fs from 'node:fs';
import path from 'node:path';

export class SkillCredentialStore {
  constructor(private readonly projectRoot: string) {}

  private get envPath(): string {
    return path.join(this.projectRoot, '.frankenbeast', '.env');
  }

  setMany(values: Record<string, string>): void {
    const current = this.readAll();
    const merged = { ...current, ...values };
    fs.mkdirSync(path.dirname(this.envPath), { recursive: true });
    fs.writeFileSync(
      this.envPath,
      Object.entries(merged)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join('\n') + '\n',
    );
  }

  readAll(): Record<string, string> {
    if (!fs.existsSync(this.envPath)) return {};
    const lines = fs.readFileSync(this.envPath, 'utf-8').split('\n');
    const result: Record<string, string> = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const raw = trimmed.slice(eq + 1).trim();
      result[key] = raw.replace(/^['"]|['"]$/g, '');
    }
    return result;
  }
}
```

### 2. Extend install payloads

`POST /api/skills` accepts auth values for marketplace installs:

```typescript
type SkillInstallRequest =
  | {
      catalogEntry: SkillCatalogEntry;
      authMode?: 'api-key' | 'cli-login' | 'oauth';
      credentials?: Record<string, string>;
    }
  | {
      custom: {
        name: string;
        config: McpServerConfig;
      };
      credentials?: Record<string, string>;
    };
```

- `credentials` keys map to `authFields[].key`
- API-key credentials are written to `.frankenbeast/.env`
- Installed `mcp.json` rewrites secret env values to `${VAR}` placeholders
- `cli-login` stores no secret and relies on provider `isAvailable()`
- `oauth` stores no secret; return `202` with a next step such as `codex mcp login <name>`

### 3. Update `SkillManager.install()`

```typescript
await skillManager.install(catalogEntry, {
  authMode: 'api-key',
  credentialEnv: {
    GITHUB_TOKEN: '${GITHUB_TOKEN}',
  },
});
```

Behavior:
- Install from catalog still writes `mcp.json`
- Secret values never appear verbatim in `mcp.json`
- Missing required `authFields` reject the install request with `400`

### 4. Update skill routes

`createSkillRoutes()` now:
- validates required `authFields`
- writes supplied secrets through `SkillCredentialStore`
- rewrites `catalogEntry.installConfig.env` to placeholder references
- returns `202 { nextAction }` for OAuth installs that require a follow-up command

### 5. CLI compatibility note

The Phase 8 CLI `skill add` flow must use the same request shape so dashboard and CLI installs persist credentials identically. This chunk defines the backend contract the CLI will call later.

## Tests

```typescript
describe('SkillCredentialStore', () => {
  it('creates .frankenbeast/.env when missing', () => { ... });
  it('merges new values without dropping existing vars', () => { ... });
  it('writes deterministically sorted keys', () => { ... });
});

describe('POST /api/skills auth persistence', () => {
  it('persists API-key credentials to .frankenbeast/.env', async () => { ... });
  it('writes ${VAR} placeholders into mcp.json instead of raw secrets', async () => { ... });
  it('rejects install when a required auth field is missing', async () => { ... });
  it('does not persist secrets for cli-login mode', async () => { ... });
  it('returns nextAction for oauth installs', async () => { ... });
});
```

## Files

- **Add:** `packages/franken-orchestrator/src/skills/skill-credential-store.ts`
- **Modify:** `packages/franken-orchestrator/src/skills/skill-manager.ts` — install signatures + placeholder rewriting
- **Modify:** `packages/franken-orchestrator/src/http/routes/skill-routes.ts` — accept credentials/authMode
- **Add/Modify:** `packages/franken-orchestrator/tests/unit/skills/skill-credential-store.test.ts`
- **Modify:** `packages/franken-orchestrator/tests/integration/skills/skill-routes.test.ts`

## Exit Criteria

- Dashboard/API install flow can capture auth values for marketplace skills
- `.frankenbeast/.env` is created/updated for API-key installs
- `mcp.json` stores `${VAR}` placeholders, never raw secrets
- `cli-login` and `oauth` installs store mode metadata without persisting secrets
- Route validation rejects missing required credentials
- Tests prove secret persistence and placeholder rewriting behavior
