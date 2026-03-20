# Chunk 8.3: Dashboard Simple/Advanced Modes

**Phase:** 8 — Wire Everything Together
**Depends on:** Chunk 8.1 (dep-factory provides backend APIs), Phase 4 (security routes), Phase 5 (skill routes)
**Estimated size:** Large (~800 lines React + API routes)

---

## Purpose

Update the `franken-web` dashboard with two modes — Simple (default) and Advanced — and four panels (Agents, Skills, Providers, Security). Simple mode works with zero config. Advanced mode exposes granular control. Also add the missing Provider API routes needed by the dashboard.

## Design Principle

**If it needs a tutorial, it's too complex.**

## Layout

```
┌─────────────────────────────────────────────────────┐
│  Frankenbeast Dashboard       [Simple ◉ │ Advanced] │
├──────────┬──────────┬──────────┬────────────────────┤
│  Agents  │  Skills  │ Providers│  Security          │
├──────────┴──────────┴──────────┴────────────────────┤
│                                                      │
│  [Active panel content here]                         │
│                                                      │
└──────────────────────────────────────────────────────┘
```

Mode toggle in top-right. Preference persisted in `localStorage`. Simple mode is default.

---

## Part 1: Provider API Routes (Backend)

The Skills API lives in Phase 5.6, the Security API in Phase 4.3, and the Beasts API pre-exists. The **Provider API** is new and must be created here.

### Provider API Response Shape

```typescript
// packages/franken-orchestrator/src/http/routes/provider-routes.ts

interface ProviderListItem {
  name: string;
  type: 'claude-cli' | 'codex-cli' | 'gemini-cli' | 'anthropic-api' | 'openai-api' | 'gemini-api';
  authenticated: boolean;
  authMethod: 'cli-login' | 'api-key' | 'none';
  capabilities: {
    streaming: boolean;
    toolUse: boolean;
    vision: boolean;
    maxContextTokens: number;
    mcpSupport: boolean;
    skillDiscovery: boolean;
  };
  order: number;  // failover priority (0 = primary)
}
```

### Provider Routes

```typescript
import { Hono } from 'hono';
import type { ProviderRegistry } from '../../providers/provider-registry.js';

export function createProviderRoutes(deps: {
  registry: ProviderRegistry;
  saveProviderConfig: (name: string, config: ProviderConfig) => Promise<void>;
  saveProviderOrder: (names: string[]) => Promise<void>;
  removeProvider: (name: string) => Promise<void>;
}): Hono {
  const app = new Hono();

  // GET /api/providers — list all configured providers with auth status
  app.get('/', async (c) => {
    const providerStatuses = await deps.registry.listProviders();
    const items: ProviderListItem[] = providerStatuses.map((ps, i) => ({
      name: ps.provider.name,
      type: ps.provider.type,
      authenticated: ps.available,
      authMethod: ps.provider.authMethod ?? 'none',
      capabilities: ps.provider.capabilities,
      order: i,
    }));
    return c.json(items);
  });

  // POST /api/providers — add a new provider
  app.post('/', async (c) => {
    const body = await c.req.json<{ name: string; type: string; apiKey?: string }>();

    // Validate provider type
    const validTypes = ['claude-cli', 'codex-cli', 'gemini-cli', 'anthropic-api', 'openai-api', 'gemini-api'];
    if (!validTypes.includes(body.type)) {
      return c.json({ error: `Invalid provider type. Valid: ${validTypes.join(', ')}` }, 400);
    }

    await deps.saveProviderConfig(body.name, {
      name: body.name,
      type: body.type as ProviderConfig['type'],
      apiKey: body.apiKey,
    });

    return c.json({ status: 'added', name: body.name }, 201);
  });

  // PATCH /api/providers/order — set failover priority
  app.patch('/order', async (c) => {
    const body = await c.req.json<{ order: string[] }>();
    if (!Array.isArray(body.order) || body.order.length === 0) {
      return c.json({ error: 'order must be a non-empty array of provider names' }, 400);
    }

    deps.registry.setOrder(body.order);
    await deps.saveProviderOrder(body.order);

    return c.json({ status: 'updated', order: body.order });
  });

  // DELETE /api/providers/:name — remove a provider
  app.delete('/:name', async (c) => {
    const name = c.req.param('name');
    // Remove from registry and persisted config
    await deps.removeProvider(name);
    return c.json({ status: 'removed', name });
  });

  return app;
}
```

### Provider Routes Tests

