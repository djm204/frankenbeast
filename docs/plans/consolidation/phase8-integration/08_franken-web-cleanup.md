# Chunk 8.8: franken-web Package Cleanup

**Phase:** 8 — Wire Everything Together
**Depends on:** Phase 1 (packages deleted), Chunk 5.6 (skill API routes), Chunk 4.3 (security API routes), Chunk 3.2 (provider registry), Chunk 8.6 (dashboard skill management UI)
**Estimated size:** Medium (~150 lines of changes)

---

## Purpose

Phase 1 deletes 5 packages, but `franken-web` may still import or reference them. Additionally, the dashboard needs to consume the new API routes introduced by the consolidation (provider status, security config, skill management). This chunk ensures the web package compiles cleanly, has no stale references, and is wired to the new backend.

## What to Do

### 1. Audit Imports for Deleted Packages

Search `franken-web` for any imports from deleted packages:

```bash
grep -r "franken-mcp\|franken-skills\|franken-heartbeat\|frankenfirewall\|franken-comms" packages/franken-web/src/
```

Replace or remove every hit:

| Old Import | Replacement |
|------------|-------------|
| `@frankenbeast/skills` types | Inline types or import from `@frankenbeast/types` (skill types added in Phase 5.1) |
| `@frankenbeast/firewall` types | Import `SecurityConfig` from `@frankenbeast/types` or define locally |
| `@frankenbeast/heartbeat` types | Remove — heartbeat UI replaced by reflection config toggle |
| `@frankenbeast/mcp` types | Remove — MCP is internal to orchestrator |
| `@frankenbeast/comms` types | Import from orchestrator's comms module if needed, or define locally |

### 2. Update package.json Dependencies

Remove workspace dependencies on deleted packages:

```json
// packages/franken-web/package.json — remove these:
{
  "dependencies": {
    "@frankenbeast/skills": "workspace:*",      // REMOVE
    "@frankenbeast/firewall": "workspace:*",    // REMOVE
    "@frankenbeast/heartbeat": "workspace:*",   // REMOVE
    "@frankenbeast/mcp": "workspace:*",         // REMOVE
    "@frankenbeast/comms": "workspace:*"        // REMOVE
  }
}
```

Keep: `@frankenbeast/types` (shared types), and any direct dependency on `@frankenbeast/orchestrator` if used.

### 3. Wire New API Endpoints

The dashboard needs to consume new REST/SSE endpoints. Update or create API client functions:

```typescript
// packages/franken-web/src/api/client.ts (additions)

// --- Providers ---

export async function getProviders(): Promise<ProviderStatus[]> {
  const resp = await fetch('/api/providers');
  return resp.json();
}

export async function setProviderOrder(names: string[]): Promise<void> {
  await fetch('/api/providers/order', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order: names }),
  });
}

// --- Security ---

export async function getSecurityConfig(): Promise<SecurityConfig> {
  const resp = await fetch('/api/security');
  return resp.json();
}

export async function patchSecurityConfig(updates: Partial<SecurityConfig>): Promise<SecurityConfig> {
  const resp = await fetch('/api/security', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return resp.json();
}

// --- Skills (already defined in Chunk 8.6 store, but raw client here) ---

export async function getSkills(): Promise<SkillInfo[]> {
  const resp = await fetch('/api/skills');
  return resp.json();
}

export async function getSkillCatalog(provider: string): Promise<CatalogEntry[]> {
  const resp = await fetch(`/api/skills/catalog/${provider}`);
  return resp.json();
}

export async function installSkill(body: InstallSkillRequest): Promise<SkillInfo> {
  const resp = await fetch('/api/skills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return resp.json();
}

export async function toggleSkill(name: string, enabled: boolean): Promise<void> {
  await fetch(`/api/skills/${encodeURIComponent(name)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
}

