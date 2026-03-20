# Chunk 05: Help Docs — CLI Help, Guide, Wizard Help Text

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `--help` output for all beast CLI subcommands, create a user-facing guide document, and add contextual help text to wizard steps.

**Spec section:** Plan 3, Section 4

---

## Pre-conditions

- Chunk 01 complete (wizard config mapping finalized — help text references these fields)
- Chunk 02 complete (detail panel shows real config — guide doc references this)

---

## Files

- **Modify:** `packages/franken-orchestrator/src/cli/args.ts` (help text metadata)
- **Create:** `docs/guides/launch-and-manage-agents.md`
- **Modify:** `packages/franken-web/src/components/beasts/wizard-dialog.tsx` (help text props)
- **Modify:** `packages/franken-web/src/components/beasts/steps/step-identity.tsx`
- **Modify:** `packages/franken-web/src/components/beasts/steps/step-workflow.tsx`
- **Modify:** `packages/franken-web/src/components/beasts/steps/step-llm-targets.tsx`
- **Modify:** `packages/franken-web/src/components/beasts/steps/step-modules.tsx`
- **Modify:** `packages/franken-web/src/components/beasts/steps/step-skills.tsx`
- **Modify:** `packages/franken-web/src/components/beasts/steps/step-prompts.tsx`
- **Modify:** `packages/franken-web/src/components/beasts/steps/step-git.tsx`
- **Modify:** `packages/franken-web/src/components/beasts/steps/step-review.tsx` (add "what happens next" blurb)

---

## Context

Read these files before starting:

- `packages/franken-orchestrator/src/cli/args.ts` — 350 lines. `VALID_BEAST_ACTIONS` and parsing. Currently no `description` or `examples` metadata per action.
- `packages/franken-web/src/components/beasts/wizard-dialog.tsx` — 185 lines. Step rendering logic.
- `packages/franken-web/src/components/beasts/steps/step-*.tsx` — all step files (see Context section of Chunk 01 for line counts)
- `packages/franken-web/src/components/beasts/steps/step-review.tsx` — 121 lines. `handleLaunch()` and summary rendering.

---

## Tasks

### Task 1: CLI --help text for beast subcommands

- [ ] **Step 1: Add help text metadata to args.ts**

In `packages/franken-orchestrator/src/cli/args.ts`, add a `BEAST_ACTION_HELP` map:

```typescript
export const BEAST_ACTION_HELP: Record<string, { description: string; usage: string; examples?: string[] }> = {
  list: {
    description: 'List all tracked agents',
    usage: 'frankenbeast beasts list [--status running|stopped|failed|completed] [--json]',
    examples: [
      'frankenbeast beasts list',
      'frankenbeast beasts list --status running',
      'frankenbeast beasts list --json',
    ],
  },
  status: {
    description: 'Show detailed status of an agent',
    usage: 'frankenbeast beasts status <agent-id>',
    examples: ['frankenbeast beasts status agent_a1'],
  },
  spawn: {
    description: 'Create and start a new agent from a beast definition',
    usage: 'frankenbeast beasts spawn <definition-id> [--params key=value ...] [--interactive]',
    examples: [
      'frankenbeast beasts spawn martin-loop --interactive',
      'frankenbeast beasts spawn martin-loop --params provider=claude --params chunkDirectory=./plan-foo/',
      'frankenbeast beasts spawn chunk-plan --params docPath=./design.md',
    ],
  },
  stop: {
    description: 'Gracefully stop a running agent (SIGTERM)',
    usage: 'frankenbeast beasts stop <agent-id> [--force]',
    examples: [
      'frankenbeast beasts stop agent_a1',
      'frankenbeast beasts stop agent_a1 --force',
    ],
  },
  kill: {
    description: 'Immediately kill a running agent (SIGKILL)',
    usage: 'frankenbeast beasts kill <agent-id>',
  },
  restart: {
    description: 'Restart an agent (creates a new run attempt)',
    usage: 'frankenbeast beasts restart <agent-id>',
  },
  logs: {
    description: 'Show log output for an agent',
    usage: 'frankenbeast beasts logs <agent-id> [--follow] [--tail N]',
    examples: [
      'frankenbeast beasts logs agent_a1',
      'frankenbeast beasts logs agent_a1 --tail 50',
      'frankenbeast beasts logs agent_a1 --follow',
    ],
  },
  delete: {
    description: 'Delete a stopped agent and clean up its worktree',
    usage: 'frankenbeast beasts delete <agent-id>',
  },
  catalog: {
    description: 'List available beast definitions',
    usage: 'frankenbeast beasts catalog',
  },
};
```

- [ ] **Step 2: Wire --help output into beast-cli.ts**

In `packages/franken-orchestrator/src/cli/beast-cli.ts`, at the top of `handleBeastCommand`:

```typescript
if (args.help) {
  if (args.beastAction && BEAST_ACTION_HELP[args.beastAction]) {
    const help = BEAST_ACTION_HELP[args.beastAction];
    output.write(`${help.description}\n\nUsage: ${help.usage}\n`);
    if (help.examples?.length) {
      output.write('\nExamples:\n');
      for (const ex of help.examples) {
        output.write(`  ${ex}\n`);
      }
    }
  } else {
    output.write('frankenbeast beasts <action> [options]\n\nActions:\n');
    for (const [action, help] of Object.entries(BEAST_ACTION_HELP)) {
      output.write(`  ${action.padEnd(12)} ${help.description}\n`);
    }
  }
  return;
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/franken-orchestrator/src/cli/args.ts packages/franken-orchestrator/src/cli/beast-cli.ts
git commit -m "feat(orchestrator): add --help text for all beast CLI subcommands"
```

