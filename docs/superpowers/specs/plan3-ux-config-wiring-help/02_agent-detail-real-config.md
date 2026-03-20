# Chunk 02: Agent Detail Panel — Show Real Config

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded placeholder strings in `AgentDetailReadonly` with real config data from the agent's `initConfig` typed fields.

**Spec section:** Plan 3, Section 2

---

## Pre-conditions

- Chunk 01 complete (`buildAgentCreatePayload` maps wizard config to typed fields, `BeastApiClient.createAgent` sends typed payload)
- The `GET /v1/beasts/agents/:id` endpoint returns `TrackedAgent` with populated typed fields (relies on Plan 1 Chunk 04 config passthrough storing the structured data)

---

## Files

- **Modify:** `packages/franken-web/src/components/beasts/agent-detail-readonly.tsx`
- **Test:** Component tests (vitest + testing-library or similar)

---

## Context

Read these files before starting:

- `packages/franken-web/src/components/beasts/agent-detail-readonly.tsx` — 114 lines. Currently hardcoded sections:
  - Line 36: LLM Configuration → "Using process defaults"
  - Line 40: Modules → partially dynamic (reads `agent.moduleConfig` for badges)
  - Line 54: Skills → "No skills configured"
  - Line 58: Prompts → "No prompt frontloading configured"
  - Line 62: Git Workflow → "Using default git settings"
- `packages/franken-web/src/lib/beast-api.ts` — `ExtendedAgentCreateInput`, `AgentLlmConfig`, `AgentGitConfig`, `ModuleConfig`, `AgentDeepModuleConfig` types

---

## Current State

`AgentDetailReadonly` renders five accordion sections. Four of five show hardcoded placeholder text regardless of actual config. The Modules section is partially dynamic (shows enabled/disabled badges) but doesn't display deep config.

**Component signature:** `AgentDetailReadonly` accepts `{ detail: TrackedAgentDetail; logs: string[]; onExpandLogs: () => void }`. The `TrackedAgentDetail` type is `{ agent: TrackedAgentSummary; events: TrackedAgentEvent[] }`. Config data lives on `agent.initConfig` which is typed as `Record<string, unknown>`. Since Plan 1 Chunk 04 stores the typed config payload, the API response will include typed fields within `initConfig`. The component accesses them via `detail.agent.initConfig.llmConfig`, etc.

**Type access note:** `initConfig` is `Record<string, unknown>`, so nested property access requires casting. Each section should cast the relevant field: `const llmConfig = detail.agent.initConfig?.llmConfig as AgentLlmConfig | undefined`.

---

## Tasks

### Task 1: LLM Configuration section — show real config

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentDetailReadonly } from '../agent-detail-readonly.js';

