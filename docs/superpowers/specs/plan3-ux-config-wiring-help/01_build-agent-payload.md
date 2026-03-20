# Chunk 01: Build Agent Payload — Wizard Config → Typed API Payload

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a pure function `buildAgentCreatePayload(wizardConfig)` that maps the wizard's section-keyed config into `ExtendedAgentCreateInput`, and fix the `StepReview` key mismatch.

**Spec section:** Plan 3, Section 1

---

## Pre-conditions

- Plan 1 complete (config passthrough exists so the daemon can receive and store typed config)

---

## Files

- **Create:** `packages/franken-web/src/lib/build-agent-payload.ts`
- **Modify:** `packages/franken-web/src/components/beasts/steps/step-review.tsx` (fix key mismatch)
- **Modify:** `packages/franken-web/src/lib/beast-api.ts` (update `createAgent()` to accept `ExtendedAgentCreateInput`)
- **Test:** `packages/franken-web/src/lib/__tests__/build-agent-payload.test.ts`

---

## Context

Read these files before starting:

- `packages/franken-web/src/lib/beast-api.ts` — 297 lines. `ExtendedAgentCreateInput` at lines 113-125 (exists but unused). `createAgent()` currently accepts `{ definitionId, initAction, initConfig }`.
- `packages/franken-web/src/components/beasts/wizard-dialog.tsx` — 185 lines. `SECTION_KEYS` at line 15: `['identity', 'workflow', 'llm', 'modules', 'skills', 'prompts', 'git', 'review']`. `buildAndLaunch()` at lines 32-38 maps `stepValues[i]` → `config[SECTION_KEYS[i]]`.
- `packages/franken-web/src/components/beasts/steps/step-review.tsx` — 121 lines. `handleLaunch()` at line 15 uses `SECTION_LABELS[i].toLowerCase().replace(/ /g, '_')` as keys — produces `llm_targets` instead of `llm`. This is a **bug**.
- `packages/franken-web/src/components/chat-shell.tsx` — 550 lines. `onLaunch` at lines 453-460 extracts `workflow.workflowType` and sends opaque `initConfig`.

---

## Current State

**Two launch paths, different key shapes:**

1. `WizardDialog.buildAndLaunch()` uses `SECTION_KEYS`: `identity`, `workflow`, `llm`, `modules`, `skills`, `prompts`, `git`
2. `StepReview.handleLaunch()` uses `SECTION_LABELS[i].toLowerCase().replace(/ /g, '_')`: `identity`, `workflow`, `llm_targets`, `modules`, `skills`, `prompts`, `git_workflow`

The mismatch means the config shape depends on which button the user clicks. Fix: normalize `StepReview` to use `SECTION_KEYS`.

`BeastApiClient.createAgent()` sends `{ definitionId, initAction, initConfig: Record<string, unknown> }` — all typed fields on `ExtendedAgentCreateInput` are unused.

---

## Tasks

### Task 1: Fix StepReview key mismatch

- [ ] **Step 1: Write the failing test — StepReview uses SECTION_KEYS**

Create a test that verifies `StepReview.handleLaunch()` produces the same keys as `WizardDialog.buildAndLaunch()`:

Note: Since `StepReview` is a React component, the test verifies the keys used in the launch callback. This is best tested as part of the integration test in Task 3. For now, make the fix directly.

- [ ] **Step 2a: Export SECTION_KEYS from wizard-dialog.tsx**

In `packages/franken-web/src/components/beasts/wizard-dialog.tsx`, line 15:

```typescript
// Before:
const SECTION_KEYS = ['identity', 'workflow', 'llm', 'modules', 'skills', 'prompts', 'git', 'review'];

// After:
export const SECTION_KEYS = ['identity', 'workflow', 'llm', 'modules', 'skills', 'prompts', 'git', 'review'];
```

- [ ] **Step 2b: Fix StepReview.handleLaunch()**

In `packages/franken-web/src/components/beasts/steps/step-review.tsx`:

1. Import `SECTION_KEYS` from `../wizard-dialog.js`
2. Replace the key generation logic:

