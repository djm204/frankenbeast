# Chunk 5.10: Skill Health + Provider Metadata

**Phase:** 5 — Skill Loading
**Depends on:** Chunk 5.2 (SkillManager), Chunk 5.6 (skill routes), Chunk 5.9 (install auth persistence)
**Estimated size:** Medium (~150 lines + tests)

---

## Purpose

Provide the missing metadata required by the advanced dashboard: where a skill came from and whether its MCP server appears healthy. The ADR promises provider origin and connection health, but the existing Phase 5 chunks only return basic install metadata.

## Implementation

### 1. Persist skill metadata

Each skill directory gets a `skill.json` metadata file:

```json
{
  "name": "github",
  "source": {
    "type": "catalog",
    "provider": "codex-cli"
  },
  "authMode": "api-key",
  "installedAt": "2026-03-19T12:34:56.000Z"
}
```

For custom MCP skills:

```json
{
  "name": "code-review",
  "source": {
    "type": "custom",
    "provider": "custom"
  },
  "authMode": "none",
  "installedAt": "2026-03-19T12:34:56.000Z"
}
```

### 2. Extend skill schemas

`SkillInfoSchema` gains the fields the dashboard already expects:

```typescript
export const SkillInfoSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean(),
  hasContext: z.boolean(),
  provider: z.string().optional(),
  sourceType: z.enum(['catalog', 'custom']),
  authMode: z.enum(['none', 'api-key', 'cli-login', 'oauth']),
  mcpServerCount: z.number().int().nonneg(),
  mcpStatus: z.enum(['connected', 'error', 'unknown']),
  installedAt: z.string().datetime(),
});
```

### 3. Add health checking

```typescript
// packages/franken-orchestrator/src/skills/skill-health-checker.ts

export class SkillHealthChecker {
  async getStatus(mcpConfig: McpConfig): Promise<'connected' | 'error' | 'unknown'> {
    try {
      // v1 heuristic:
      // - stdio server with command present and successful lightweight connect => connected
      // - explicit connect failure / spawn error => error
      // - config present but no cheap probe available => unknown
      return 'unknown';
    } catch {
      return 'error';
    }
  }
}
```

For v1, a lightweight probe is enough:
- stdio servers: spawn/connect with short timeout if practical
- HTTP MCP servers: HEAD/health probe if URL is provided
- if probing would be too expensive or unsupported, return `unknown`

### 4. Enrich `GET /api/skills`

`createSkillRoutes()` should return:
- installed skill metadata from `skill.json`
- provider origin
- auth mode
- live or best-effort `mcpStatus`

### 5. Update `SkillManager`

`install()` and `installCustom()` write `skill.json`

`listInstalled()` reads:
- `mcp.json`
- `context.md`
- `skill.json`

and combines them into enriched `SkillInfo`

## Tests

```typescript
describe('Skill metadata', () => {
  it('writes provider origin for marketplace installs', async () => { ... });
  it('writes sourceType=custom for custom MCP installs', async () => { ... });
  it('preserves authMode in skill.json', async () => { ... });
});

describe('SkillHealthChecker', () => {
  it('returns connected for successful probe', async () => { ... });
  it('returns error for spawn/connect failure', async () => { ... });
  it('returns unknown when no cheap probe is available', async () => { ... });
});

describe('GET /api/skills', () => {
  it('returns provider origin and auth mode', async () => { ... });
  it('returns mcpStatus for each installed skill', async () => { ... });
});
```

## Files

- **Modify:** `packages/franken-types/src/skill.ts` — extend `SkillInfoSchema`
- **Add:** `packages/franken-orchestrator/src/skills/skill-health-checker.ts`
- **Modify:** `packages/franken-orchestrator/src/skills/skill-manager.ts` — write/read `skill.json`
- **Modify:** `packages/franken-orchestrator/src/http/routes/skill-routes.ts` — enrich `GET /api/skills`
- **Add/Modify:** `packages/franken-orchestrator/tests/unit/skills/skill-health-checker.test.ts`
- **Modify:** `packages/franken-orchestrator/tests/unit/skills/skill-manager.test.ts`
- **Modify:** `packages/franken-orchestrator/tests/integration/skills/skill-routes.test.ts`

## Exit Criteria

- Installed skills persist provider origin and auth mode
- `SkillInfoSchema` includes `sourceType`, `authMode`, and `mcpStatus`
- `GET /api/skills` returns the metadata expected by the advanced dashboard
- Health checks distinguish `connected`, `error`, and `unknown`
- Tests cover metadata persistence and API output