---

### Task 2: Create user-facing guide document

- [ ] **Step 1: Create the guide**

Create `docs/guides/launch-and-manage-agents.md`:

```markdown
# Launch and Manage Agents

This guide covers launching AI agents from both the CLI and dashboard, monitoring their progress, and managing their lifecycle.

## Starting the Beast Daemon

Agents run under the **beast daemon**, a standalone process that manages spawning, supervision, and state.

**Explicit start:**
```bash
frankenbeast beasts-daemon
# or via network:
frankenbeast network up
```

**Lazy start:** The daemon starts automatically when you run any `beasts` command or create an agent from the dashboard.

## Launching from the CLI

### Quick start with --params
```bash
frankenbeast beasts spawn martin-loop \
  --params provider=claude \
  --params chunkDirectory=./plan-foo/
```

### Interactive mode
```bash
frankenbeast beasts spawn martin-loop --interactive
```
Walks through each configuration field in your terminal.

### From the dashboard wizard
1. Open the Beasts panel in the dashboard
2. Click "New Agent"
3. Walk through the 7-step wizard (identity, workflow, LLM, modules, skills, prompts, git)
4. Review and launch

## Monitoring Agents

### CLI
```bash
# List all agents
frankenbeast beasts list

# Filter by status
frankenbeast beasts list --status running

# Detailed agent status
frankenbeast beasts status agent_a1

# Follow logs in real-time
frankenbeast beasts logs agent_a1 --follow

# Last 50 log lines
frankenbeast beasts logs agent_a1 --tail 50
```

### Dashboard
The agent detail panel shows:
- Current status and run information
- LLM configuration (default + overrides)
- Enabled modules with deep config
- Selected skills
- Prompt frontloading
- Git workflow settings

Status updates arrive in real-time via SSE — no manual refresh needed.

## Stopping, Restarting, Deleting

```bash
# Graceful stop (SIGTERM, waits for cleanup)
frankenbeast beasts stop agent_a1

# Force stop (SIGKILL)
frankenbeast beasts stop agent_a1 --force
# or:
frankenbeast beasts kill agent_a1

# Restart (creates a new run attempt)
frankenbeast beasts restart agent_a1

# Delete agent and clean up worktree
frankenbeast beasts delete agent_a1
```

## Multi-Agent Concurrency

Multiple agents can run simultaneously (default limit: 5). Each agent gets its own git worktree for isolation.

```bash
# Check current agents
frankenbeast beasts list --status running

# Adjust limit in .frankenbeast/config.json:
# { "beasts": { "maxConcurrentAgents": 10 } }
```

## Troubleshooting

**Daemon not running:**
```bash
# Check if daemon is alive
curl http://localhost:4050/v1/beasts/health

# Start manually
frankenbeast beasts-daemon
```

**Stale processes:** The daemon scans for stale processes on startup and every 30 seconds. If an agent's process died without cleanup, it will be detected and marked as failed.

**Config errors:** If the wizard config doesn't match the definition's schema, the daemon returns a validation error. Check the agent's error events in the detail panel.
```

- [ ] **Step 2: Commit**

```bash
git add docs/guides/launch-and-manage-agents.md
git commit -m "docs: add launch-and-manage-agents guide"
```

---

### Task 3: Add help text to wizard steps

- [ ] **Step 1: Add helpText prop to each step component**

In `packages/franken-web/src/components/beasts/wizard-dialog.tsx`, define help text per step:

```typescript
const STEP_HELP: Record<number, string> = {
  0: 'Give your agent a name and optional description to identify it in the dashboard.',
  1: 'Choose what this agent will do: design interviews explore ideas, chunk plans build from specs, and martin loops execute plans autonomously.',
  2: 'Configure which LLM provider and model to use. Override per action type (planning, execution, etc.) if needed.',
  3: 'Toggle framework modules on/off. Each module adds a guardrail or capability to the agent pipeline.',
  4: 'Select skills (plugins) the agent can use during execution.',
  5: 'Provide initial context: a system prompt and/or reference files the agent should read before starting.',
  6: 'Configure how the agent manages git: branching strategy, PR creation, merge approach.',
};
```

Pass as prop to each step:

```tsx
<CurrentStep helpText={STEP_HELP[currentStep]} ... />
```

- [ ] **Step 2: Render help text in each step component**

Add to each step component (`step-identity.tsx` through `step-git.tsx`) a help text display below the step title:

```tsx
interface StepProps {
  helpText?: string;
  // ... existing props
}

// In the component render, below the title:
{props.helpText && (
  <p className="text-sm text-muted-foreground mb-4">{props.helpText}</p>
)}
```

- [ ] **Step 3: Add "What happens next?" to StepReview**

In `packages/franken-web/src/components/beasts/steps/step-review.tsx`, add a static informational block:

```tsx
<div className="mt-4 p-3 bg-muted rounded-md text-sm">
  <p className="font-medium">What happens next?</p>
  <p className="mt-1 text-muted-foreground">
    Launching creates a tracked agent and starts execution immediately. You can monitor progress
    in the agent detail panel, view live logs, and stop/restart at any time.
  </p>
</div>
```

- [ ] **Step 4: Verify no regressions**

Run: `npx turbo run typecheck --filter=franken-web && npx turbo run test --filter=franken-web`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-web/src/components/beasts/wizard-dialog.tsx packages/franken-web/src/components/beasts/steps/ docs/guides/launch-and-manage-agents.md
git commit -m "feat(web): add contextual help text to wizard steps and review blurb"
```