```typescript
// packages/franken-orchestrator/tests/integration/providers/provider-routes.test.ts

describe('Provider API routes', () => {
  let app: Hono;
  let mockRegistry: ProviderRegistry;

  beforeEach(() => {
    mockRegistry = createMockProviderRegistry([
      { name: 'claude', type: 'claude-cli', available: true },
      { name: 'openai', type: 'openai-api', available: false },
    ]);
    app = createProviderRoutes({ registry: mockRegistry, ... });
  });

  describe('GET /api/providers', () => {
    it('returns all providers with auth status', async () => {
      const res = await app.request('/');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
      expect(body[0]).toMatchObject({
        name: 'claude',
        authenticated: true,
        order: 0,
      });
      expect(body[1]).toMatchObject({
        name: 'openai',
        authenticated: false,
        order: 1,
      });
    });

    it('includes capabilities for each provider', async () => {
      const res = await app.request('/');
      const body = await res.json();
      expect(body[0].capabilities).toMatchObject({
        streaming: true,
        mcpSupport: true,
      });
    });
  });

  describe('POST /api/providers', () => {
    it('adds a new provider', async () => {
      const res = await app.request('/', {
        method: 'POST',
        body: JSON.stringify({ name: 'gemini', type: 'gemini-cli' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(201);
    });

    it('rejects invalid provider type', async () => {
      const res = await app.request('/', {
        method: 'POST',
        body: JSON.stringify({ name: 'bad', type: 'invalid' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/providers/order', () => {
    it('updates failover priority', async () => {
      const res = await app.request('/order', {
        method: 'PATCH',
        body: JSON.stringify({ order: ['openai', 'claude'] }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(200);
      expect(mockRegistry.setOrder).toHaveBeenCalledWith(['openai', 'claude']);
    });

    it('rejects empty order array', async () => {
      const res = await app.request('/order', {
        method: 'PATCH',
        body: JSON.stringify({ order: [] }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/providers/:name', () => {
    it('removes a provider', async () => {
      const res = await app.request('/claude', { method: 'DELETE' });
      expect(res.status).toBe(200);
    });
  });
});
```

### Where Provider Order Is Persisted

Provider order is stored in `.frankenbeast/config.json` (gitignored):

```json
{
  "providerOrder": ["claude", "openai", "gemini"],
  "providers": {
    "claude": { "type": "claude-cli", "auth": "cli-login" },
    "openai": { "type": "openai-api", "apiKey": "sk-..." }
  }
}
```

The dashboard `PATCH /api/providers/order` and CLI `frankenbeast provider order` both write to this file. On startup, `dep-factory.ts` reads it to build the `ProviderRegistry`.

---

## Part 2: Dashboard Data Hooks (Frontend)

Every panel needs a data hook. These wrap `fetch()` calls to the API.

```typescript
// packages/franken-web/src/hooks/useApi.ts

/** Generic hook for GET endpoints with SWR-style caching */
export function useApi<T>(url: string): { data: T | null; loading: boolean; error: string | null; mutate: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => { mutate(); }, [mutate]);
  return { data, loading, error, mutate };
}

// packages/franken-web/src/hooks/useAgents.ts
export function useAgents() {
  return useApi<Agent[]>('/api/beasts');
}

// packages/franken-web/src/hooks/useSkills.ts
export function useSkills() {
  return useApi<SkillInfo[]>('/api/skills');
}

// packages/franken-web/src/hooks/useProviders.ts
export function useProviders() {
  return useApi<ProviderListItem[]>('/api/providers');
}

// packages/franken-web/src/hooks/useSecurity.ts
export function useSecurity() {
  return useApi<SecurityConfig & { isCustomized: boolean }>('/api/security');
}

// packages/franken-web/src/hooks/useLocalStorage.ts
export function useLocalStorage<T>(key: string, defaultValue: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  });

  const set = useCallback((newValue: T) => {
    setValue(newValue);
    localStorage.setItem(key, JSON.stringify(newValue));
  }, [key]);

  return [value, set];
}
```

### Data Type Definitions (Frontend)

```typescript
// packages/franken-web/src/types.ts

export interface Agent {
  id: string;
  name: string;            // first ~50 chars of objective
  objective: string;
  status: 'running' | 'stopped' | 'completed' | 'failed';
  provider: string;
  startedAt: string;
  completedAt?: string;
}

export interface SkillInfo {
  name: string;
  enabled: boolean;
  hasContext: boolean;
  provider?: string;
  mcpServerCount: number;
  mcpStatus: 'connected' | 'error' | 'unknown';  // live MCP server health
  installedAt: string;
}

export interface ProviderListItem {
  name: string;
  type: string;
  authenticated: boolean;
  authMethod: 'cli-login' | 'api-key' | 'none';
  capabilities: {
    streaming: boolean;
    toolUse: boolean;
    vision: boolean;
    maxContextTokens: number;
    mcpSupport: boolean;
    skillDiscovery: boolean;
  };
  order: number;
}
```

---

## Part 3: Panel Components (Frontend)

### Mode Toggle

```typescript
// packages/franken-web/src/components/ModeToggle.tsx

export function ModeToggle() {
  const [mode, setMode] = useLocalStorage<'simple' | 'advanced'>('dashboard-mode', 'simple');

  return (
    <div className="mode-toggle">
      <button className={mode === 'simple' ? 'active' : ''} onClick={() => setMode('simple')}>
        Simple
      </button>
      <button className={mode === 'advanced' ? 'active' : ''} onClick={() => setMode('advanced')}>
        Advanced
      </button>
    </div>
  );
}
```

### Agents Panel

**Simple mode:**
- Agent cards with status badge (running / stopped / failed)
- "New Run" button → text input only (uses default provider + all enabled skills)
- Click agent card → live logs stream via SSE

**Advanced mode adds:**
- "New Run" with provider selector dropdown, skill override checkboxes, security profile selector
- Run timeline visualization with provider switch events and brain snapshots
- Provider badge on each agent card

