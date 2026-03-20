# Chunk 8.6: Dashboard Skill Management UI

**Phase:** 8 — Wire Everything Together
**Depends on:** Chunk 5.6 (skill API routes), Chunk 5.11 (context routes + toggle persistence), Chunk 5.5 (provider skill discovery), Chunk 8.3 (dashboard shell with simple/advanced modes)
**Estimated size:** Large (~400 lines of React components)

---

## Purpose

ADR-031 specifies a detailed skill management panel in the dashboard: browse provider catalogs, install from marketplace, create custom MCPs, toggle skills on/off, edit context.md per skill, and display connection health. Chunk 8.3 builds the 4-panel dashboard shell with simple/advanced mode toggle, but the Skills panel itself needs dedicated implementation to cover the full ADR spec.

## Design

### Simple vs Advanced Mode

| Feature | Simple Mode | Advanced Mode |
|---------|------------|---------------|
| Installed skills | Toggle cards (on/off) | Toggle cards (on/off) |
| Install from catalog | "Add Skill" button → picker | Full tabbed browser per provider |
| Custom MCP | Hidden | Manual form (command, args, env) |
| Context editor | Hidden | Per-skill `context.md` editor |
| Health status | Green/red dot | Detailed status + last error |

### Component Tree

```
SkillsPanel
├── SkillGrid                    (installed skills as toggle cards)
│   └── SkillCard                (name, provider badge, toggle, health dot)
│       └── SkillContextEditor   (advanced only: inline context.md editor)
├── SkillCatalogBrowser          (advanced: tabbed per-provider marketplace)
│   ├── ProviderTab              (one tab per provider with discoverSkills results)
│   └── CatalogSkillCard         (name, description, install button)
├── CustomMcpForm                (advanced only: manual MCP server creation)
└── AddSkillDialog               (simple mode: streamlined install picker)
```

### API Consumption

The Skills panel consumes the base skill routes from Chunk 5.6 and the dedicated context routes added in Chunk 5.11:

| Component | API Call |
|-----------|---------|
| `SkillGrid` | `GET /api/skills` — list installed with status |
| `SkillCard` toggle | `PATCH /api/skills/:name` — enable/disable |
| `SkillCard` delete | `DELETE /api/skills/:name` — remove |
| `CatalogBrowser` | `GET /api/skills/catalog/:provider` — browse marketplace |
| `CatalogSkillCard` install | `POST /api/skills` — install from catalog |
| `CustomMcpForm` submit | `POST /api/skills` — create custom MCP |
| `SkillContextEditor` load | `GET /api/skills/:name/context` |
| `SkillContextEditor` save | `PUT /api/skills/:name/context` |

### State Management

Use a Zustand slice (consistent with existing franken-web patterns):

```typescript
// packages/franken-web/src/stores/skill-store.ts

import { create } from 'zustand';

interface SkillInfo {
  name: string;
  enabled: boolean;
  provider: string;
  health: 'connected' | 'error' | 'unknown';
  lastError?: string;
  hasContext: boolean;
}

interface CatalogEntry {
  name: string;
  description: string;
  provider: string;
  authFields: { key: string; label: string; type: 'secret' | 'text'; required: boolean }[];
}

interface SkillStore {
  skills: SkillInfo[];
  catalog: Record<string, CatalogEntry[]>;  // keyed by provider name
  loading: boolean;
  error: string | null;

  fetchSkills: () => Promise<void>;
  toggleSkill: (name: string, enabled: boolean) => Promise<void>;
  deleteSkill: (name: string) => Promise<void>;
  installSkill: (entry: CatalogEntry, authValues?: Record<string, string>) => Promise<{ nextAction?: string }>;
  createCustomMcp: (config: CustomMcpInput) => Promise<void>;
  fetchCatalog: (provider: string) => Promise<void>;
  updateContext: (name: string, context: string) => Promise<void>;
}
```

## Implementation

### SkillCard Component

