# Beasts Panel UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the beasts panel from a 3-column dispatch page into a list-first agent management surface with wizard-based creation, slide-in detail panel, and full agent configuration depth.

**Architecture:** Replace `beast-dispatch-page.tsx` with a component tree rooted in `BeastsPage`. Agent list is the primary view; clicking a row opens a slide-in `<aside>`. "Create Agent" opens an 8-step wizard (Radix Dialog). Zustand manages wizard form state and edit-mode dirty tracking. All new components use Tailwind v4 + Radix primitives.

**Tech Stack:** React 18, TypeScript, Vite 5, Radix UI primitives, Tailwind CSS v4, Zustand, Vitest + Testing Library

**Spec:** `docs/superpowers/specs/2026-03-15-beasts-panel-ux-design.md`
**ADRs:** `docs/adr/022-026`
**Gaps doc:** `docs/plans/2026-03-15-beasts-panel-backend-gaps.md`

---

## File Structure

### New Files

```
packages/franken-web/
├── src/
│   ├── styles/
│   │   └── tailwind.css                    # Tailwind entry point (@import "tailwindcss" + theme)
│   ├── stores/
│   │   ├── beast-store.ts                  # Zustand store: wizardSlice + agentEditSlice
│   │   └── beast-store.test.ts             # Store unit tests
│   ├── lib/
│   │   ├── token-estimator.ts              # Client-side token counting heuristic
│   │   └── path-utils.ts                   # OS/WSL path normalization utilities
│   ├── pages/
│   │   └── beasts-page.tsx                 # New root page component (replaces beast-dispatch-page)
│   ├── components/
│   │   └── beasts/
│   │       ├── agent-list.tsx              # Main agent list with density toggle + search/filter
│   │       ├── agent-row.tsx               # Single agent row (compact/comfortable/detailed)
│   │       ├── status-light.tsx            # Glowing status indicator circle
│   │       ├── slide-in-panel.tsx          # Detail slide-in <aside> shell
│   │       ├── agent-detail-readonly.tsx   # Readonly accordion sections
│   │       ├── agent-detail-edit.tsx       # Edit mode form sections
│   │       ├── agent-detail-panel.tsx     # Compositor: slide-in + header + readonly/edit + action bar
│   │       ├── agent-action-bar.tsx        # Context-dependent action buttons
│   │       ├── log-viewer-modal.tsx        # Expandable/fullscreen log viewer
│   │       ├── wizard-dialog.tsx           # Wizard shell (Dialog + stepper + navigation)
│   │       ├── wizard-step-indicator.tsx   # Custom step indicator bar
│   │       ├── steps/
│   │       │   ├── step-identity.tsx       # Step 1: name + description
│   │       │   ├── step-workflow.tsx       # Step 2: workflow type cards
│   │       │   ├── step-llm-targets.tsx    # Step 3: provider/model selects
│   │       │   ├── step-modules.tsx        # Step 4: module toggles + deep config
│   │       │   ├── step-skills.tsx         # Step 5: skill registry browser
│   │       │   ├── step-prompts.tsx        # Step 6: text + file frontloading
│   │       │   ├── step-git.tsx            # Step 7: git workflow presets
│   │       │   └── step-review.tsx         # Step 8: review + launch
│   │       ├── single-page-form.tsx        # Accordion-based form mode
│   │       └── shared/
│   │           ├── gap-banner.tsx          # "Not yet wired" inline banner
│   │           ├── provider-model-select.tsx # Cascading provider → model selects
│   │           ├── file-picker.tsx         # Multi-file picker with context health
│   │           └── preset-card.tsx         # Radio-style card selector
├── tests/
│   └── components/
│       └── beasts/
│           ├── agent-list.test.tsx
│           ├── agent-row.test.tsx
│           ├── status-light.test.tsx
│           ├── slide-in-panel.test.tsx
│           ├── agent-detail-readonly.test.tsx
│           ├── agent-detail-edit.test.tsx
│           ├── agent-detail-panel.test.tsx
│           ├── agent-action-bar.test.tsx
│           ├── wizard-dialog.test.tsx
│           ├── wizard-step-indicator.test.tsx
│           ├── log-viewer-modal.test.tsx
│           ├── single-page-form.test.tsx
│           └── steps/
│               ├── step-identity.test.tsx
│               ├── step-workflow.test.tsx
│               ├── step-llm-targets.test.tsx
│               ├── step-modules.test.tsx
│               ├── step-skills.test.tsx
│               ├── step-prompts.test.tsx
│               ├── step-git.test.tsx
│               └── step-review.test.tsx
```

### Modified Files

```
packages/franken-web/
├── package.json                            # Add Radix, Tailwind, Zustand deps
├── vite.config.ts                          # Add @tailwindcss/vite plugin
├── src/main.tsx                            # Add tailwind.css import
├── src/lib/beast-api.ts                    # Extend types: name field, killAgent(), extended config
├── src/components/chat-shell.tsx           # Replace BeastDispatchPage with BeastsPage, refactor polling
├── tests/components/beast-dispatch-page.test.tsx  # Delete (replaced by beasts/ tests)
├── tests/components/chat-shell.test.tsx    # Update beasts route assertions for BeastsPage
```

---

## Chunk 1: Foundation — Tailwind, Radix, Zustand Setup

### Task 1.1: Install Dependencies

**Files:**
- Modify: `packages/franken-web/package.json`

- [ ] **Step 1: Install Radix primitives, Tailwind v4, and Zustand**

```bash
cd packages/franken-web
npm install @radix-ui/react-dialog @radix-ui/react-accordion @radix-ui/react-select \
  @radix-ui/react-toggle @radix-ui/react-toggle-group @radix-ui/react-tooltip \
  @radix-ui/react-alert-dialog @radix-ui/react-popover @radix-ui/react-scroll-area \
  @radix-ui/react-separator zustand
npm install -D tailwindcss@4 @tailwindcss/vite
```

- [ ] **Step 2: Verify install succeeded**

Run: `cd packages/franken-web && npm ls zustand @radix-ui/react-dialog tailwindcss`
Expected: All three listed without errors

- [ ] **Step 3: Commit**

```bash
git add packages/franken-web/package.json packages/franken-web/package-lock.json
git commit -m "chore(web): add Radix UI, Tailwind v4, and Zustand dependencies"
```

### Task 1.2: Configure Tailwind v4

**Files:**
- Create: `packages/franken-web/src/styles/tailwind.css`
- Modify: `packages/franken-web/vite.config.ts`
- Modify: `packages/franken-web/src/main.tsx`

- [ ] **Step 1: Create Tailwind entry CSS**

```css
/* packages/franken-web/src/styles/tailwind.css */
@import "tailwindcss";

@theme {
  --color-beast-bg: #040804;
  --color-beast-elevated: rgba(13, 21, 14, 0.94);
  --color-beast-panel: rgba(18, 27, 19, 0.94);
  --color-beast-accent: #86e45f;
  --color-beast-accent-strong: #b7ff81;
  --color-beast-accent-soft: rgba(134, 228, 95, 0.14);
  --color-beast-text: #f3faef;
  --color-beast-muted: #c0d0bc;
  --color-beast-subtle: #9fb09b;
  --color-beast-danger: #ff7a6b;
  --color-beast-control: rgba(22, 34, 23, 0.85);
  --color-beast-border: rgba(134, 228, 95, 0.13);
}
```

- [ ] **Step 2: Add Tailwind Vite plugin**

In `vite.config.ts`, add `import tailwindcss from '@tailwindcss/vite'` and add `tailwindcss()` to the `plugins` array before `react()`.

- [ ] **Step 3: Import tailwind.css in main.tsx**

