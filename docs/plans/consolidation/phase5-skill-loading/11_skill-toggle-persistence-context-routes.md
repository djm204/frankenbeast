# Chunk 5.11: Skill Toggle Persistence + Context Routes

**Phase:** 5 — Skill Loading
**Depends on:** Chunk 5.2 (SkillManager), Chunk 5.6 (skill routes)
**Estimated size:** Medium (~150 lines + tests)

---

## Purpose

The ADR requires skills to be toggleable from both run config and dashboard. Chunk 5.2 currently tracks enabled skills in memory, and Chunk 5.6 exposes a toggle API, but neither persists dashboard-driven state across restarts.

This chunk adds:
- a durable project-local enabled-skill config
- explicit `context.md` read/write routes for the dashboard editor
- clear precedence between persisted defaults and per-run `skills:` overrides

## Design

### Persisted Skill State

Store dashboard-managed defaults in `.frankenbeast/config.json`:

```json
{
  "skills": {
    "enabled": ["github", "linear", "code-review"]
  }
}
```

This file is the durable default state for installed skills.

### Precedence

Use this precedence when deciding which skills are enabled for a run:

1. Run config `skills:` if present
2. Persisted `.frankenbeast/config.json` enabled list
3. Empty list

That keeps run config as an explicit override while still letting the dashboard behave like a durable settings UI.

### Context Routes

The dashboard skill editor already expects dedicated context endpoints. Make them explicit:

- `GET /api/skills/:name/context`
- `PUT /api/skills/:name/context`

`PATCH /api/skills/:name` remains responsible for enable/disable only.

## Implementation

### 1. Add a small project config store

```typescript
// packages/franken-orchestrator/src/skills/skill-config-store.ts

import fs from 'node:fs';
import path from 'node:path';

interface SkillDefaultsConfig {
  skills?: {
    enabled?: string[];
  };
}

export class SkillConfigStore {
  constructor(private readonly projectRoot: string) {}

  loadEnabledSkills(): string[] {
    const config = this.load();
    return config.skills?.enabled ?? [];
  }

  saveEnabledSkills(enabled: string[]): void {
    const config = this.load();
    config.skills ??= {};
    config.skills.enabled = [...new Set(enabled)].sort();
    this.save(config);
  }

  private load(): SkillDefaultsConfig {
    const file = path.join(this.projectRoot, '.frankenbeast', 'config.json');
    if (!fs.existsSync(file)) return {};
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  }

  private save(config: SkillDefaultsConfig): void {
    const dir = path.join(this.projectRoot, '.frankenbeast');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config, null, 2));
  }
}
```

### 2. Update `SkillManager`

Inject `SkillConfigStore` into `SkillManager`.

- constructor seeds `enabledSkills` from persisted config when run config does not override
- `enable()` persists after mutation
- `disable()` persists after mutation
- `remove()` persists after mutation

Add one helper:

```typescript
getContext(name: string): string {
  return this.readContext(name) ?? '';
}
```

### 3. Extend skill routes

Add explicit context endpoints:

```typescript
app.get('/:name/context', (c) => {
  const name = c.req.param('name');
  const context = deps.skillManager.getContext(name);
  return c.text(context);
});

app.put('/:name/context', async (c) => {
  const name = c.req.param('name');
  const body = await c.req.text();
  deps.skillManager.writeContext(name, body);
  return c.json({ name, updated: true });
});
```

Reduce `PATCH /api/skills/:name` to enable/disable only.

### 4. Wire run-config precedence

When building the `SkillManager` in `dep-factory.ts`:

- if `config.skills` is defined, treat it as the active set for that run
- otherwise load the default enabled set from `SkillConfigStore`

This chunk does not rewrite `.frankenbeast.yml`; it only makes dashboard state durable in `.frankenbeast/config.json`.

## Tests

```typescript
describe('SkillConfigStore', () => {
  it('returns empty array when config file is missing', () => { ... });
  it('persists enabled skill names to .frankenbeast/config.json', () => { ... });
  it('deduplicates and sorts enabled skill names', () => { ... });
});

describe('SkillManager persistence', () => {
  it('loads enabled skills from persisted config by default', () => { ... });
  it('enable() persists updated enabled state', () => { ... });
  it('disable() persists updated enabled state', () => { ... });
  it('remove() removes deleted skill from persisted enabled state', () => { ... });
  it('run config skills override persisted defaults', () => { ... });
});

describe('Skill context routes', () => {
  it('GET /api/skills/:name/context returns context.md contents', () => { ... });
  it('GET /api/skills/:name/context returns empty string when missing', () => { ... });
  it('PUT /api/skills/:name/context writes context.md', () => { ... });
});
```

## Files

- **Add:** `packages/franken-orchestrator/src/skills/skill-config-store.ts`
- **Modify:** `packages/franken-orchestrator/src/skills/skill-manager.ts`
- **Modify:** `packages/franken-orchestrator/src/http/routes/skill-routes.ts`
- **Modify:** `packages/franken-orchestrator/src/cli/dep-factory.ts`
- **Add:** `packages/franken-orchestrator/tests/unit/skills/skill-config-store.test.ts`
- **Modify:** `packages/franken-orchestrator/tests/unit/skills/skill-manager.test.ts`
- **Modify:** `packages/franken-orchestrator/tests/integration/skills/skill-routes.test.ts`

## Exit Criteria

- Dashboard/API skill toggles persist across process restarts
- Per-run `skills:` override still works and takes precedence
- `GET /api/skills/:name/context` and `PUT /api/skills/:name/context` are implemented and tested
- `PATCH /api/skills/:name` only owns enable/disable state
- `.frankenbeast/config.json` is the durable default skill-state store
