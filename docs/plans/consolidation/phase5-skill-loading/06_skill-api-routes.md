# Chunk 5.6: Skill Management API Routes

**Phase:** 5 — Skill Loading
**Depends on:** Chunk 5.2 (SkillManager)
**Estimated size:** Medium (~100 lines + integration tests)

---

## Purpose

Expose skill management via REST API routes for the dashboard to consume.

## Implementation

```typescript
// packages/franken-orchestrator/src/http/routes/skill-routes.ts

import { Hono } from 'hono';
import type { SkillManager } from '../../skills/skill-manager.js';
import type { ProviderRegistry } from '../../providers/provider-registry.js';

export function createSkillRoutes(deps: {
  skillManager: SkillManager;
  providerRegistry: ProviderRegistry;
}): Hono {
  const app = new Hono();

  // GET /api/skills — list installed skills with enabled/disabled state
  app.get('/', (c) => {
    const skills = deps.skillManager.listInstalled();
    return c.json({ skills });
  });

  // GET /api/skills/catalog/:provider — browse provider marketplace
  app.get('/catalog/:provider', async (c) => {
    const providerName = c.req.param('provider');
    const providers = await deps.providerRegistry.listProviders();
    const provider = providers.find(p => p.provider.name === providerName);

    if (!provider) {
      return c.json({ error: `Provider '${providerName}' not found` }, 404);
    }
    if (!provider.provider.discoverSkills) {
      return c.json({ catalog: [], message: 'Provider does not support skill discovery' });
    }

    const catalog = await provider.provider.discoverSkills();
    return c.json({ catalog });
  });

  // POST /api/skills — install from catalog or create custom MCP
  app.post('/', async (c) => {
    const body = await c.req.json();

    if (body.catalogEntry) {
      // Install from marketplace catalog
      await deps.skillManager.install(body.catalogEntry);
      return c.json({ installed: body.catalogEntry.name }, 201);
    }

    if (body.custom) {
      // Install custom MCP server
      await deps.skillManager.installCustom(body.custom.name, body.custom.config);
      return c.json({ installed: body.custom.name }, 201);
    }

    return c.json({ error: 'Must provide catalogEntry or custom' }, 400);
  });

  // PATCH /api/skills/:name — toggle enable/disable
  app.patch('/:name', async (c) => {
    const name = c.req.param('name');
    const body = await c.req.json();

    if (body.enabled === true) {
      deps.skillManager.enable(name);
    } else if (body.enabled === false) {
      deps.skillManager.disable(name);
    }

    const skills = deps.skillManager.listInstalled();
    const skill = skills.find(s => s.name === name);
    return c.json({ skill });
  });

  // DELETE /api/skills/:name — remove skill
  app.delete('/:name', (c) => {
    const name = c.req.param('name');
    deps.skillManager.remove(name);
    return c.json({ removed: name });
  });

  return app;
}
```

## Tests

```typescript
// packages/franken-orchestrator/tests/integration/skills/skill-routes.test.ts

describe('Skill API routes', () => {
  // Set up test app with temp skills directory and mock provider registry

  describe('GET /api/skills', () => {
    it('returns empty array when no skills installed', () => { ... });
    it('returns installed skills with metadata', () => { ... });
    it('reflects enabled/disabled state', () => { ... });
  });

  describe('GET /api/skills/catalog/:provider', () => {
    it('returns catalog from provider discoverSkills()', () => { ... });
    it('returns 404 for unknown provider', () => { ... });
    it('returns empty catalog for providers without discovery', () => { ... });
  });

  describe('POST /api/skills', () => {
    it('installs from catalog entry', () => { ... });
    it('installs custom MCP server', () => { ... });
    it('returns 400 when neither catalogEntry nor custom provided', () => { ... });
    it('creates skill directory with mcp.json', () => { ... });
  });

  describe('PATCH /api/skills/:name', () => {
    it('enables a skill', () => { ... });
    it('disables a skill', () => { ... });
  });

  describe('DELETE /api/skills/:name', () => {
    it('removes skill directory', () => { ... });
    it('returns removed name', () => { ... });
  });
});
```

## Files

- **Add:** `packages/franken-orchestrator/src/http/routes/skill-routes.ts`
- **Add:** `packages/franken-orchestrator/tests/integration/skills/skill-routes.test.ts`

## Exit Criteria

- All 5 routes implemented and tested
- GET returns installed skills with correct metadata
- POST installs from catalog or custom
- PATCH toggles enable/disable only
- DELETE removes skill directory
- Integration tests use temp directory and mock providers