```typescript
// packages/franken-web/src/panels/AgentsPanel.tsx

export function AgentsPanel({ mode }: { mode: 'simple' | 'advanced' }) {
  const { data: agents, loading, error, mutate } = useAgents();

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} action="Check that the server is running" />;

  return (
    <div className="agents-panel">
      <NewRunForm mode={mode} onCreated={mutate} />
      <div className="agent-grid">
        {agents?.length === 0 && <EmptyState message="No agents yet. Start a run above." />}
        {agents?.map(agent => (
          <AgentCard key={agent.id} agent={agent} mode={mode} />
        ))}
      </div>
    </div>
  );
}

/** Simple: text input + submit. Advanced: text + provider + skills + security selectors. */
function NewRunForm({ mode, onCreated }: { mode: string; onCreated: () => void }) {
  const [objective, setObjective] = useState('');
  const [provider, setProvider] = useState<string | undefined>();
  const [skills, setSkills] = useState<string[]>([]);
  const [security, setSecurity] = useState<string | undefined>();
  const { data: providers } = useProviders();
  const { data: installedSkills } = useSkills();

  const submit = async () => {
    const body: Record<string, unknown> = { objective };
    if (mode === 'advanced') {
      if (provider) body.provider = provider;
      if (skills.length > 0) body.skills = skills;
      if (security) body.security = { profile: security };
    }
    await fetch('/api/beasts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setObjective('');
    onCreated();
  };

  return (
    <div className="new-run-form">
      <input
        value={objective}
        onChange={e => setObjective(e.target.value)}
        placeholder="What should the agent do?"
        onKeyDown={e => e.key === 'Enter' && submit()}
      />
      {mode === 'advanced' && (
        <div className="advanced-options">
          <select value={provider} onChange={e => setProvider(e.target.value)}>
            <option value="">Default provider</option>
            {providers?.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
          <div className="skill-checkboxes">
            {installedSkills?.filter(s => s.enabled).map(s => (
              <label key={s.name}>
                <input
                  type="checkbox"
                  checked={skills.includes(s.name)}
                  onChange={e => {
                    setSkills(prev => e.target.checked
                      ? [...prev, s.name]
                      : prev.filter(n => n !== s.name));
                  }}
                />
                {s.name}
              </label>
            ))}
          </div>
          <select value={security} onChange={e => setSecurity(e.target.value)}>
            <option value="">Default security</option>
            <option value="strict">Strict</option>
            <option value="standard">Standard</option>
            <option value="permissive">Permissive</option>
          </select>
        </div>
      )}
      <button onClick={submit} disabled={!objective.trim()}>Run</button>
    </div>
  );
}

function AgentCard({ agent, mode }: { agent: Agent; mode: string }) {
  const navigate = useNavigate();
  return (
    <div className="agent-card" onClick={() => navigate(`/agents/${agent.id}`)}>
      <StatusBadge status={agent.status} />
      <span className="agent-name">{agent.name}</span>
      {mode === 'advanced' && <ProviderBadge provider={agent.provider} />}
      <span className="agent-time">{formatRelativeTime(agent.startedAt)}</span>
    </div>
  );
}

/** Color + text status indicator (never color alone per UX principles) */
function StatusBadge({ status }: { status: Agent['status'] }) {
  const colors: Record<string, string> = {
    running: 'green', completed: 'green', stopped: 'yellow', failed: 'red',
  };
  return (
    <span className={`status-badge status-${status}`}>
      <span className="status-dot" style={{ backgroundColor: colors[status] }} />
      {status}
    </span>
  );
}
```

### Agent Log View (SSE Stream)

```typescript
// packages/franken-web/src/panels/AgentLogView.tsx

export function AgentLogView({ agentId }: { agentId: string }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      // ADR-030: obtain single-use connection ticket before opening SSE
      const ticketRes = await fetch(`/api/beasts/events/ticket`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getOperatorToken()}` },
      });
      if (!ticketRes.ok || cancelled) return;
      const { ticket } = await ticketRes.json();

      const es = new EventSource(`/api/beasts/${agentId}/events?ticket=${ticket}`);
      es.onopen = () => setConnected(true);
      es.onmessage = (e) => {
        const event = JSON.parse(e.data);
        setEvents(prev => [...prev, event]);
      };
      es.onerror = () => {
        setConnected(false);
        es.close();
        // ADR-030: on reconnect, obtain a fresh ticket
        if (!cancelled) setTimeout(connect, 1000);
      };
      // Cleanup on unmount
      if (cancelled) es.close();
      else esRef.current = es;
    }

    connect();
    return () => { cancelled = true; esRef.current?.close(); };
  }, [agentId]);

  return (
    <div className="agent-log-view">
      <ConnectionStatus connected={connected} />
      <div className="event-timeline">
        {events.map((event, i) => (
          <EventRow key={event.eventId ?? i} event={event} />
        ))}
      </div>
    </div>
  );
}