```typescript
// Before:
const key = SECTION_LABELS[i].toLowerCase().replace(/ /g, '_');

// After:
import { SECTION_KEYS } from '../wizard-dialog.js';
const key = SECTION_KEYS[i];
```

- [ ] **Step 3: Verify no type errors**

Run: `npx turbo run typecheck --filter=franken-web`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/franken-web/src/components/beasts/steps/step-review.tsx packages/franken-web/src/components/beasts/wizard-dialog.tsx
git commit -m "fix(web): normalize StepReview.handleLaunch to use SECTION_KEYS"
```

---

### Task 2: Create buildAgentCreatePayload pure function

- [ ] **Step 1: Write the failing tests**

Create `packages/franken-web/src/lib/__tests__/build-agent-payload.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildAgentCreatePayload } from '../build-agent-payload.js';

describe('buildAgentCreatePayload', () => {
  const fullConfig = {
    identity: { name: 'Test Agent', description: 'A test agent' },
    workflow: { workflowType: 'martin-loop', chunkDir: './plan-foo/' },
    llm: {
      defaultProvider: 'anthropic',
      defaultModel: 'claude-sonnet-4-6',
      overrides: {
        planning: { provider: 'anthropic', model: 'claude-opus-4-6', useDefault: false },
        execution: { useDefault: true },
      },
    },
    modules: {
      firewall: true,
      skills: false,
      memory: true,
      memoryConfig: { backend: 'sqlite', retentionPolicy: 'persistent' },
      planner: true,
      critique: true,
      critiqueConfig: { maxIterations: 5, severityThreshold: 'medium' },
      governor: false,
      heartbeat: false,
    },
    skills: { selectedSkills: ['code-review', 'testing'] },
    prompts: { promptText: 'Focus on quality', files: [{ name: 'spec.md', content: '...', tokens: 100 }] },
    git: {
      preset: 'feature-branch',
      baseBranch: 'main',
      branchPattern: 'feat/{agent}-{chunk}',
      prCreation: true,
      commitConvention: 'conventional',
      mergeStrategy: 'squash',
    },
  };

  it('maps definitionId from workflow.workflowType', () => {
    const payload = buildAgentCreatePayload(fullConfig);
    expect(payload.definitionId).toBe('martin-loop');
  });

  it('maps name and description from identity', () => {
    const payload = buildAgentCreatePayload(fullConfig);
    expect(payload.name).toBe('Test Agent');
    expect(payload.description).toBe('A test agent');
  });

  it('maps llmConfig with default and filtered overrides', () => {
    const payload = buildAgentCreatePayload(fullConfig);
    expect(payload.llmConfig).toEqual({
      default: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
      overrides: {
        planning: { provider: 'anthropic', model: 'claude-opus-4-6' },
      },
    });
    // execution override has useDefault=true → should be excluded
    expect(payload.llmConfig?.overrides?.execution).toBeUndefined();
  });

  it('maps moduleConfig as boolean flags', () => {
    const payload = buildAgentCreatePayload(fullConfig);
    expect(payload.moduleConfig).toEqual({
      firewall: true,
      skills: false,
      memory: true,
      planner: true,
      critique: true,
      governor: false,
      heartbeat: false,
    });
  });

  it('maps deepModuleConfig from *Config fields', () => {
    const payload = buildAgentCreatePayload(fullConfig);
    expect(payload.deepModuleConfig).toEqual({
      memory: { backend: 'sqlite', retentionPolicy: 'persistent' },
      critique: { maxIterations: 5, severityThreshold: 'medium' },
    });
  });

  it('transforms heartbeat deep config llmProvider/llmModel into llmOverride', () => {
    const config = {
      ...fullConfig,
      modules: {
        ...fullConfig.modules,
        heartbeat: true,
        heartbeatConfig: { reflectionInterval: 60, llmProvider: 'anthropic', llmModel: 'claude-opus-4-6' },
      },
    };
    const payload = buildAgentCreatePayload(config);
    expect(payload.deepModuleConfig?.heartbeat).toEqual({
      reflectionInterval: 60,
      llmOverride: { provider: 'anthropic', model: 'claude-opus-4-6' },
    });
  });

  it('maps skills from selectedSkills', () => {
    const payload = buildAgentCreatePayload(fullConfig);
    expect(payload.skills).toEqual(['code-review', 'testing']);
  });

  it('maps promptText and promptFiles', () => {
    const payload = buildAgentCreatePayload(fullConfig);
    expect(payload.promptText).toBe('Focus on quality');
    expect(payload.promptFiles).toEqual([{ name: 'spec.md', content: '...', tokens: 100 }]);
  });

  it('maps gitConfig', () => {
    const payload = buildAgentCreatePayload(fullConfig);
    expect(payload.gitConfig).toEqual({
      preset: 'feature-branch',
      baseBranch: 'main',
      branchPattern: 'feat/{agent}-{chunk}',
      prCreation: true,
      commitConvention: 'conventional',
      mergeStrategy: 'squash',
    });
  });

  it('handles minimal config (only identity + workflow)', () => {
    const minimal = {
      identity: { name: 'Minimal' },
      workflow: { workflowType: 'design-interview', topic: 'Test idea' },
    };
    const payload = buildAgentCreatePayload(minimal);
    expect(payload.definitionId).toBe('design-interview');
    expect(payload.name).toBe('Minimal');
    expect(payload.llmConfig).toBeUndefined();
    expect(payload.skills).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/build-agent-payload.test.ts --reporter=verbose`
(Run from `packages/franken-web/`)
Expected: FAIL — module not found

- [ ] **Step 3: Implement buildAgentCreatePayload**

Create `packages/franken-web/src/lib/build-agent-payload.ts`:

```typescript
import type { ExtendedAgentCreateInput, AgentLlmConfig, AgentGitConfig, ModuleConfig, AgentDeepModuleConfig } from './beast-api.js';

const MODULE_KEYS = ['firewall', 'skills', 'memory', 'planner', 'critique', 'governor', 'heartbeat'] as const;

interface WizardConfig {
  identity?: { name?: string; description?: string };
  workflow?: { workflowType?: string; [key: string]: unknown };
  llm?: {
    defaultProvider?: string;
    defaultModel?: string;
    overrides?: Record<string, { provider?: string; model?: string; useDefault?: boolean }>;
  };
  modules?: Record<string, unknown>;
  skills?: { selectedSkills?: string[] };
  prompts?: { promptText?: string; files?: Array<{ name: string; content: string; tokens: number }> };
  git?: Record<string, unknown>;
  chatSessionId?: string;
}

export function buildAgentCreatePayload(config: WizardConfig, chatSessionId?: string): ExtendedAgentCreateInput {
  const payload: ExtendedAgentCreateInput = {
    name: config.identity?.name ?? '',
    definitionId: config.workflow?.workflowType ?? '',
    initAction: buildInitAction(config.workflow, chatSessionId),
  };

  if (config.identity?.description) {
    payload.description = config.identity.description;
  }

  // LLM config
  const llmConfig = buildLlmConfig(config.llm);
  if (llmConfig) payload.llmConfig = llmConfig;

  // Module config (boolean flags)
  const moduleConfig = buildModuleConfig(config.modules);
  if (moduleConfig) payload.moduleConfig = moduleConfig;

  // Deep module config (nested settings)
  const deepConfig = buildDeepModuleConfig(config.modules);
  if (deepConfig) payload.deepModuleConfig = deepConfig;

  // Skills
  if (config.skills?.selectedSkills?.length) {
    payload.skills = config.skills.selectedSkills;
  }

  // Prompts
  if (config.prompts?.promptText) {
    payload.promptText = config.prompts.promptText;
  }
  if (config.prompts?.files?.length) {
    payload.promptFiles = config.prompts.files;
  }

  // Git config
  if (config.git) {
    payload.gitConfig = config.git as AgentGitConfig;
  }

  return payload;
}

function buildInitAction(workflow?: WizardConfig['workflow'], chatSessionId?: string) {
  if (!workflow) return { kind: 'martin-loop' as const, command: '', config: {} };
  const { workflowType, ...rest } = workflow;
  return {
    kind: (workflowType ?? 'martin-loop') as 'design-interview' | 'chunk-plan' | 'martin-loop' | 'issues-agent',
    command: '',
    config: rest,
    ...(chatSessionId ? { chatSessionId } : {}),
  };
}

function buildLlmConfig(llm?: WizardConfig['llm']): AgentLlmConfig | undefined {
  if (!llm?.defaultProvider && !llm?.defaultModel) return undefined;

  const config: AgentLlmConfig = {};

  if (llm.defaultProvider || llm.defaultModel) {
    config.default = {
      provider: llm.defaultProvider ?? '',
      model: llm.defaultModel ?? '',
    };
  }

  if (llm.overrides) {
    const overrides: Record<string, { provider: string; model: string }> = {};
    for (const [key, val] of Object.entries(llm.overrides)) {
      if (!val.useDefault && val.provider && val.model) {
        overrides[key] = { provider: val.provider, model: val.model };
      }
    }
    if (Object.keys(overrides).length > 0) {
      config.overrides = overrides;
    }
  }

  return config;
}

function buildModuleConfig(modules?: Record<string, unknown>): ModuleConfig | undefined {
  if (!modules) return undefined;
  const config: Record<string, boolean> = {};
  for (const key of MODULE_KEYS) {
    if (typeof modules[key] === 'boolean') {
      config[key] = modules[key] as boolean;
    }
  }
  return Object.keys(config).length > 0 ? (config as ModuleConfig) : undefined;
}

function buildDeepModuleConfig(modules?: Record<string, unknown>): AgentDeepModuleConfig | undefined {
  if (!modules) return undefined;
  const deep: Record<string, Record<string, unknown>> = {};
  for (const key of MODULE_KEYS) {
    const configKey = `${key}Config`;
    if (modules[configKey] && typeof modules[configKey] === 'object') {
      const raw = modules[configKey] as Record<string, unknown>;
      // Heartbeat: wizard stores llmProvider/llmModel as flat fields,
      // but API expects { llmOverride: { provider, model } }
      if (key === 'heartbeat' && ('llmProvider' in raw || 'llmModel' in raw)) {
        const { llmProvider, llmModel, ...rest } = raw;
        deep[key] = {
          ...rest,
          ...(llmProvider || llmModel
            ? { llmOverride: { provider: llmProvider ?? '', model: llmModel ?? '' } }
            : {}),
        };
      } else {
        deep[key] = raw;
      }
    }
  }
  return Object.keys(deep).length > 0 ? (deep as AgentDeepModuleConfig) : undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/build-agent-payload.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-web/src/lib/build-agent-payload.ts packages/franken-web/src/lib/__tests__/build-agent-payload.test.ts
git commit -m "feat(web): add buildAgentCreatePayload mapping wizard config to typed API payload"
```

---

### Task 3: Update BeastApiClient.createAgent to accept ExtendedAgentCreateInput

- [ ] **Step 1: Update the method signature**

In `packages/franken-web/src/lib/beast-api.ts`, update `createAgent()`:

```typescript
// Before:
async createAgent(input: { definitionId: string; initAction: TrackedAgentInitAction; initConfig: Record<string, unknown>; chatSessionId?: string; moduleConfig?: ModuleConfig }): Promise<TrackedAgentSummary>

// After:
async createAgent(input: ExtendedAgentCreateInput): Promise<TrackedAgentSummary>
```

Update the request body construction to send all typed fields instead of the opaque `initConfig` bag.

- [ ] **Step 2: Run typecheck to verify**

Run: `npx turbo run typecheck --filter=franken-web`
Expected: PASS (or identify callers that need updating — addressed in Chunk 04)

- [ ] **Step 3: Commit**

```bash
git add packages/franken-web/src/lib/beast-api.ts
git commit -m "feat(web): update BeastApiClient.createAgent to accept ExtendedAgentCreateInput"
```