Add `import './styles/tailwind.css';` before the existing `import './styles/app.css';` line in `main.tsx`.

- [ ] **Step 4: Verify Tailwind works**

Run: `cd packages/franken-web && npx vite build 2>&1 | tail -5`
Expected: Build succeeds without errors

- [ ] **Step 5: Commit**

```bash
git add packages/franken-web/src/styles/tailwind.css packages/franken-web/vite.config.ts packages/franken-web/src/main.tsx
git commit -m "feat(web): configure Tailwind CSS v4 with beast theme tokens"
```

### Task 1.3: Create Zustand Store

**Files:**
- Create: `packages/franken-web/src/stores/beast-store.ts`
- Create: `packages/franken-web/src/stores/beast-store.test.ts`

- [ ] **Step 1: Write failing test for wizard slice**

```typescript
// packages/franken-web/src/stores/beast-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useBeastStore } from './beast-store';

describe('beast-store wizardSlice', () => {
  beforeEach(() => {
    useBeastStore.getState().resetWizard();
  });

  it('initializes with step 0 and wizard mode', () => {
    const state = useBeastStore.getState();
    expect(state.wizardStep).toBe(0);
    expect(state.wizardMode).toBe('wizard');
  });

  it('advances step and blocks past highest completed', () => {
    const { nextStep, setWizardStep } = useBeastStore.getState();
    nextStep(); // 0 → 1
    expect(useBeastStore.getState().wizardStep).toBe(1);
    setWizardStep(0); // back to 0 allowed
    expect(useBeastStore.getState().wizardStep).toBe(0);
    setWizardStep(5); // jump past completed blocked
    expect(useBeastStore.getState().wizardStep).toBe(0);
  });

  it('stores and retrieves form values per step', () => {
    const { setStepValues } = useBeastStore.getState();
    setStepValues(0, { name: 'TestAgent', description: 'A test' });
    expect(useBeastStore.getState().stepValues[0]).toEqual({ name: 'TestAgent', description: 'A test' });
  });

  it('toggles between wizard and form mode preserving state', () => {
    const { setStepValues, toggleWizardMode } = useBeastStore.getState();
    setStepValues(0, { name: 'Keep' });
    toggleWizardMode();
    expect(useBeastStore.getState().wizardMode).toBe('form');
    expect(useBeastStore.getState().stepValues[0]).toEqual({ name: 'Keep' });
  });
});

describe('beast-store agentEditSlice', () => {
  beforeEach(() => {
    useBeastStore.getState().resetEdit();
  });

  it('is not dirty when snapshot matches current', () => {
    const { setEditSnapshot, setEditValues } = useBeastStore.getState();
    const data = { name: 'Agent1', description: 'desc' };
    setEditSnapshot(data);
    setEditValues(data);
    expect(useBeastStore.getState().isEditDirty).toBe(false);
  });

  it('is dirty when current diverges from snapshot', () => {
    const { setEditSnapshot, setEditValues } = useBeastStore.getState();
    setEditSnapshot({ name: 'Agent1' });
    setEditValues({ name: 'Agent1-modified' });
    expect(useBeastStore.getState().isEditDirty).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/franken-web && npx vitest run src/stores/beast-store.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the store**

```typescript
// packages/franken-web/src/stores/beast-store.ts
import { create } from 'zustand';

type WizardMode = 'wizard' | 'form';

interface StepValues {
  [stepIndex: number]: Record<string, unknown>;
}

interface ValidationErrors {
  [stepIndex: number]: Record<string, string>;
}

interface WizardSlice {
  wizardStep: number;
  highestCompleted: number;
  wizardMode: WizardMode;
  stepValues: StepValues;
  validationErrors: ValidationErrors;
  nextStep: () => void;
  prevStep: () => void;
  setWizardStep: (step: number) => void;
  setStepValues: (step: number, values: Record<string, unknown>) => void;
  setValidationErrors: (step: number, errors: Record<string, string>) => void;
  clearValidationErrors: (step: number) => void;
  toggleWizardMode: () => void;
  markStepCompleted: (step: number) => void;
  resetWizard: () => void;
}

interface AgentEditSlice {
  editSnapshot: Record<string, unknown> | null;
  editValues: Record<string, unknown> | null;
  isEditDirty: boolean;
  setEditSnapshot: (snapshot: Record<string, unknown>) => void;
  setEditValues: (values: Record<string, unknown>) => void;
  setEditField: (key: string, value: unknown) => void;
  resetEdit: () => void;
}

type BeastStore = WizardSlice & AgentEditSlice;

function computeDirty(
  snapshot: Record<string, unknown> | null,
  values: Record<string, unknown> | null,
): boolean {
  if (!snapshot || !values) return false;
  return JSON.stringify(snapshot) !== JSON.stringify(values);
}