function EventRow({ event }: { event: AuditEvent }) {
  const isPhaseEvent = event.type.startsWith('phase.');
  const isSwitch = event.type === 'provider.switch';

  return (
    <div className={`event-row ${isPhaseEvent ? 'phase-event' : ''} ${isSwitch ? 'switch-event' : ''}`}>
      <span className="event-time">{formatTime(event.timestamp)}</span>
      <span className="event-type">{event.type}</span>
      {isSwitch && (
        <span className="switch-info">
          {event.payload.from} → {event.payload.to} ({event.payload.reason})
        </span>
      )}
      {event.type === 'llm.text' && (
        <span className="event-content">{event.payload.content}</span>
      )}
    </div>
  );
}
```

### Skills Panel

**Simple mode:**
- Grid of installed skill cards with on/off toggle switches
- "Add Skill" button → marketplace browser (single flat list, auto-detects provider)
- No context editing, no custom MCP, no auth forms

**Advanced mode adds:**
- Each card shows: provider origin, MCP server status (green/red dot), has-context badge
- "Browse Catalog" → tabbed view per provider, fetches `GET /api/skills/catalog/:provider`
- Install flow: click marketplace skill → auth form (API key or "use CLI login" toggle) → `POST /api/skills`
- "Add Custom" button → form: server command, args, env vars → `POST /api/skills`
- Click skill card → inline `context.md` editor

```typescript
// packages/franken-web/src/panels/SkillsPanel.tsx