```tsx
// packages/franken-web/src/components/skills/SkillCard.tsx

interface SkillCardProps {
  skill: SkillInfo;
  advancedMode: boolean;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
  onContextSave: (context: string) => void;
}

export function SkillCard({ skill, advancedMode, onToggle, onDelete, onContextSave }: SkillCardProps) {
  return (
    <div className="skill-card">
      <div className="skill-card-header">
        <span className={`health-dot health-${skill.health}`} />
        <span className="skill-name">{skill.name}</span>
        <span className="provider-badge">{skill.provider}</span>
        <Toggle checked={skill.enabled} onChange={onToggle} />
      </div>

      {advancedMode && skill.health === 'error' && (
        <div className="skill-error">{skill.lastError}</div>
      )}

      {advancedMode && (
        <SkillContextEditor
          skillName={skill.name}
          hasContext={skill.hasContext}
          onSave={onContextSave}
        />
      )}

      {advancedMode && (
        <button className="skill-delete" onClick={onDelete}>Remove</button>
      )}
    </div>
  );
}
```

### CatalogBrowser Component

```tsx
// packages/franken-web/src/components/skills/CatalogBrowser.tsx

interface CatalogBrowserProps {
  providers: string[];
  catalog: Record<string, CatalogEntry[]>;
  onFetchCatalog: (provider: string) => void;
  onInstall: (entry: CatalogEntry) => void;
}

export function CatalogBrowser({ providers, catalog, onFetchCatalog, onInstall }: CatalogBrowserProps) {
  const [activeTab, setActiveTab] = useState(providers[0] ?? '');

  useEffect(() => {
    if (activeTab && !catalog[activeTab]) {
      onFetchCatalog(activeTab);
    }
  }, [activeTab]);

  return (
    <div className="catalog-browser">
      <div className="catalog-tabs">
        {providers.map(p => (
          <button
            key={p}
            className={p === activeTab ? 'active' : ''}
            onClick={() => setActiveTab(p)}
          >
            {p}
          </button>
        ))}
      </div>
      <div className="catalog-grid">
        {(catalog[activeTab] ?? []).map(entry => (
          <CatalogSkillCard key={entry.name} entry={entry} onInstall={() => onInstall(entry)} />
        ))}
      </div>
    </div>
  );
}
```

### CustomMcpForm Component

```tsx
// packages/franken-web/src/components/skills/CustomMcpForm.tsx

interface CustomMcpInput {
  name: string;
  command: string;
  args: string;     // space-separated, split on submit
  envVars: string;  // KEY=VALUE per line, parsed on submit
}

export function CustomMcpForm({ onSubmit }: { onSubmit: (input: CustomMcpInput) => void }) {
  const [form, setForm] = useState<CustomMcpInput>({
    name: '', command: '', args: '', envVars: '',
  });

  return (
    <form className="custom-mcp-form" onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
      <label>Name <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required /></label>
      <label>Command <input value={form.command} onChange={e => setForm({...form, command: e.target.value})} required /></label>
      <label>Arguments <input value={form.args} onChange={e => setForm({...form, args: e.target.value})} placeholder="--flag value" /></label>
      <label>Environment <textarea value={form.envVars} onChange={e => setForm({...form, envVars: e.target.value})} placeholder="API_KEY=..." rows={3} /></label>
      <button type="submit">Create Custom MCP</button>
    </form>
  );
}
```

### SkillContextEditor Component

```tsx
// packages/franken-web/src/components/skills/SkillContextEditor.tsx

export function SkillContextEditor({ skillName, hasContext, onSave }: {
  skillName: string;
  hasContext: boolean;
  onSave: (context: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState('');
  const [loaded, setLoaded] = useState(false);

  const loadContext = async () => {
    if (!loaded) {
      const resp = await fetch(`/api/skills/${skillName}/context`);
      if (resp.ok) setContent(await resp.text());
      setLoaded(true);
    }
    setExpanded(!expanded);
  };

  return (
    <div className="context-editor">
      <button onClick={loadContext}>
        {expanded ? 'Hide' : 'Edit'} context.md
      </button>
      {expanded && (
        <>
          <textarea value={content} onChange={e => setContent(e.target.value)} rows={8} />
          <button onClick={() => onSave(content)}>Save</button>
        </>
      )}
    </div>
  );
}
```

### Install Auth Dialog

When installing a marketplace skill that requires auth fields, show a dialog:

```tsx
// packages/franken-web/src/components/skills/InstallAuthDialog.tsx

export function InstallAuthDialog({ entry, onConfirm, onCancel }: {
  entry: CatalogEntry;
  onConfirm: (authValues: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});

  return (
    <dialog open className="install-auth-dialog">
      <h3>Install {entry.name}</h3>
      <p>{entry.description}</p>
      {entry.authFields.map(field => (
        <label key={field.key}>
          {field.label} {field.required && '*'}
          <input
            type={field.type === 'secret' ? 'password' : 'text'}
            value={values[field.key] ?? ''}
            onChange={e => setValues({...values, [field.key]: e.target.value})}
            required={field.required}
          />
        </label>
      ))}
      <div className="dialog-actions">
        <button onClick={onCancel}>Cancel</button>
        <button onClick={() => onConfirm(values)}>Install</button>
      </div>
    </dialog>
  );
}

// Handle 202 responses with nextAction from OAuth installs (Phase 5.9)
function InstallNextActionNotice({ nextAction, onDismiss }: {
  nextAction: string;
  onDismiss: () => void;
}) {
  return (
    <div className="install-next-action">
      <p>Almost there — complete setup by running:</p>
      <pre><code>{nextAction}</code></pre>
      <button onClick={onDismiss}>Done</button>
    </div>
  );
}
```

## Tests

```typescript
// packages/franken-web/tests/components/skills/SkillCard.test.tsx

describe('SkillCard', () => {
  it('renders skill name and provider badge', () => { ... });
  it('shows health dot with correct status class', () => { ... });
  it('calls onToggle when toggle is clicked', () => { ... });
  it('hides context editor and delete in simple mode', () => { ... });
  it('shows context editor and delete in advanced mode', () => { ... });
  it('shows error message in advanced mode when health is error', () => { ... });
});

describe('CatalogBrowser', () => {
  it('renders tabs for each provider', () => { ... });
  it('fetches catalog when tab is selected', () => { ... });
  it('renders catalog entries as cards', () => { ... });
  it('calls onInstall when install button is clicked', () => { ... });
});

describe('CustomMcpForm', () => {
  it('requires name and command fields', () => { ... });
  it('submits form data on submit', () => { ... });
  it('parses args as space-separated values', () => { ... });
  it('parses envVars as KEY=VALUE lines', () => { ... });
});

describe('SkillContextEditor', () => {
  it('loads context.md on first expand', () => { ... });
  it('calls onSave with updated content', () => { ... });
  it('toggles expanded state', () => { ... });
});

describe('InstallAuthDialog', () => {
  it('renders auth fields from catalog entry', () => { ... });
  it('shows password input for secret fields', () => { ... });
  it('calls onConfirm with entered values', () => { ... });
  it('marks required fields', () => { ... });
});

describe('InstallNextActionNotice', () => {
  it('displays nextAction command from 202 OAuth response (Phase 5.9)', () => { ... });
  it('renders command in a code block for easy copy', () => { ... });
  it('calls onDismiss when Done is clicked', () => { ... });
});
```

## Files

- **Add:** `packages/franken-web/src/stores/skill-store.ts`
- **Add:** `packages/franken-web/src/components/skills/SkillCard.tsx`
- **Add:** `packages/franken-web/src/components/skills/CatalogBrowser.tsx`
- **Add:** `packages/franken-web/src/components/skills/CustomMcpForm.tsx`
- **Add:** `packages/franken-web/src/components/skills/SkillContextEditor.tsx`
- **Add:** `packages/franken-web/src/components/skills/InstallAuthDialog.tsx`
- **Add:** `packages/franken-web/src/components/skills/InstallNextActionNotice.tsx`
- **Modify:** `packages/franken-web/src/components/panels/SkillsPanel.tsx` — compose above components, wire to store, respect simple/advanced mode
- **Add:** `packages/franken-web/tests/components/skills/` — test files per component

## Exit Criteria

- Simple mode: installed skills as toggle cards + "Add Skill" dialog
- Advanced mode: full catalog browser with provider tabs, custom MCP form, context.md editor, health details
- All components consume Chunk 5.6 API routes
- Zustand skill store manages all skill state
- Install flow prompts for auth fields when required
- **OAuth installs:** when API returns 202 with `nextAction`, display `InstallNextActionNotice` with the command (e.g., `codex mcp login github`) — user must see the follow-up step (Phase 5.9 contract)
- Health status visible (green/red dot in simple, detailed error in advanced)
- All component tests pass