export const useBeastStore = create<BeastStore>()((set, get) => ({
  // Wizard slice
  wizardStep: 0,
  highestCompleted: -1,
  wizardMode: 'wizard',
  stepValues: {},
  validationErrors: {},

  nextStep: () =>
    set((s) => ({
      wizardStep: s.wizardStep + 1,
      highestCompleted: Math.max(s.highestCompleted, s.wizardStep),
    })),

  prevStep: () =>
    set((s) => ({ wizardStep: Math.max(0, s.wizardStep - 1) })),

  setWizardStep: (step) =>
    set((s) => ({
      wizardStep: step <= s.highestCompleted + 1 ? step : s.wizardStep,
    })),

  setStepValues: (step, values) =>
    set((s) => ({
      stepValues: { ...s.stepValues, [step]: values },
    })),

  setValidationErrors: (step, errors) =>
    set((s) => ({
      validationErrors: { ...s.validationErrors, [step]: errors },
    })),

  clearValidationErrors: (step) =>
    set((s) => {
      const next = { ...s.validationErrors };
      delete next[step];
      return { validationErrors: next };
    }),

  toggleWizardMode: () =>
    set((s) => ({
      wizardMode: s.wizardMode === 'wizard' ? 'form' : 'wizard',
    })),

  markStepCompleted: (step) =>
    set((s) => ({
      highestCompleted: Math.max(s.highestCompleted, step),
    })),

  resetWizard: () =>
    set({
      wizardStep: 0,
      highestCompleted: -1,
      wizardMode: 'wizard',
      stepValues: {},
      validationErrors: {},
    }),

  // Agent edit slice
  editSnapshot: null,
  editValues: null,
  isEditDirty: false,

  setEditSnapshot: (snapshot) =>
    set((s) => ({
      editSnapshot: snapshot,
      editValues: s.editValues ?? { ...snapshot },
      isEditDirty: computeDirty(snapshot, s.editValues ?? snapshot),
    })),

  setEditValues: (values) =>
    set((s) => ({
      editValues: values,
      isEditDirty: computeDirty(s.editSnapshot, values),
    })),

  setEditField: (key, value) => {
    const current = get().editValues ?? {};
    const next = { ...current, [key]: value };
    set((s) => ({
      editValues: next,
      isEditDirty: computeDirty(s.editSnapshot, next),
    }));
  },

  resetEdit: () =>
    set({ editSnapshot: null, editValues: null, isEditDirty: false }),
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/franken-web && npx vitest run src/stores/beast-store.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-web/src/stores/
git commit -m "feat(web): add Zustand beast store with wizard and edit slices"
```

---

## Chunk 2: Status Light + Agent Row + Agent List

### Task 2.1: Status Light Component

**Files:**
- Create: `packages/franken-web/src/components/beasts/status-light.tsx`
- Create: `packages/franken-web/tests/components/beasts/status-light.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// tests/components/beasts/status-light.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusLight } from '../../../src/components/beasts/status-light';

describe('StatusLight', () => {
  it('renders with running status and pulse class', () => {
    render(<StatusLight status="running" />);
    const light = screen.getByRole('status');
    expect(light).toHaveAttribute('aria-label', 'Agent status: running');
    expect(light.className).toContain('animate-pulse');
  });

  it('renders stopped with no glow', () => {
    render(<StatusLight status="stopped" />);
    const light = screen.getByRole('status');
    expect(light.className).toContain('bg-beast-subtle');
    expect(light.className).not.toContain('animate-pulse');
    expect(light.className).not.toContain('shadow');
  });

  it('renders failed with static red glow', () => {
    render(<StatusLight status="failed" />);
    const light = screen.getByRole('status');
    expect(light.className).toContain('bg-beast-danger');
    expect(light.className).toContain('shadow');
    expect(light.className).not.toContain('animate-pulse');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/franken-web && npx vitest run tests/components/beasts/status-light.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement StatusLight**

```tsx
// packages/franken-web/src/components/beasts/status-light.tsx
import type { TrackedAgentSummary } from '../../lib/beast-api';

type AgentStatus = TrackedAgentSummary['status'];

const STATUS_STYLES: Record<string, string> = {
  running: 'bg-beast-accent shadow-[0_0_8px_2px] shadow-beast-accent animate-pulse',
  initializing: 'bg-beast-accent-strong shadow-[0_0_8px_2px] shadow-beast-accent-strong animate-[pulse_0.8s_ease-in-out_infinite]',
  dispatching: 'bg-beast-accent-strong shadow-[0_0_8px_2px] shadow-beast-accent-strong animate-[pulse_0.8s_ease-in-out_infinite]',
  completed: 'bg-beast-muted',
  stopped: 'bg-beast-subtle',
  failed: 'bg-beast-danger shadow-[0_0_8px_2px] shadow-beast-danger',
};

interface StatusLightProps {
  status: AgentStatus;
}

export function StatusLight({ status }: StatusLightProps) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.stopped;
  return (
    <span
      role="status"
      aria-label={`Agent status: ${status}`}
      className={`inline-block h-2 w-2 rounded-full shrink-0 ${style}`}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/franken-web && npx vitest run tests/components/beasts/status-light.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-web/src/components/beasts/status-light.tsx packages/franken-web/tests/components/beasts/status-light.test.tsx
git commit -m "feat(web): add StatusLight component with glowing indicators"
```

### Task 2.2: Agent Row Component

**Files:**
- Create: `packages/franken-web/src/components/beasts/agent-row.tsx`
- Create: `packages/franken-web/tests/components/beasts/agent-row.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// tests/components/beasts/agent-row.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentRow } from '../../../src/components/beasts/agent-row';
import type { TrackedAgentSummary } from '../../../src/lib/beast-api';

const agent: TrackedAgentSummary = {
  id: 'agent-1',
  name: 'My Test Agent',
  definitionId: 'design-interview',
  status: 'running',
  source: 'dashboard',
  createdByUser: 'pfk',
  initAction: { kind: 'design-interview', command: '/interview', config: {} },
  initConfig: {},
  createdAt: '2026-03-15T10:00:00Z',
  updatedAt: '2026-03-15T10:05:00Z',
};

describe('AgentRow', () => {
  it('renders compact density with name, status, and timestamp', () => {
    render(<AgentRow agent={agent} density="compact" selected={false} onClick={vi.fn()} />);
    expect(screen.getByText('My Test Agent')).toBeTruthy();
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('renders comfortable density with extra chips', () => {
    render(<AgentRow agent={agent} density="comfortable" selected={false} onClick={vi.fn()} />);
    expect(screen.getByText('design-interview')).toBeTruthy();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<AgentRow agent={agent} density="compact" selected={false} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledWith('agent-1');
  });

  it('shows selected highlight', () => {
    const { container } = render(<AgentRow agent={agent} density="compact" selected={true} onClick={vi.fn()} />);
    expect(container.firstChild?.className).toContain('bg-beast-accent-soft');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/franken-web && npx vitest run tests/components/beasts/agent-row.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement AgentRow**

```tsx
// packages/franken-web/src/components/beasts/agent-row.tsx
import type { TrackedAgentSummary } from '../../lib/beast-api';
import { StatusLight } from './status-light';

export type Density = 'compact' | 'comfortable' | 'detailed';

interface AgentRowProps {
  agent: TrackedAgentSummary;
  density: Density;
  selected: boolean;
  onClick: (agentId: string) => void;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function AgentRow({ agent, density, selected, onClick }: AgentRowProps) {
  const selectedClass = selected ? 'bg-beast-accent-soft border-beast-accent' : 'border-beast-border';

  return (
    <button
      type="button"
      onClick={() => onClick(agent.id)}
      className={`w-full text-left rounded-xl border p-3 transition-colors duration-150
        bg-beast-panel hover:bg-beast-elevated cursor-pointer ${selectedClass}`}
    >
      {/* Line 1: always visible */}
      <div className="flex items-center gap-3">
        <StatusLight status={agent.status} />
        <span className="text-beast-text font-medium truncate flex-1">{agent.name ?? agent.id}</span>
        <span className="text-beast-subtle text-sm">{formatTime(agent.createdAt)}</span>
      </div>

      {/* Line 2: comfortable+ */}
      {(density === 'comfortable' || density === 'detailed') && (
        <div className="flex items-center gap-2 mt-1.5 ml-5">
          <span className="text-xs px-2 py-0.5 rounded-full bg-beast-control text-beast-accent border border-beast-border">
            {agent.initAction.kind}
          </span>
          {agent.moduleConfig && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-beast-control text-beast-muted border border-beast-border">
              {Object.values(agent.moduleConfig).filter(Boolean).length} modules
            </span>
          )}
        </div>
      )}

      {/* Line 3: detailed only */}
      {density === 'detailed' && (
        <div className="flex items-center gap-3 mt-1.5 ml-5 text-xs text-beast-subtle">
          <span>by {agent.createdByUser}</span>
          {agent.dispatchRunId && <span>run: {agent.dispatchRunId.slice(0, 8)}…</span>}
        </div>
      )}
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/franken-web && npx vitest run tests/components/beasts/agent-row.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-web/src/components/beasts/agent-row.tsx packages/franken-web/tests/components/beasts/agent-row.test.tsx
git commit -m "feat(web): add AgentRow component with density variants"
```

### Task 2.3: Agent List Component

**Files:**
- Create: `packages/franken-web/src/components/beasts/agent-list.tsx`
- Create: `packages/franken-web/tests/components/beasts/agent-list.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// tests/components/beasts/agent-list.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentList } from '../../../src/components/beasts/agent-list';
import type { TrackedAgentSummary } from '../../../src/lib/beast-api';

const agents: TrackedAgentSummary[] = [
  {
    id: 'agent-1', definitionId: 'design-interview', status: 'running',
    source: 'dashboard', createdByUser: 'pfk',
    initAction: { kind: 'design-interview', command: '/interview', config: {} },
    initConfig: {}, createdAt: '2026-03-15T10:00:00Z', updatedAt: '2026-03-15T10:05:00Z',
  },
  {
    id: 'agent-2', definitionId: 'chunk-plan', status: 'stopped',
    source: 'dashboard', createdByUser: 'pfk',
    initAction: { kind: 'chunk-plan', command: '/plan', config: {} },
    initConfig: {}, createdAt: '2026-03-15T09:00:00Z', updatedAt: '2026-03-15T09:30:00Z',
  },
];

describe('AgentList', () => {
  it('renders all agents', () => {
    render(<AgentList agents={agents} selectedAgentId={null} onSelectAgent={vi.fn()} onCreateAgent={vi.fn()} />);
    expect(screen.getByText('agent-1')).toBeTruthy();
    expect(screen.getByText('agent-2')).toBeTruthy();
  });

  it('shows empty state when no agents', () => {
    render(<AgentList agents={[]} selectedAgentId={null} onSelectAgent={vi.fn()} onCreateAgent={vi.fn()} />);
    expect(screen.getByText(/no agents yet/i)).toBeTruthy();
  });

  it('filters agents by search text', () => {
    render(<AgentList agents={agents} selectedAgentId={null} onSelectAgent={vi.fn()} onCreateAgent={vi.fn()} />);
    const search = screen.getByPlaceholderText(/search/i);
    fireEvent.change(search, { target: { value: 'agent-1' } });
    expect(screen.getByText('agent-1')).toBeTruthy();
    expect(screen.queryByText('agent-2')).toBeNull();
  });

  it('filters agents by status', () => {
    render(<AgentList agents={agents} selectedAgentId={null} onSelectAgent={vi.fn()} onCreateAgent={vi.fn()} />);
    const statusSelect = screen.getByLabelText(/filter by status/i);
    fireEvent.change(statusSelect, { target: { value: 'running' } });
    expect(screen.getByText('My Test Agent')).toBeTruthy();
    expect(screen.queryByText('agent-2')).toBeNull();
  });

  it('has create agent button', () => {
    const onCreate = vi.fn();
    render(<AgentList agents={agents} selectedAgentId={null} onSelectAgent={vi.fn()} onCreateAgent={onCreate} />);
    fireEvent.click(screen.getByText(/create agent/i));
    expect(onCreate).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/franken-web && npx vitest run tests/components/beasts/agent-list.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement AgentList**

```tsx
// packages/franken-web/src/components/beasts/agent-list.tsx
import { useState } from 'react';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import type { TrackedAgentSummary } from '../../lib/beast-api';
import { AgentRow, type Density } from './agent-row';

interface AgentListProps {
  agents: TrackedAgentSummary[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
  onCreateAgent: () => void;
}

export function AgentList({ agents, selectedAgentId, onSelectAgent, onCreateAgent }: AgentListProps) {
  const [density, setDensity] = useState<Density>('comfortable');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | ''>('');

  const filtered = agents.filter((a) => {
    if (search && !a.id.toLowerCase().includes(search.toLowerCase())
      && !a.initAction.kind.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (statusFilter && a.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 p-4 border-b border-beast-border">
        <input
          type="text"
          placeholder="Search agents..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-beast-control border border-beast-border rounded-lg px-3 py-2
            text-beast-text placeholder:text-beast-subtle text-sm focus:outline-none
            focus:ring-2 focus:ring-beast-accent"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
          className="bg-beast-control border border-beast-border rounded-lg px-3 py-2
            text-beast-text text-sm focus:outline-none focus:ring-2 focus:ring-beast-accent"
        >
          <option value="">All statuses</option>
          {['running', 'initializing', 'dispatching', 'stopped', 'completed', 'failed'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <ToggleGroup.Root
          type="single"
          value={density}
          onValueChange={(val) => { if (val) setDensity(val as Density); }}
          aria-label="Display density"
          className="flex gap-1 bg-beast-control rounded-lg border border-beast-border p-0.5"
        >
          {(['compact', 'comfortable', 'detailed'] as const).map((d) => (
            <ToggleGroup.Item
              key={d}
              value={d}
              aria-label={`${d} density`}
              className="px-2 py-1 text-xs rounded-md text-beast-muted
                data-[state=on]:bg-beast-accent-soft data-[state=on]:text-beast-accent transition-colors"
            >
              {d[0].toUpperCase()}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
        <button
          type="button"
          onClick={onCreateAgent}
          className="px-4 py-2 rounded-lg bg-beast-accent text-beast-bg font-medium text-sm
            hover:bg-beast-accent-strong transition-colors"
        >
          Create Agent
        </button>
      </div>

      {/* Agent list */}
      {filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-beast-muted">
          <p>{agents.length === 0 ? 'No agents yet — Create your first agent' : 'No matching agents'}</p>
          {agents.length === 0 && (
            <button
              type="button"
              onClick={onCreateAgent}
              className="px-4 py-2 rounded-lg bg-beast-accent text-beast-bg font-medium text-sm"
            >
              Create Agent
            </button>
          )}
        </div>
      ) : (
        <ScrollArea.Root className="flex-1 overflow-hidden">
          <ScrollArea.Viewport className="h-full w-full p-4">
            <div className="flex flex-col gap-2">
              {filtered.map((agent) => (
                <AgentRow
                  key={agent.id}
                  agent={agent}
                  density={density}
                  selected={agent.id === selectedAgentId}
                  onClick={onSelectAgent}
                />
              ))}
            </div>
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar orientation="vertical" className="w-2 p-0.5">
            <ScrollArea.Thumb className="bg-beast-border rounded-full" />
          </ScrollArea.Scrollbar>
        </ScrollArea.Root>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/franken-web && npx vitest run tests/components/beasts/agent-list.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-web/src/components/beasts/agent-list.tsx packages/franken-web/tests/components/beasts/agent-list.test.tsx
git commit -m "feat(web): add AgentList with search, density toggle, and empty state"
```

---

## Chunk 3: Slide-In Detail Panel

### Task 3.1: Slide-In Panel Shell

**Files:**
- Create: `packages/franken-web/src/components/beasts/slide-in-panel.tsx`
- Create: `packages/franken-web/tests/components/beasts/slide-in-panel.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// tests/components/beasts/slide-in-panel.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SlideInPanel } from '../../../src/components/beasts/slide-in-panel';

describe('SlideInPanel', () => {
  it('renders children when open', () => {
    render(
      <SlideInPanel isOpen={true} onClose={vi.fn()}>
        <div>Panel content</div>
      </SlideInPanel>
    );
    expect(screen.getByText('Panel content')).toBeTruthy();
  });

  it('applies translate-x-full when closed', () => {
    const { container } = render(
      <SlideInPanel isOpen={false} onClose={vi.fn()}>
        <div>Hidden</div>
      </SlideInPanel>
    );
    const aside = container.querySelector('aside');
    expect(aside?.className).toContain('translate-x-full');
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <SlideInPanel isOpen={true} onClose={onClose}>
        <div>Content</div>
      </SlideInPanel>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/franken-web && npx vitest run tests/components/beasts/slide-in-panel.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement SlideInPanel**

```tsx
// packages/franken-web/src/components/beasts/slide-in-panel.tsx
import { useEffect, useRef, type ReactNode } from 'react';

interface SlideInPanelProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function SlideInPanel({ isOpen, onClose, children }: SlideInPanelProps) {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (isOpen && panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  return (
    <aside
      ref={panelRef}
      aria-hidden={!isOpen}
      className={`fixed top-0 right-0 h-screen w-[45vw] min-w-[400px] max-w-[720px]
        bg-beast-panel border-l border-beast-border shadow-2xl z-50
        transition-transform duration-200 ease-out flex flex-col
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
    >
      {children}
    </aside>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/franken-web && npx vitest run tests/components/beasts/slide-in-panel.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-web/src/components/beasts/slide-in-panel.tsx packages/franken-web/tests/components/beasts/slide-in-panel.test.tsx
git commit -m "feat(web): add SlideInPanel aside with CSS transitions"
```

### Task 3.2: Agent Action Bar

**Files:**
- Create: `packages/franken-web/src/components/beasts/agent-action-bar.tsx`
- Create: `packages/franken-web/tests/components/beasts/agent-action-bar.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// tests/components/beasts/agent-action-bar.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentActionBar } from '../../../src/components/beasts/agent-action-bar';

describe('AgentActionBar', () => {
  const handlers = {
    onStart: vi.fn(), onStop: vi.fn(), onRestart: vi.fn(),
    onResume: vi.fn(), onDelete: vi.fn(), onKill: vi.fn(),
  };

  it('shows Stop for initializing agent', () => {
    render(<AgentActionBar status="initializing" hasLinkedRun={false} {...handlers} />);
    expect(screen.getByText('Stop')).toBeTruthy();
    expect(screen.queryByText('Restart')).toBeNull();
  });

  it('shows Stop, Restart, Kill for running agent', () => {
    render(<AgentActionBar status="running" hasLinkedRun={true} {...handlers} />);
    expect(screen.getByText('Stop')).toBeTruthy();
    expect(screen.getByText('Restart')).toBeTruthy();
    expect(screen.getByText('Kill')).toBeTruthy();
  });

  it('shows Start, Resume, Delete for stopped with linked run', () => {
    render(<AgentActionBar status="stopped" hasLinkedRun={true} {...handlers} />);
    expect(screen.getByText('Start')).toBeTruthy();
    expect(screen.getByText('Resume')).toBeTruthy();
    expect(screen.getByText('Delete')).toBeTruthy();
  });

  it('shows Start, Delete for failed agent', () => {
    render(<AgentActionBar status="failed" hasLinkedRun={false} {...handlers} />);
    expect(screen.getByText('Start')).toBeTruthy();
    expect(screen.getByText('Delete')).toBeTruthy();
    expect(screen.queryByText('Resume')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/franken-web && npx vitest run tests/components/beasts/agent-action-bar.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement AgentActionBar**

```tsx
// packages/franken-web/src/components/beasts/agent-action-bar.tsx
import { useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';

interface AgentActionBarProps {
  status: string;
  hasLinkedRun: boolean;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onResume: () => void;
  onDelete: () => void;
  onKill: () => void;
}

function ActionButton({ label, onClick, variant = 'default' }: {
  label: string; onClick: () => void; variant?: 'default' | 'danger';
}) {
  const base = 'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors';
  const styles = variant === 'danger'
    ? `${base} bg-beast-danger/20 text-beast-danger hover:bg-beast-danger/30 border border-beast-danger/30`
    : `${base} bg-beast-control text-beast-text hover:bg-beast-elevated border border-beast-border`;
  return <button type="button" onClick={onClick} className={styles}>{label}</button>;
}

export function AgentActionBar({ status, hasLinkedRun, onStart, onStop, onRestart, onResume, onDelete, onKill }: AgentActionBarProps) {
  const [forceRestart, setForceRestart] = useState(false);

  const isInitOrDispatch = status === 'initializing' || status === 'dispatching';
  const isRunning = status === 'running';
  const isStopped = status === 'stopped';
  const isTerminal = status === 'failed' || status === 'completed';

  return (
    <div className="flex items-center gap-2 flex-wrap p-4 border-t border-beast-border">
      {(isInitOrDispatch || isRunning) && <ActionButton label="Stop" onClick={onStop} />}

      {isRunning && (
        <>
          {forceRestart ? (
            <AlertDialog.Root>
              <AlertDialog.Trigger asChild>
                <button type="button" className="px-3 py-1.5 rounded-lg text-sm font-medium bg-beast-danger/20 text-beast-danger border border-beast-danger/30">
                  Restart
                </button>
              </AlertDialog.Trigger>
              <AlertDialog.Portal>
                <AlertDialog.Overlay className="fixed inset-0 bg-black/50 z-[60]" />
                <AlertDialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-beast-panel border border-beast-border rounded-xl p-6 z-[60] max-w-md">
                  <AlertDialog.Title className="text-beast-text font-semibold">Force Restart</AlertDialog.Title>
                  <AlertDialog.Description className="text-beast-muted text-sm mt-2">
                    Force restart will interrupt the agent mid-turn. Continue?
                  </AlertDialog.Description>
                  <div className="flex gap-3 mt-4 justify-end">
                    <AlertDialog.Cancel asChild>
                      <button type="button" className="px-3 py-1.5 rounded-lg text-sm bg-beast-control text-beast-text border border-beast-border">Cancel</button>
                    </AlertDialog.Cancel>
                    <AlertDialog.Action asChild>
                      <button type="button" onClick={onRestart} className="px-3 py-1.5 rounded-lg text-sm bg-beast-danger text-white">Force Restart</button>
                    </AlertDialog.Action>
                  </div>
                </AlertDialog.Content>
              </AlertDialog.Portal>
            </AlertDialog.Root>
          ) : (
            <ActionButton label="Restart" onClick={onRestart} />
          )}
          <ActionButton label="Kill" onClick={onKill} variant="danger" />
          <label className="flex items-center gap-1.5 text-xs text-beast-subtle ml-2 cursor-pointer">
            <input type="checkbox" checked={forceRestart} onChange={(e) => setForceRestart(e.target.checked)} className="accent-beast-danger" />
            Force
          </label>
        </>
      )}

      {(isStopped || isTerminal) && <ActionButton label="Start" onClick={onStart} />}
      {isStopped && hasLinkedRun && <ActionButton label="Resume" onClick={onResume} />}
      {(isStopped || isTerminal) && <ActionButton label="Delete" onClick={onDelete} variant="danger" />}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/franken-web && npx vitest run tests/components/beasts/agent-action-bar.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-web/src/components/beasts/agent-action-bar.tsx packages/franken-web/tests/components/beasts/agent-action-bar.test.tsx
git commit -m "feat(web): add AgentActionBar with force restart AlertDialog"
```

### Task 3.3: Agent Detail Readonly View

**Files:**
- Create: `packages/franken-web/src/components/beasts/agent-detail-readonly.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// tests/components/beasts/agent-detail-readonly.test.tsx — test that accordion sections render
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentDetailReadonly } from '../../../src/components/beasts/agent-detail-readonly';

const detail = {
  agent: {
    id: 'agent-1', definitionId: 'design-interview', status: 'running',
    source: 'dashboard', createdByUser: 'pfk',
    initAction: { kind: 'design-interview' as const, command: '/interview', config: {} },
    initConfig: {}, createdAt: '2026-03-15T10:00:00Z', updatedAt: '2026-03-15T10:05:00Z',
  },
  events: [],
};

describe('AgentDetailReadonly', () => {
  it('renders overview section with agent metadata', () => {
    render(<AgentDetailReadonly detail={detail} logs={[]} onExpandLogs={() => {}} />);
    expect(screen.getByText('Overview')).toBeTruthy();
    expect(screen.getByText(/design-interview/)).toBeTruthy();
  });

  it('renders events & logs section', () => {
    render(<AgentDetailReadonly detail={detail} logs={['log line 1']} onExpandLogs={() => {}} />);
    expect(screen.getByText('Events & Logs')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test, verify fail, implement, verify pass**

Implement `AgentDetailReadonly` using Radix `Accordion` with `type="multiple"`. Sections: Overview, LLM Configuration (gap banner), Modules, Skills (gap banner), Prompt Frontloading, Git Workflow, Events & Logs (with expand button). Each section uses `Accordion.Item` / `Accordion.Trigger` / `Accordion.Content`.

- [ ] **Step 3: Commit**

```bash
git add packages/franken-web/src/components/beasts/agent-detail-readonly.tsx packages/franken-web/tests/components/beasts/
git commit -m "feat(web): add AgentDetailReadonly with accordion sections"
```

### Task 3.4: Log Viewer Modal

**Files:**
- Create: `packages/franken-web/src/components/beasts/log-viewer-modal.tsx`
- Create: `packages/franken-web/tests/components/beasts/log-viewer-modal.test.tsx`

- [ ] **Step 1: Write failing test**

Test that the modal renders logs, has a fullscreen toggle button, and supports search/filter.

- [ ] **Step 2: Implement using Radix Dialog (modal=true)**

The modal renders at ~90vw/90vh. Header contains: title, search input, fullscreen toggle button (uses `document.documentElement.requestFullscreen()`), close button. Body is a `ScrollArea` containing log lines. Search filters log lines client-side.

- [ ] **Step 3: Run tests, verify pass, commit**

```bash
git add packages/franken-web/src/components/beasts/log-viewer-modal.tsx packages/franken-web/tests/components/beasts/log-viewer-modal.test.tsx
git commit -m "feat(web): add LogViewerModal with fullscreen toggle and search"
```

### Task 3.5: Wire Slide-In Panel Together

**Files:**
- Create: `packages/franken-web/src/components/beasts/agent-detail-panel.tsx` (composes slide-in + header + readonly/edit + action bar)

- [ ] **Step 1: Write failing test**

Test that the panel shows readonly by default, has a mode toggle, shows action bar, and calls onClose.

- [ ] **Step 2: Implement**

Compose: `SlideInPanel` → header (agent name + StatusLight + ToggleGroup readonly/edit + close X) → `AgentDetailReadonly` (or edit placeholder for now) → `AgentActionBar`. Wire `useBeastStore` for edit slice.

- [ ] **Step 3: Run tests, verify pass, commit**

```bash
git add packages/franken-web/src/components/beasts/agent-detail-panel.tsx packages/franken-web/tests/components/beasts/
git commit -m "feat(web): add AgentDetailPanel composing slide-in, readonly, and action bar"
```

---

## Chunk 4: Shared Form Components

### Task 4.1: Gap Banner Component

**Files:**
- Create: `packages/franken-web/src/components/beasts/shared/gap-banner.tsx`

- [ ] **Step 1: TDD cycle** — test renders message text with info styling, implement as a simple styled div with an info icon and message prop.

- [ ] **Step 2: Commit**

### Task 4.2: Provider/Model Cascading Select

**Files:**
- Create: `packages/franken-web/src/components/beasts/shared/provider-model-select.tsx`

- [ ] **Step 1: TDD cycle** — test that selecting a provider populates model options; test fallback to static list when no providers API; test "Use default" checkbox hides selects.

- [ ] **Step 2: Implement** using two Radix `Select` components. Props: `providers` array (fallback to hardcoded list), `value: { provider, model }`, `onChange`, `showUseDefault` boolean. When providers API isn't available, show gap banner + static list.

- [ ] **Step 3: Commit**

### Task 4.3: Preset Card Selector

**Files:**
- Create: `packages/franken-web/src/components/beasts/shared/preset-card.tsx`

- [ ] **Step 1: TDD cycle** — test renders cards, test radio behavior (only one selected), test accent border on selected.

- [ ] **Step 2: Implement** as a `ToggleGroup` wrapper with card-styled items.

- [ ] **Step 3: Commit**

### Task 4.4: File Picker with Context Health

**Files:**
- Create: `packages/franken-web/src/components/beasts/shared/file-picker.tsx`
- Create: `packages/franken-web/src/lib/token-estimator.ts`
- Create: `packages/franken-web/src/lib/path-utils.ts`

- [ ] **Step 1: TDD cycle for token-estimator** — test that `estimateTokens(text)` returns ~text.length/4, test health classification (green < 4000, yellow < 16000, red >= 16000).

- [ ] **Step 2: TDD cycle for path-utils** — test `normalizePath(path, serverEnv)` handles WSL conversion, rejects cross-env paths.

- [ ] **Step 3: TDD cycle for file-picker** — test renders file list, shows token count, shows health indicator colors, shows remediation text for red files.

- [ ] **Step 4: Implement** — file input (multiple), reads files via FileReader, runs through token estimator, displays preview + health badge. Red files show guidance text with copy-pasteable prompt.

- [ ] **Step 5: Commit**

---

## Chunk 5: Wizard Steps 1–4

### Task 5.1: Wizard Shell + Step Indicator

**Files:**
- Create: `packages/franken-web/src/components/beasts/wizard-dialog.tsx`
- Create: `packages/franken-web/src/components/beasts/wizard-step-indicator.tsx`
- Create: `packages/franken-web/tests/components/beasts/wizard-dialog.test.tsx`
- Create: `packages/franken-web/tests/components/beasts/wizard-step-indicator.test.tsx`

- [ ] **Step 1: TDD step indicator** — test renders 8 steps, test current step highlighted, test completed steps clickable, test future steps not clickable.

- [ ] **Step 2: Implement step indicator** — custom horizontal bar. Each step: label, circle with number. Styles via Tailwind: completed = accent, current = accent-strong + ring, upcoming = subtle.

- [ ] **Step 3: TDD wizard dialog** — test opens as Radix Dialog, test Back/Next navigation, test mode toggle preserves state, test Next blocked when validation fails.

- [ ] **Step 4: Implement wizard dialog** — Radix Dialog shell. Reads `wizardStep` from Zustand. Renders current step component. Footer: Back (disabled on step 0), Next (calls step validation before advancing), mode toggle. Step 7 (last before review) shows "Review" instead of "Next". Step 8 shows "Launch" instead of "Next".

- [ ] **Step 5: Commit**

### Task 5.2: Step 1 — Identity

**Files:**
- Create: `packages/franken-web/src/components/beasts/steps/step-identity.tsx`
- Create: `packages/franken-web/tests/components/beasts/steps/step-identity.test.tsx`

- [ ] **Step 1: TDD** — test name required validation, test description optional, test values stored in Zustand step 0.

- [ ] **Step 2: Implement** — name text input (required), description textarea (optional). Read/write via `useBeastStore` `stepValues[0]` and `validationErrors[0]`.

- [ ] **Step 3: Commit**

### Task 5.3: Step 2 — Workflow Type

**Files:**
- Create: `packages/franken-web/src/components/beasts/steps/step-workflow.tsx`
- Create: `packages/franken-web/tests/components/beasts/steps/step-workflow.test.tsx`

- [ ] **Step 1: TDD** — test 4 workflow cards render, test selecting one highlights it, test workflow-specific fields appear after selection, test validation requires selection.

- [ ] **Step 2: Implement** — 4 `PresetCard` items in a grid. Below cards: conditional fields per workflow type (file picker for chunk-plan, directory picker for martin-loop, textarea for design-interview, repo URL + label for issues agent).

- [ ] **Step 3: Commit**

### Task 5.4: Step 3 — LLM Targets

**Files:**
- Create: `packages/franken-web/src/components/beasts/steps/step-llm-targets.tsx`
- Create: `packages/franken-web/tests/components/beasts/steps/step-llm-targets.test.tsx`

- [ ] **Step 1: TDD** — test default provider/model select renders, test per-action overrides section expandable, test "Use default" checkbox hides per-action selects, test gap banner when no providers.

- [ ] **Step 2: Implement** — default `ProviderModelSelect`. Per-action section: list of action types (planning, execution, critique, reflection, chat) each with "Use default" checkbox + conditional `ProviderModelSelect`. Static fallback provider list: `[{ id: 'anthropic', models: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001'] }]`. Gap banner for per-action routing.

- [ ] **Step 3: Commit**

### Task 5.5: Step 4 — Modules & Configuration

**Files:**
- Create: `packages/franken-web/src/components/beasts/steps/step-modules.tsx`
- Create: `packages/franken-web/tests/components/beasts/steps/step-modules.test.tsx`

- [ ] **Step 1: TDD** — test 7 module cards render, test toggling a module on expands its config, test gap banners on deep config.

- [ ] **Step 2: Implement** — responsive grid of Radix `Toggle` cards (7 modules). Each toggle ON: Radix `Accordion.Item` appears below with module-specific form fields. All deep config fields show gap banners. Store values in Zustand `stepValues[3]`.

- [ ] **Step 3: Commit**

---

## Chunk 6: Wizard Steps 5–8

### Task 6.1: Step 5 — Skills

**Files:**
- Create: `packages/franken-web/src/components/beasts/steps/step-skills.tsx`
- Create: `packages/franken-web/tests/components/beasts/steps/step-skills.test.tsx`

- [ ] **Step 1: TDD** — test skill cards render from static list, test search filters, test click adds to selected chips, test chip removal.

- [ ] **Step 2: Implement** — Radix `Popover` with search input. Skill list from static fallback (gap banner). Cards with name + description. Selected area with removable chips. Store in Zustand `stepValues[4]`.

- [ ] **Step 3: Commit**

### Task 6.2: Step 6 — Prompt Frontloading

**Files:**
- Create: `packages/franken-web/src/components/beasts/steps/step-prompts.tsx`
- Create: `packages/franken-web/tests/components/beasts/steps/step-prompts.test.tsx`

- [ ] **Step 1: TDD** — test textarea renders, test file picker renders, test token estimation on file content, test health indicator colors, test remediation text for red files.

- [ ] **Step 2: Implement** — monospace textarea for text section. `FilePicker` component for files section. Store in Zustand `stepValues[5]`.

- [ ] **Step 3: Commit**

### Task 6.3: Step 7 — Git Workflow

**Files:**
- Create: `packages/franken-web/src/components/beasts/steps/step-git.tsx`
- Create: `packages/franken-web/tests/components/beasts/steps/step-git.test.tsx`

- [ ] **Step 1: TDD** — test 5 preset cards render, test selecting preset pre-fills override fields, test Custom preset leaves fields blank, test overriding a field preserves it when switching presets.

- [ ] **Step 2: Implement** — `PresetCard` group for 5 presets. Radix `Accordion` for override section with: base branch input, branch pattern input, PR creation toggle, commit convention select, merge strategy select. Preset selection writes defaults to Zustand `stepValues[6]`; user overrides are tracked separately.

Preset defaults:

```typescript
const GIT_PRESETS = {
  'one-shot': { baseBranch: 'main', branchPattern: '', prCreation: false, commitConvention: 'conventional', mergeStrategy: 'merge' },
  'feature-branch': { baseBranch: 'main', branchPattern: 'feat/{agent-name}/{id}', prCreation: true, commitConvention: 'conventional', mergeStrategy: 'squash' },
  'feature-branch-worktree': { baseBranch: 'main', branchPattern: 'feat/{agent-name}/{id}', prCreation: true, commitConvention: 'conventional', mergeStrategy: 'squash' },
  'yolo-main': { baseBranch: 'main', branchPattern: '', prCreation: false, commitConvention: 'freeform', mergeStrategy: 'merge' },
  'custom': { baseBranch: '', branchPattern: '', prCreation: false, commitConvention: 'conventional', mergeStrategy: 'merge' },
};
```

- [ ] **Step 3: Commit**

### Task 6.4: Step 8 — Review & Launch

**Files:**
- Create: `packages/franken-web/src/components/beasts/steps/step-review.tsx`
- Create: `packages/franken-web/tests/components/beasts/steps/step-review.test.tsx`

- [ ] **Step 1: TDD** — test all sections rendered from Zustand state, test "Edit" links call setWizardStep, test Launch button calls onLaunch prop.

- [ ] **Step 2: Implement** — reads all `stepValues[0..7]` from Zustand. Renders summary per section. Each section header has "Edit" link that calls `setWizardStep(n)`. Launch button at bottom validates all steps, then calls `onLaunch(assembledConfig)` which maps Zustand values to the `createAgent` API payload.

- [ ] **Step 3: Commit**

---

## Chunk 7: Single-Page Form Mode

### Task 7.1: Single-Page Form

**Files:**
- Create: `packages/franken-web/src/components/beasts/single-page-form.tsx`

- [ ] **Step 1: TDD** — test all 8 sections render as accordion items, test nested accordion in modules and git sections works, test Launch button at bottom.

- [ ] **Step 2: Implement** — Radix `Accordion` with `type="multiple"` as outer wrapper. Each step component rendered inside an `Accordion.Item`. Inner accordions in steps 4 and 7 are self-contained (separate `Accordion.Root` instances). Single Launch button at bottom (reuses Step 8 launch logic).

- [ ] **Step 3: Commit**

---

## Chunk 8: Integration — Wire Into ChatShell

### Task 8.1: Extend Beast API Types

**Files:**
- Modify: `packages/franken-web/src/lib/beast-api.ts`

- [ ] **Step 1: Add `name` field to `TrackedAgentSummary`** — optional string, displayed in AgentRow (falls back to `id` if absent).

```typescript
// Add to TrackedAgentSummary
name?: string;
```

- [ ] **Step 2: Add `killAgent()` method to `BeastApiClient`**

```typescript
async killAgent(agentId: string): Promise<TrackedAgentSummary> {
  return this.postAgentAction(agentId, 'kill');
}
```

- [ ] **Step 3: Add `patchAgentConfig()` method to `BeastApiClient`** (for edit mode save — degrades gracefully until backend endpoint exists)

```typescript
async patchAgentConfig(agentId: string, config: Partial<ExtendedAgentCreateInput>): Promise<TrackedAgentSummary> {
  return this.request(`/v1/beasts/agents/${agentId}/config`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
}
```

- [ ] **Step 4: Add new types** for extended agent config (llmConfig, moduleConfig deep, gitConfig, skills, prompts). These are frontend-only for now — stored in the create payload even though the backend may not process them yet.

```typescript
// Add to beast-api.ts
interface AgentLlmConfig {
  default?: { provider: string; model: string };
  overrides?: Record<string, { provider: string; model: string }>;
}

interface AgentGitConfig {
  preset: 'one-shot' | 'feature-branch' | 'feature-branch-worktree' | 'yolo-main' | 'custom';
  baseBranch: string;
  branchPattern: string;
  prCreation: boolean;
  prTemplate?: string;
  commitConvention: 'conventional' | 'freeform';
  mergeStrategy: 'merge' | 'squash' | 'rebase';
}

interface AgentDeepModuleConfig {
  firewall?: { ruleSet?: string; customRules?: string };
  memory?: { backend?: string; retentionPolicy?: string };
  planner?: { maxDagDepth?: number; parallelTaskLimit?: number };
  critique?: { maxIterations?: number; severityThreshold?: string };
  governor?: { approvalMode?: string; escalationRules?: string };
  heartbeat?: { reflectionInterval?: number; llmOverride?: { provider: string; model: string } };
}

interface ExtendedAgentCreateInput {
  name: string;
  description?: string;
  definitionId: string;
  initAction: TrackedAgentInitAction;
  moduleConfig?: ModuleConfig;
  deepModuleConfig?: AgentDeepModuleConfig;
  llmConfig?: AgentLlmConfig;
  gitConfig?: AgentGitConfig;
  skills?: string[];
  promptText?: string;
  promptFiles?: Array<{ name: string; content: string; tokens: number }>;
}
```

- [ ] **Step 5: Commit**

### Task 8.2: Create BeastsPage Root Component

**Files:**
- Create: `packages/franken-web/src/pages/beasts-page.tsx`

- [ ] **Step 1: TDD** — test renders AgentList, test clicking agent opens detail panel, test Create Agent opens wizard.

- [ ] **Step 2: Implement** — composes `AgentList` + `AgentDetailPanel` (slide-in) + `WizardDialog`. State: `showWizard` boolean, delegates `selectedAgentId` and `agents` from props. Props match what ChatShell currently passes to BeastDispatchPage.

- [ ] **Step 3: Commit**

### Task 8.3: Update Old Tests

**Files:**
- Delete: `packages/franken-web/tests/components/beast-dispatch-page.test.tsx`
- Modify: `packages/franken-web/tests/components/chat-shell.test.tsx`

- [ ] **Step 1: Delete `beast-dispatch-page.test.tsx`** — this file tests the old 3-column page which is replaced by `BeastsPage`.

- [ ] **Step 2: Update `chat-shell.test.tsx`** — any assertions that check for `BeastDispatchPage` rendering in the beasts route should be updated to check for `BeastsPage` instead. Update import references.

- [ ] **Step 3: Run tests to verify no regressions**

Run: `cd packages/franken-web && npx vitest run tests/components/chat-shell.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/franken-web/tests/components/
git commit -m "test(web): update tests for BeastsPage, remove old beast-dispatch-page tests"
```

### Task 8.4: Update ChatShell to Use BeastsPage

**Files:**
- Modify: `packages/franken-web/src/components/chat-shell.tsx`

- [ ] **Step 1: Replace import** — change `BeastDispatchPage` import to `BeastsPage` import.

- [ ] **Step 2: Refactor polling with deduplication** — the list poll (`GET /v1/beasts/agents`) returns all agent summaries. When a selected agent's detail panel is open, skip the separate `getAgent()` call if the list poll data is fresh enough. Implementation:

```typescript
// In the beast polling useEffect:
const agentList = await beastClient.listAgents();
setBeastAgents(agentList);

// Deduplicate detail fetch: if selectedAgent is in the list, use list data
// Only fetch full detail (events, run logs) separately
if (selectedBeastAgentId) {
  const summaryFromList = agentList.find(a => a.id === selectedBeastAgentId);
  if (summaryFromList) {
    // Only fetch events + run detail (not the agent summary itself)
    const detail = await beastClient.getAgent(selectedBeastAgentId);
    // ... merge with run logs as before
  }
}
```

After any user-initiated action (stop, start, restart, etc.), set `beastRefreshNonce` to trigger an immediate re-fetch outside the 4s interval.

- [ ] **Step 3: Wire `onKill`** — map to `beastClient.killAgent()` (added in Task 8.1).

- [ ] **Step 4: Update the route rendering** — replace `<BeastDispatchPage .../>` with `<BeastsPage .../>` in the beasts route case, mapping the same props.

- [ ] **Step 5: Run full test suite**

Run: `cd packages/franken-web && npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Run build**

Run: `cd packages/franken-web && npm run build`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add packages/franken-web/src/
git commit -m "feat(web): wire BeastsPage into ChatShell, replace BeastDispatchPage"
```

---

## Chunk 9: Edit Mode + Typecheck + Final Verification

### Task 9.1: Agent Detail Edit Mode

**Files:**
- Create: `packages/franken-web/src/components/beasts/agent-detail-edit.tsx`
- Create: `packages/franken-web/tests/components/beasts/agent-detail-edit.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/components/beasts/agent-detail-edit.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentDetailEdit } from '../../../src/components/beasts/agent-detail-edit';
import { useBeastStore } from '../../../src/stores/beast-store';

describe('AgentDetailEdit', () => {
  beforeEach(() => {
    useBeastStore.getState().resetEdit();
  });

  it('renders editable form fields for agent name', () => {
    useBeastStore.getState().setEditSnapshot({ name: 'Agent1' });
    useBeastStore.getState().setEditValues({ name: 'Agent1' });
    render(<AgentDetailEdit onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByDisplayValue('Agent1')).toBeTruthy();
  });

  it('save button is disabled when not dirty', () => {
    useBeastStore.getState().setEditSnapshot({ name: 'Agent1' });
    useBeastStore.getState().setEditValues({ name: 'Agent1' });
    render(<AgentDetailEdit onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Save').closest('button')).toBeDisabled();
  });

  it('save button enables when dirty, calls onSave with values', () => {
    const onSave = vi.fn();
    useBeastStore.getState().setEditSnapshot({ name: 'Agent1' });
    useBeastStore.getState().setEditValues({ name: 'Agent1-modified' });
    render(<AgentDetailEdit onSave={onSave} onCancel={vi.fn()} />);
    const saveBtn = screen.getByText('Save').closest('button')!;
    expect(saveBtn).not.toBeDisabled();
    fireEvent.click(saveBtn);
    expect(onSave).toHaveBeenCalledWith({ name: 'Agent1-modified' });
  });

  it('shows restart-required tooltip on module toggle fields', () => {
    useBeastStore.getState().setEditSnapshot({ name: 'A' });
    useBeastStore.getState().setEditValues({ name: 'A' });
    render(<AgentDetailEdit onSave={vi.fn()} onCancel={vi.fn()} />);
    // Module section fields should have aria-description with restart warning
    const moduleSection = screen.getByText('Modules');
    expect(moduleSection).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement** — same accordion structure as readonly but with editable controls. Uses `useBeastStore` `agentEditSlice`. `onSave` prop calls `beastClient.patchAgentConfig()` (added in Task 8.1). Save button in header disabled until `isEditDirty`. Cancel triggers `AlertDialog` if dirty. Restart-required fields (workflow type, module toggles, module deep config, git workflow) get Radix `Tooltip` with `aria-description="Takes effect at next turn boundary"`.

  Accessibility requirements per spec Section 7:
  - `aria-description` warning on restart-required field toggles
  - All Radix Tooltip triggers have descriptive `aria-label`

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

### Task 9.2: Full Typecheck + Test Pass

- [ ] **Step 1: Run typecheck**

Run: `cd packages/franken-web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run all tests**

Run: `cd packages/franken-web && npx vitest run`
Expected: All pass

- [ ] **Step 3: Run full monorepo build**

Run: `npm run build`
Expected: All packages build

- [ ] **Step 4: Final commit if any fixes needed**

---

## Dependency Graph

```
Chunk 1 (Foundation) ──┐
                       ├── Chunk 2 (List + Row + StatusLight)
                       ├── Chunk 4 (Shared Components)
                       │
Chunk 1 ───────────────┤
                       ├── Chunk 3 Tasks 3.1-3.4 (Slide-In Panel shell, action bar, readonly, log modal)
                       │
Chunk 2 + 3.1-3.4 ────┤
                       ├── Chunk 3 Task 3.5 (Wire panel together — needs StatusLight from Chunk 2)
                       │
Chunk 4 ───────────────┤
                       ├── Chunk 5 (Wizard Steps 1-4)
                       ├── Chunk 6 (Wizard Steps 5-8)
                       │
Chunk 3 + 5 + 6 ──────┤
                       ├── Chunk 7 (Single-Page Form)
                       │
All above ─────────────┤
                       ├── Chunk 8 (Integration + Old Test Cleanup)
                       ├── Chunk 9 (Edit Mode + Final)
```

Chunks 2, 3 (Tasks 3.1-3.4), 4 can run in parallel after Chunk 1.
Chunk 3 Task 3.5 depends on Chunk 2 (imports StatusLight).
Chunks 5, 6 can run in parallel after Chunk 4.
Chunk 7 depends on 5 + 6.
Chunk 8 depends on 2 + 3 + 7.
Chunk 9 depends on 8.