export function SkillsPanel({ mode }: { mode: 'simple' | 'advanced' }) {
  const { data: skills, loading, error, mutate } = useSkills();
  const [showCatalog, setShowCatalog] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [editingContext, setEditingContext] = useState<string | null>(null);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} action="Check server connection" />;

  return (
    <div className="skills-panel">
      <div className="skills-actions">
        <button onClick={() => setShowCatalog(true)}>
          {mode === 'simple' ? 'Add Skill' : 'Browse Catalog'}
        </button>
        {mode === 'advanced' && (
          <button onClick={() => setShowCustomForm(true)}>Add Custom</button>
        )}
      </div>

      {showCatalog && (
        <SkillCatalogBrowser
          mode={mode}
          onInstall={() => { setShowCatalog(false); mutate(); }}
          onClose={() => setShowCatalog(false)}
        />
      )}

      {showCustomForm && (
        <CustomSkillForm
          onInstall={() => { setShowCustomForm(false); mutate(); }}
          onClose={() => setShowCustomForm(false)}
        />
      )}

      {editingContext && (
        <ContextEditor
          skillName={editingContext}
          onClose={() => setEditingContext(null)}
        />
      )}

      <div className="skill-grid">
        {skills?.length === 0 && <EmptyState message="No skills installed. Add one from the catalog." />}
        {skills?.map(skill => (
          <SkillCard
            key={skill.name}
            skill={skill}
            mode={mode}
            onToggle={async () => {
              await fetch(`/api/skills/${skill.name}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: !skill.enabled }),
              });
              mutate();
            }}
            onEditContext={mode === 'advanced' ? () => setEditingContext(skill.name) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function SkillCard({ skill, mode, onToggle, onEditContext }: {
  skill: SkillInfo; mode: string; onToggle: () => void; onEditContext?: () => void;
}) {
  return (
    <div className="skill-card">
      <div className="skill-header">
        <span className="skill-name">{skill.name}</span>
        <ToggleSwitch checked={skill.enabled} onChange={onToggle} />
      </div>
      {mode === 'advanced' && (
        <div className="skill-details">
          {skill.provider && <span className="provider-origin">{skill.provider}</span>}
          <McpStatusDot status={skill.mcpStatus} />
          {skill.hasContext && (
            <button className="context-badge" onClick={onEditContext}>context.md</button>
          )}
          {!skill.hasContext && onEditContext && (
            <button className="add-context" onClick={onEditContext}>+ context</button>
          )}
        </div>
      )}
    </div>
  );
}

/** Color + text MCP status (never color alone) */
function McpStatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = { connected: 'green', error: 'red', unknown: 'gray' };
  return (
    <span className="mcp-status">
      <span className="dot" style={{ backgroundColor: colors[status] }} />
      {status}
    </span>
  );
}
```

### Skill Catalog Browser

```typescript
// packages/franken-web/src/components/SkillCatalogBrowser.tsx

export function SkillCatalogBrowser({ mode, onInstall, onClose }: {
  mode: string; onInstall: () => void; onClose: () => void;
}) {
  const { data: providers } = useProviders();
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<SkillCatalogEntry[]>([]);
  const [installing, setInstalling] = useState<string | null>(null);

  // In simple mode: fetch all providers' catalogs into a flat list
  // In advanced mode: tabbed view per provider
  useEffect(() => {
    const fetchCatalog = async () => {
      if (mode === 'simple') {
        // Fetch all catalogs and merge
        const all: SkillCatalogEntry[] = [];
        for (const p of providers ?? []) {
          const res = await fetch(`/api/skills/catalog/${p.name}`);
          if (res.ok) all.push(...await res.json());
        }
        setCatalog(all);
      } else if (selectedProvider) {
        const res = await fetch(`/api/skills/catalog/${selectedProvider}`);
        if (res.ok) setCatalog(await res.json());
      }
    };
    fetchCatalog();
  }, [mode, selectedProvider, providers]);

  const installSkill = async (entry: SkillCatalogEntry) => {
    setInstalling(entry.name);
    await fetch('/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ catalogEntry: entry }),
    });
    setInstalling(null);
    onInstall();
  };

  return (
    <div className="catalog-modal">
      <div className="catalog-header">
        <h3>Skill Catalog</h3>
        <button onClick={onClose}>Close</button>
      </div>

      {mode === 'advanced' && (
        <div className="provider-tabs">
          {providers?.map(p => (
            <button
              key={p.name}
              className={selectedProvider === p.name ? 'active' : ''}
              onClick={() => setSelectedProvider(p.name)}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      <div className="catalog-grid">
        {catalog.length === 0 && <EmptyState message="No skills available from this provider." />}
        {catalog.map(entry => (
          <div key={entry.name} className="catalog-entry">
            <span className="entry-name">{entry.name}</span>
            <span className="entry-description">{entry.description}</span>
            {mode === 'simple' && <span className="entry-provider">{entry.provider}</span>}
            <button
              onClick={() => installSkill(entry)}
              disabled={installing === entry.name}
            >
              {installing === entry.name ? 'Installing...' : 'Install'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Custom Skill Form

```typescript
// packages/franken-web/src/components/CustomSkillForm.tsx

export function CustomSkillForm({ onInstall, onClose }: {
  onInstall: () => void; onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>([]);

  const submit = async () => {
    await fetch('/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        custom: true,
        name,
        serverConfig: {
          command,
          args: args.split(',').map(a => a.trim()).filter(Boolean),
          env: Object.fromEntries(envVars.filter(e => e.key).map(e => [e.key, e.value])),
        },
      }),
    });
    onInstall();
  };

  return (
    <div className="custom-skill-modal">
      <h3>Add Custom MCP Skill</h3>
      <label>Skill name <input value={name} onChange={e => setName(e.target.value)} /></label>
      <label>Server command <input value={command} onChange={e => setCommand(e.target.value)} placeholder="npx" /></label>
      <label>Arguments <input value={args} onChange={e => setArgs(e.target.value)} placeholder="-y, @some/mcp-server" /></label>

      <div className="env-vars">
        <h4>Environment Variables</h4>
        {envVars.map((v, i) => (
          <div key={i} className="env-row">
            <input placeholder="KEY" value={v.key} onChange={e => {
              const next = [...envVars]; next[i].key = e.target.value; setEnvVars(next);
            }} />
            <input placeholder="value" value={v.value} onChange={e => {
              const next = [...envVars]; next[i].value = e.target.value; setEnvVars(next);
            }} />
          </div>
        ))}
        <button onClick={() => setEnvVars([...envVars, { key: '', value: '' }])}>+ Add Variable</button>
      </div>

      <div className="form-actions">
        <button onClick={onClose}>Cancel</button>
        <button onClick={submit} disabled={!name || !command}>Install</button>
      </div>
    </div>
  );
}
```

### Context Editor

```typescript
// packages/franken-web/src/components/ContextEditor.tsx

export function ContextEditor({ skillName, onClose }: { skillName: string; onClose: () => void }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/skills/${skillName}/context`)
      .then(res => res.ok ? res.text() : '')
      .then(text => { setContent(text); setLoading(false); });
  }, [skillName]);

  const save = async () => {
    await fetch(`/api/skills/${skillName}/context`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: content,
    });
    onClose();
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="context-editor-modal">
      <h3>context.md — {skillName}</h3>
      <p className="context-help">
        Add team-specific conventions for this skill. This text is injected into the system prompt.
      </p>
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        rows={20}
        placeholder="# Team conventions for this skill..."
      />
      <div className="form-actions">
        <button onClick={onClose}>Cancel</button>
        <button onClick={save}>Save</button>
      </div>
    </div>
  );
}
```

**Note:** Context editor requires two additional skill routes not in Phase 5.6:
- `GET /api/skills/:name/context` — read context.md
- `PUT /api/skills/:name/context` — write context.md

These are defined by Phase 5, Chunk 5.11.

### Providers Panel

**Simple mode:**
- Provider cards with green/red auth status indicator
- "Add" button → detects installed CLIs, one-click add
- No failover ordering

**Advanced mode adds:**
- Drag-to-reorder failover priority
- Click card → configure: API key input field OR "using CLI login" indicator
- Per-provider capability display

```typescript
// packages/franken-web/src/panels/ProvidersPanel.tsx

export function ProvidersPanel({ mode }: { mode: 'simple' | 'advanced' }) {
  const { data: providers, loading, error, mutate } = useProviders();

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} action="Check server connection" />;

  const handleReorder = async (result: DropResult) => {
    if (!result.destination || !providers) return;
    const reordered = [...providers];
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    await fetch('/api/providers/order', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: reordered.map(p => p.name) }),
    });
    mutate();
  };

  if (mode === 'advanced') {
    return (
      <div className="providers-panel">
        <DragDropContext onDragEnd={handleReorder}>
          <Droppable droppableId="providers">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps}>
                {providers?.map((p, i) => (
                  <Draggable key={p.name} draggableId={p.name} index={i}>
                    {(provided) => (
                      <div ref={provided.innerRef} {...provided.draggableProps}>
                        <AdvancedProviderCard provider={p} dragHandle={provided.dragHandleProps} />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>
    );
  }

  return (
    <div className="providers-panel">
      <AddProviderButton onAdded={mutate} />
      {providers?.length === 0 && (
        <EmptyState message="No providers configured. Add one to get started." />
      )}
      <div className="provider-grid">
        {providers?.map(p => (
          <SimpleProviderCard key={p.name} provider={p} />
        ))}
      </div>
    </div>
  );
}

function SimpleProviderCard({ provider }: { provider: ProviderListItem }) {
  return (
    <div className="provider-card">
      <span className="provider-name">{provider.name}</span>
      <AuthStatusIndicator authenticated={provider.authenticated} method={provider.authMethod} />
    </div>
  );
}

/** Color + text auth indicator (never color alone) */
function AuthStatusIndicator({ authenticated, method }: { authenticated: boolean; method: string }) {
  return (
    <span className={`auth-status ${authenticated ? 'auth-ok' : 'auth-missing'}`}>
      <span className="dot" style={{ backgroundColor: authenticated ? 'green' : 'red' }} />
      {authenticated ? `authenticated (${method})` : 'not configured'}
    </span>
  );
}

function AdvancedProviderCard({ provider, dragHandle }: {
  provider: ProviderListItem; dragHandle: DraggableProvidedDragHandleProps | null;
}) {
  const [showConfig, setShowConfig] = useState(false);

  return (
    <div className="provider-card advanced">
      <div className="provider-header" {...dragHandle}>
        <span className="drag-handle">⠿</span>
        <span className="provider-name">{provider.name}</span>
        <AuthStatusIndicator authenticated={provider.authenticated} method={provider.authMethod} />
        <button onClick={() => setShowConfig(!showConfig)}>Configure</button>
      </div>
      {showConfig && <ProviderConfigPanel provider={provider} />}
      <div className="capabilities">
        {provider.capabilities.streaming && <span className="cap-badge">streaming</span>}
        {provider.capabilities.mcpSupport && <span className="cap-badge">MCP</span>}
        {provider.capabilities.skillDiscovery && <span className="cap-badge">discovery</span>}
        {provider.capabilities.vision && <span className="cap-badge">vision</span>}
        <span className="cap-context">{(provider.capabilities.maxContextTokens / 1000).toFixed(0)}k ctx</span>
      </div>
    </div>
  );
}
```

### Security Panel

**Simple mode:**
- Three profile cards: Strict / Standard (selected by default) / Permissive
- One click to switch

**Advanced mode adds:**
- Profile selector as base
- Individual toggle switches for each setting
- "Customized" badge when settings differ from profile
- Domain allowlist editor, token budget input, HITL approval selector

```typescript
// packages/franken-web/src/panels/SecurityPanel.tsx

export function SecurityPanel({ mode }: { mode: 'simple' | 'advanced' }) {
  const { data: security, loading, error, mutate } = useSecurity();

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} action="Check server connection" />;
  if (!security) return null;

  const updateSecurity = async (patch: Record<string, unknown>) => {
    await fetch('/api/security', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    mutate();
  };

  return (
    <div className="security-panel">
      <ProfileSelector
        selected={security.profile}
        onChange={(profile) => updateSecurity({ profile })}
      />

      {mode === 'advanced' && (
        <div className="advanced-security">
          {security.isCustomized && (
            <span className="customized-badge">Customized — settings differ from {security.profile} defaults</span>
          )}

          <div className="security-toggles">
            <ToggleRow
              label="Injection Detection"
              description="Scan prompts for known injection patterns"
              value={security.injectionDetection}
              onChange={(v) => updateSecurity({ injectionDetection: v })}
            />
            <ToggleRow
              label="PII Masking"
              description="Redact emails, phone numbers, SSNs before sending to LLM"
              value={security.piiMasking}
              onChange={(v) => updateSecurity({ piiMasking: v })}
            />
            <ToggleRow
              label="Output Validation"
              description="Truncate oversized responses"
              value={security.outputValidation}
              onChange={(v) => updateSecurity({ outputValidation: v })}
            />
          </div>

          <div className="security-advanced-fields">
            <label>
              Domain Allowlist
              <DomainAllowlistEditor
                domains={security.allowedDomains ?? []}
                onChange={(domains) => updateSecurity({ allowedDomains: domains })}
              />
            </label>

            <label>
              Token Budget
              <input
                type="number"
                value={security.maxTokenBudget ?? ''}
                placeholder="Unlimited"
                onChange={(e) => updateSecurity({
                  maxTokenBudget: e.target.value ? parseInt(e.target.value) : undefined,
                })}
              />
            </label>

            <label>
              HITL Approval Level
              <select
                value={security.requireApproval}
                onChange={(e) => updateSecurity({ requireApproval: e.target.value })}
              >
                <option value="all">All actions</option>
                <option value="destructive">Destructive only</option>
                <option value="none">None</option>
              </select>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileSelector({ selected, onChange }: {
  selected: string; onChange: (profile: string) => void;
}) {
  const profiles = [
    { name: 'strict', description: 'All guards on. Enterprise/compliance.' },
    { name: 'standard', description: 'Sensible defaults. Recommended.' },
    { name: 'permissive', description: 'Minimal friction. Trusted environments.' },
  ];

  return (
    <div className="profile-selector">
      {profiles.map(p => (
        <div
          key={p.name}
          className={`profile-card ${selected === p.name ? 'selected' : ''}`}
          onClick={() => onChange(p.name)}
        >
          <span className="profile-name">{p.name}</span>
          <span className="profile-desc">{p.description}</span>
        </div>
      ))}
    </div>
  );
}

function ToggleRow({ label, description, value, onChange }: {
  label: string; description: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="toggle-row">
      <div>
        <span className="toggle-label">{label}</span>
        <span className="toggle-desc">{description}</span>
      </div>
      <ToggleSwitch checked={value} onChange={() => onChange(!value)} />
    </div>
  );
}
```

### Shared Components

```typescript
// packages/franken-web/src/components/ErrorMessage.tsx
export function ErrorMessage({ message, action }: { message: string; action: string }) {
  return (
    <div className="error-message">
      <span className="error-text">{message}</span>
      <span className="error-action">{action}</span>
    </div>
  );
}

// packages/franken-web/src/components/EmptyState.tsx
export function EmptyState({ message }: { message: string }) {
  return <div className="empty-state">{message}</div>;
}

// packages/franken-web/src/components/ToggleSwitch.tsx
export function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button className={`toggle-switch ${checked ? 'on' : 'off'}`} onClick={onChange} role="switch" aria-checked={checked}>
      <span className="toggle-knob" />
      <span className="toggle-label">{checked ? 'on' : 'off'}</span>
    </button>
  );
}
```

---

## UX Principles

- Simple mode is the default — zero config needed to start
- Advanced mode is one toggle away, not buried
- No nested menus deeper than 2 levels
- Every action reachable in ≤ 2 clicks from the panel
- Sensible defaults pre-filled (standard security, all installed skills enabled, auto-detected provider order)
- Status indicators use color (green/yellow/red) + text (never color alone)
- Error states show what to do, not just what went wrong
- Loading states use spinner, not empty screen
- Empty states explain what to do next

## API Dependencies

| Panel | API Endpoints | Defined In |
|-------|---------------|------------|
| Agents | `GET /api/beasts`, `POST /api/beasts`, `GET /api/beasts/:id/events` (SSE) | Pre-existing beast-routes.ts (already in orchestrator) |
| Skills | `GET /api/skills`, `GET /api/skills/catalog/:provider`, `POST /api/skills`, `PATCH /api/skills/:name`, `DELETE /api/skills/:name` | Phase 5, Chunk 5.6 |
| Skills (context) | `GET /api/skills/:name/context`, `PUT /api/skills/:name/context` | Phase 5, Chunk 5.11 |
| Providers | `GET /api/providers`, `POST /api/providers`, `PATCH /api/providers/order`, `DELETE /api/providers/:name` | **New** — `provider-routes.ts` defined in this chunk |
| Security | `GET /api/security`, `PATCH /api/security` | Phase 4, Chunk 4.3 |

## Tests

```typescript
// packages/franken-web/tests/unit/

// hooks/useApi.test.ts
describe('useApi', () => {
  it('fetches data on mount', () => { ... });
  it('sets loading state during fetch', () => { ... });
  it('sets error on failed fetch', () => { ... });
  it('mutate() refetches data', () => { ... });
});

// hooks/useLocalStorage.test.ts
describe('useLocalStorage', () => {
  it('defaults to provided value', () => { ... });
  it('reads from localStorage', () => { ... });
  it('writes to localStorage on change', () => { ... });
});

// components/ModeToggle.test.ts
describe('ModeToggle', () => {
  it('defaults to simple mode', () => { ... });
  it('persists mode choice in localStorage', () => { ... });
  it('toggles between simple and advanced', () => { ... });
});

// panels/AgentsPanel.test.ts
describe('AgentsPanel', () => {
  it('shows agent cards with status badges', () => { ... });
  it('shows loading spinner while fetching', () => { ... });
  it('shows error message on fetch failure', () => { ... });
  it('shows empty state when no agents', () => { ... });
  it('simple mode: New Run shows text input only', () => { ... });
  it('advanced mode: New Run shows provider + skill + security selectors', () => { ... });
  it('submits new run via POST /api/beasts', () => { ... });
  it('click agent card navigates to logs', () => { ... });
});

// panels/AgentLogView.test.ts
describe('AgentLogView', () => {
  it('obtains connection ticket before opening SSE (ADR-030)', () => { ... });
  it('opens EventSource with ?ticket= param', () => { ... });
  it('renders events as they arrive', () => { ... });
  it('shows provider switch events with from/to', () => { ... });
  it('shows connection status indicator', () => { ... });
  it('obtains fresh ticket on reconnect (ADR-030)', () => { ... });
});

// panels/SkillsPanel.test.ts
describe('SkillsPanel', () => {
  it('shows skill cards with toggle switches', () => { ... });
  it('shows empty state when no skills', () => { ... });
  it('simple mode: Add Skill opens flat catalog', () => { ... });
  it('advanced mode: Browse Catalog opens tabbed view', () => { ... });
  it('advanced mode: shows provider origin + MCP status', () => { ... });
  it('advanced mode: Add Custom opens form', () => { ... });
  it('advanced mode: click context badge opens editor', () => { ... });
  it('toggle switch calls PATCH /api/skills/:name', () => { ... });
});

// components/SkillCatalogBrowser.test.ts
describe('SkillCatalogBrowser', () => {
  it('simple mode: fetches all providers into flat list', () => { ... });
  it('advanced mode: shows provider tabs', () => { ... });
  it('install button calls POST /api/skills', () => { ... });
  it('shows empty state when no catalog entries', () => { ... });
});

// components/CustomSkillForm.test.ts
describe('CustomSkillForm', () => {
  it('submits custom MCP config', () => { ... });
  it('supports env var key-value pairs', () => { ... });
  it('disables submit when name or command empty', () => { ... });
});

// components/ContextEditor.test.ts
describe('ContextEditor', () => {
  it('loads existing context.md', () => { ... });
  it('saves context.md via PUT', () => { ... });
  it('shows loading state', () => { ... });
});

// panels/ProvidersPanel.test.ts
describe('ProvidersPanel', () => {
  it('simple mode: shows cards with auth status', () => { ... });
  it('simple mode: shows empty state when no providers', () => { ... });
  it('advanced mode: supports drag-to-reorder', () => { ... });
  it('advanced mode: reorder calls PATCH /api/providers/order', () => { ... });
  it('advanced mode: shows capability badges', () => { ... });
  it('advanced mode: click Configure shows config panel', () => { ... });
});

// panels/SecurityPanel.test.ts
describe('SecurityPanel', () => {
  it('simple mode: shows three profile cards', () => { ... });
  it('simple mode: one-click profile switch', () => { ... });
  it('advanced mode: shows individual toggle switches', () => { ... });
  it('advanced mode: shows Customized badge when settings differ from profile', () => { ... });
  it('advanced mode: domain allowlist editor works', () => { ... });
  it('advanced mode: token budget input works', () => { ... });
  it('advanced mode: HITL selector works', () => { ... });
  it('toggle calls PATCH /api/security', () => { ... });
});

// Integration: provider-routes
// (in packages/franken-orchestrator/tests/integration/providers/provider-routes.test.ts — defined above)
```

## Files

**Backend (orchestrator):**
- **Add:** `packages/franken-orchestrator/src/http/routes/provider-routes.ts`
- **Add:** `packages/franken-orchestrator/tests/integration/providers/provider-routes.test.ts`

**Frontend (franken-web):**
- **Add:** `packages/franken-web/src/types.ts` — shared frontend type definitions
- **Add:** `packages/franken-web/src/hooks/useApi.ts` — generic data fetching hook
- **Add:** `packages/franken-web/src/hooks/useAgents.ts`
- **Add:** `packages/franken-web/src/hooks/useSkills.ts`
- **Add:** `packages/franken-web/src/hooks/useProviders.ts`
- **Add:** `packages/franken-web/src/hooks/useSecurity.ts`
- **Add:** `packages/franken-web/src/hooks/useLocalStorage.ts`
- **Add:** `packages/franken-web/src/components/ModeToggle.tsx`
- **Add:** `packages/franken-web/src/components/ErrorMessage.tsx`
- **Add:** `packages/franken-web/src/components/EmptyState.tsx`
- **Add:** `packages/franken-web/src/components/ToggleSwitch.tsx`
- **Add:** `packages/franken-web/src/components/SkillCatalogBrowser.tsx`
- **Add:** `packages/franken-web/src/components/CustomSkillForm.tsx`
- **Add:** `packages/franken-web/src/components/ContextEditor.tsx`
- **Add:** `packages/franken-web/src/panels/AgentsPanel.tsx`
- **Add:** `packages/franken-web/src/panels/AgentLogView.tsx`
- **Add:** `packages/franken-web/src/panels/SkillsPanel.tsx`
- **Add:** `packages/franken-web/src/panels/ProvidersPanel.tsx`
- **Add:** `packages/franken-web/src/panels/SecurityPanel.tsx`
- **Modify:** `packages/franken-web/src/App.tsx` — integrate panels + mode toggle + routing
- **Add:** `packages/franken-web/tests/unit/hooks/` — hook test files
- **Add:** `packages/franken-web/tests/unit/components/` — component test files
- **Add:** `packages/franken-web/tests/unit/panels/` — panel test files

## Exit Criteria

- Mode toggle persists in localStorage, defaults to simple
- All four panels render in both simple and advanced modes
- Simple mode requires zero configuration — sensible defaults for everything
- **Agents panel:** shows cards with status, New Run form works in both modes, click navigates to SSE log view. **SSE uses ADR-030 connection ticket pattern** — `POST /api/beasts/events/ticket` with bearer token, then `EventSource` with `?ticket=<uuid>`. On reconnect, a fresh ticket is obtained (no reuse).
- **Skills panel:** toggle switches work, catalog browser fetches from API, custom skill form submits, context editor loads/saves
- **Providers panel:** shows auth status, advanced mode drag-reorder persists via API, capability badges render
- **Security panel:** profile cards switch on click, advanced mode toggles override individual settings, customized badge appears when settings differ
- Provider API routes work: `GET /api/providers`, `POST /api/providers`, `PATCH /api/providers/order`, `DELETE /api/providers/:name`
- Provider order persisted in `.frankenbeast/config.json`
- Loading, error, and empty states handled for every panel
- Status indicators use color + text (never color alone)
- Error states show actionable messages
- All unit and integration tests pass