export async function deleteSkill(name: string): Promise<void> {
  await fetch(`/api/skills/${encodeURIComponent(name)}`, { method: 'DELETE' });
}
```

### 4. Update Existing Dashboard Panels

Panels that reference deleted modules need updating:

| Panel | Change |
|-------|--------|
| Providers panel | Wire to `GET /api/providers` — show status, failover order, availability |
| Security panel | Wire to `GET/PATCH /api/security` — profile selector + individual overrides |
| Skills panel | Already covered by Chunk 8.6 |
| Agents panel | Verify no imports from deleted packages; update run status to show current provider name |

### 5. Update TypeScript Config

Ensure `tsconfig.json` path aliases don't reference deleted packages:

```bash
grep -r "franken-mcp\|franken-skills\|franken-heartbeat\|frankenfirewall\|franken-comms" packages/franken-web/tsconfig.json
```

Remove any stale path mappings.

### 6. Verify SSE Connection

The dashboard uses SSE for real-time updates. Verify the SSE client still works with the orchestrator's consolidated server (comms absorbed in Phase 1.1):

- SSE endpoint URL unchanged (or updated if moved)
- Event types still match
- No references to `@frankenbeast/comms` event types — use orchestrator's event types directly

## Tests

```typescript
// packages/franken-web/tests/api/client.test.ts

describe('API client', () => {
  it('getProviders fetches from /api/providers', async () => {
    fetchMock.mockResponseOnce(JSON.stringify([{ name: 'claude-cli', available: true }]));
    const providers = await getProviders();
    expect(providers).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/providers');
  });

  it('getSecurityConfig fetches from /api/security', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ profile: 'standard' }));
    const config = await getSecurityConfig();
    expect(config.profile).toBe('standard');
  });

  it('patchSecurityConfig sends PATCH to /api/security', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ profile: 'strict' }));
    await patchSecurityConfig({ profile: 'strict' });
    expect(fetchMock).toHaveBeenCalledWith('/api/security', expect.objectContaining({
      method: 'PATCH',
    }));
  });

  it('toggleSkill sends PATCH with enabled flag', async () => {
    fetchMock.mockResponseOnce('');
    await toggleSkill('github', false);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/skills/github',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('deleteSkill sends DELETE', async () => {
    fetchMock.mockResponseOnce('');
    await deleteSkill('github');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/skills/github',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('encodes skill names with special characters', async () => {
    fetchMock.mockResponseOnce('');
    await toggleSkill('my skill/v2', true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/skills/my%20skill%2Fv2',
      expect.anything(),
    );
  });
});

// packages/franken-web/tests/build.test.ts

describe('franken-web build', () => {
  it('has no imports from deleted packages', async () => {
    // This is a grep-based test that runs in CI
    const { execSync } = await import('child_process');
    const result = execSync(
      'grep -r "franken-mcp\\|franken-skills\\|franken-heartbeat\\|frankenfirewall\\|franken-comms" packages/franken-web/src/ || true',
      { encoding: 'utf-8' },
    );
    expect(result.trim()).toBe('');
  });
});
```

## Files

- **Modify:** `packages/franken-web/package.json` — remove deleted workspace deps
- **Modify:** `packages/franken-web/tsconfig.json` — remove stale path aliases
- **Modify:** `packages/franken-web/src/api/client.ts` — add provider, security, skill API functions
- **Modify:** Various `packages/franken-web/src/components/` files — replace deleted package imports
- **Modify:** `packages/franken-web/src/components/panels/ProvidersPanel.tsx` — wire to new API
- **Modify:** `packages/franken-web/src/components/panels/SecurityPanel.tsx` — wire to new API
- **Add:** `packages/franken-web/tests/api/client.test.ts`

## Exit Criteria

- Zero imports from deleted packages (`franken-mcp`, `franken-skills`, `franken-heartbeat`, `frankenfirewall`, `franken-comms`)
- `package.json` has no workspace deps on deleted packages
- `tsconfig.json` has no stale path aliases
- API client functions exist for all new endpoints (providers, security, skills)
- Providers panel shows provider status and failover order
- Security panel shows profile selector and individual overrides
- SSE connection works with consolidated orchestrator server
- `npm run build` and `npm run typecheck` pass for `franken-web`
- All tests pass