describe('AgentDetailReadonly — LLM section', () => {
  it('displays default provider and model when llmConfig is present', () => {
    const agent = {
      id: 'agent_1',
      initConfig: {
        llmConfig: {
          default: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
          overrides: { planning: { provider: 'anthropic', model: 'claude-opus-4-6' } },
        },
      },
    };

    render(<AgentDetailReadonly detail={{ agent, events: [] } as any} logs={[]} onExpandLogs={() => {}} />);

    expect(screen.getByText(/anthropic/)).toBeTruthy();
    expect(screen.getByText(/claude-sonnet-4-6/)).toBeTruthy();
    expect(screen.getByText(/planning/i)).toBeTruthy();
    expect(screen.getByText(/claude-opus-4-6/)).toBeTruthy();
  });

  it('shows fallback when llmConfig is absent', () => {
    const agent = { id: 'agent_1', initConfig: {} };
    render(<AgentDetailReadonly detail={{ agent, events: [] } as any} logs={[]} onExpandLogs={() => {}} />);
    expect(screen.getByText(/using process defaults/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Update LLM section in AgentDetailReadonly**

In `packages/franken-web/src/components/beasts/agent-detail-readonly.tsx`, replace the LLM Configuration section:

Inside the component, destructure: `const { agent } = detail;` and cast typed fields:

```tsx
const llmConfig = agent.initConfig?.llmConfig as AgentLlmConfig | undefined;
```

Then use the cast variable:

```tsx
{/* LLM Configuration */}
{llmConfig ? (
  <div>
    <div>
      <span className="font-medium">Default:</span>{' '}
      {llmConfig.default?.provider} / {llmConfig.default?.model}
    </div>
    {llmConfig.overrides && Object.keys(agent.initConfig.llmConfig.overrides).length > 0 && (
      <div className="mt-2">
        <span className="font-medium">Overrides:</span>
        <table className="mt-1 text-sm">
          <tbody>
            {Object.entries(agent.initConfig.llmConfig.overrides).map(([action, config]) => (
              <tr key={action}>
                <td className="pr-4 capitalize">{action}</td>
                <td>{config.provider} / {config.model}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
) : (
  <p className="text-sm text-muted-foreground italic">Using process defaults</p>
)}
```

- [ ] **Step 3: Run tests**

Run from `packages/franken-web/`: `npx vitest run --reporter=verbose`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/franken-web/src/components/beasts/agent-detail-readonly.tsx
git commit -m "feat(web): show real LLM config in agent detail panel"
```

---

### Task 2: Skills section — show real config

- [ ] **Step 1: Write the failing test**

```typescript
describe('AgentDetailReadonly — Skills section', () => {
  it('displays skill chips when skills are present', () => {
    const agent = {
      id: 'agent_1',
      initConfig: { skills: ['code-review', 'testing', 'debugging'] },
    };
    render(<AgentDetailReadonly detail={{ agent, events: [] } as any} logs={[]} onExpandLogs={() => {}} />);
    expect(screen.getByText('code-review')).toBeTruthy();
    expect(screen.getByText('testing')).toBeTruthy();
    expect(screen.getByText('debugging')).toBeTruthy();
  });

  it('shows fallback for empty skills array', () => {
    const agent = { id: 'agent_1', initConfig: { skills: [] } };
    render(<AgentDetailReadonly detail={{ agent, events: [] } as any} logs={[]} onExpandLogs={() => {}} />);
    expect(screen.getByText(/no skills selected/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Update Skills section**

```tsx
{/* Skills */}
{agent.initConfig?.skills?.length ? (
  <div className="flex flex-wrap gap-2">
    {agent.initConfig.skills.map((skill: string) => (
      <span key={skill} className="px-2 py-1 bg-secondary rounded-md text-sm">{skill}</span>
    ))}
  </div>
) : (
  <p className="text-sm text-muted-foreground italic">No skills selected</p>
)}
```

- [ ] **Step 3: Run tests and commit**

```bash
git add packages/franken-web/src/components/beasts/agent-detail-readonly.tsx
git commit -m "feat(web): show real skills in agent detail panel"
```

---

### Task 3: Prompts section — show real config

- [ ] **Step 1: Write the failing test**

```typescript
describe('AgentDetailReadonly — Prompts section', () => {
  it('displays prompt text (truncated) and files', () => {
    const agent = {
      id: 'agent_1',
      initConfig: {
        promptText: 'Focus on quality and security. Always write tests first. ' + 'x'.repeat(250),
        promptFiles: [
          { name: 'spec.md', tokens: 1200 },
          { name: 'context.md', tokens: 800 },
        ],
      },
    };
    render(<AgentDetailReadonly detail={{ agent, events: [] } as any} logs={[]} onExpandLogs={() => {}} />);
    expect(screen.getByText(/focus on quality/i)).toBeTruthy();
    expect(screen.getByText('...')).toBeTruthy(); // Truncated
    expect(screen.getByText('spec.md')).toBeTruthy();
    expect(screen.getByText(/1200/)).toBeTruthy();
  });

  it('shows fallback when no prompts', () => {
    const agent = { id: 'agent_1', initConfig: {} };
    render(<AgentDetailReadonly detail={{ agent, events: [] } as any} logs={[]} onExpandLogs={() => {}} />);
    expect(screen.getByText(/no prompt frontloading configured/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Update Prompts section**

```tsx
{/* Prompts */}
{agent.initConfig?.promptText || agent.initConfig?.promptFiles?.length ? (
  <div>
    {agent.initConfig.promptText && (
      <p className="text-sm">
        {agent.initConfig.promptText.length > 200
          ? agent.initConfig.promptText.slice(0, 200) + '...'
          : agent.initConfig.promptText}
      </p>
    )}
    {agent.initConfig.promptFiles?.length > 0 && (
      <ul className="mt-2 text-sm">
        {agent.initConfig.promptFiles.map((f: { name: string; tokens: number }) => (
          <li key={f.name}>{f.name} ({f.tokens} tokens)</li>
        ))}
      </ul>
    )}
  </div>
) : (
  <p className="text-sm text-muted-foreground italic">No prompt frontloading configured</p>
)}
```

- [ ] **Step 3: Run tests and commit**

```bash
git add packages/franken-web/src/components/beasts/agent-detail-readonly.tsx
git commit -m "feat(web): show real prompt config in agent detail panel"
```

---

### Task 4: Git Workflow section — show real config

- [ ] **Step 1: Write the failing test**

```typescript
describe('AgentDetailReadonly — Git section', () => {
  it('displays git preset and settings', () => {
    const agent = {
      id: 'agent_1',
      initConfig: {
        gitConfig: {
          preset: 'feature-branch',
          baseBranch: 'main',
          branchPattern: 'feat/{agent}-{chunk}',
          prCreation: true,
          commitConvention: 'conventional',
          mergeStrategy: 'squash',
        },
      },
    };
    render(<AgentDetailReadonly detail={{ agent, events: [] } as any} logs={[]} onExpandLogs={() => {}} />);
    expect(screen.getByText(/feature-branch/i)).toBeTruthy();
    expect(screen.getByText(/main/)).toBeTruthy();
    expect(screen.getByText(/squash/i)).toBeTruthy();
  });

  it('shows fallback when gitConfig is absent', () => {
    const agent = { id: 'agent_1', initConfig: {} };
    render(<AgentDetailReadonly detail={{ agent, events: [] } as any} logs={[]} onExpandLogs={() => {}} />);
    expect(screen.getByText(/using default git settings/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Update Git Workflow section**

```tsx
{/* Git Workflow */}
{agent.initConfig?.gitConfig ? (
  <div>
    <span className="px-2 py-1 bg-primary/10 rounded-md text-sm font-medium">
      {agent.initConfig.gitConfig.preset}
    </span>
    <div className="mt-2 text-sm space-y-1">
      <div>Base branch: <code>{agent.initConfig.gitConfig.baseBranch}</code></div>
      <div>Branch pattern: <code>{agent.initConfig.gitConfig.branchPattern}</code></div>
      {agent.initConfig.gitConfig.prCreation && <div>PR creation: enabled</div>}
      <div>Commits: {agent.initConfig.gitConfig.commitConvention}</div>
      <div>Merge: {agent.initConfig.gitConfig.mergeStrategy}</div>
    </div>
  </div>
) : (
  <p className="text-sm text-muted-foreground italic">Using default git settings</p>
)}
```

- [ ] **Step 3: Run tests and commit**

```bash
git add packages/franken-web/src/components/beasts/agent-detail-readonly.tsx
git commit -m "feat(web): show real git config in agent detail panel"
```

---

### Task 5: Modules section — extend with deep config display

- [ ] **Step 1: Write the failing test**

```typescript
describe('AgentDetailReadonly — Modules deep config', () => {
  it('displays deep config under module badge when present', () => {
    const agent = {
      id: 'agent_1',
      initConfig: {
        deepModuleConfig: {
          critique: { maxIterations: 5, severityThreshold: 'medium' },
        },
      },
      moduleConfig: { critique: true, firewall: true },
    };
    render(<AgentDetailReadonly detail={{ agent, events: [] } as any} logs={[]} onExpandLogs={() => {}} />);
    expect(screen.getByText(/maxIterations/)).toBeTruthy();
    expect(screen.getByText(/5/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Update Modules section to show deep config**

Under each enabled module badge, if `agent.initConfig?.deepModuleConfig?.[moduleName]` exists, render key-value pairs:

```tsx
{deepConfig && Object.entries(deepConfig).map(([key, value]) => (
  <div key={key} className="text-xs text-muted-foreground ml-2">
    {key}: {String(value)}
  </div>
))}
```

- [ ] **Step 3: Run tests and commit**

```bash
git add packages/franken-web/src/components/beasts/agent-detail-readonly.tsx
git commit -m "feat(web): show deep module config in agent detail panel"
```
