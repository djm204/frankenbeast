# Chunk 05: CLI Subcommands — Full Beast Management via DaemonClient

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `beast-cli.ts` to use `DaemonClient` for all operations, add new subcommands (`list`, `status`, `stop`, `kill`, `restart`, `logs`, `delete`, `spawn`), and shift from run-oriented to agent-oriented CLI.

**Spec section:** Plan 2, Section 3

---

## Pre-conditions

- Chunk 03 complete (`DaemonClient` with agent CRUD + run/log methods)
- Chunk 04 complete (beast/agent routes mounted in daemon, chat-server decoupled)

---

## Files

- **Modify:** `packages/franken-orchestrator/src/cli/args.ts` (new `BeastAction` values + flags)
- **Modify:** `packages/franken-orchestrator/src/cli/beast-cli.ts` (rewrite to use DaemonClient, agent-oriented)
- **Test:** `packages/franken-orchestrator/tests/unit/cli/beast-cli.test.ts` (rewrite)
- **Test:** `packages/franken-orchestrator/tests/unit/cli/args-beasts.test.ts`

---

## Context

Read these files before starting:

- `packages/franken-orchestrator/src/cli/beast-cli.ts` — 96 lines, current `handleBeastCommand()` using direct service calls
- `packages/franken-orchestrator/src/cli/args.ts` — 350 lines, `VALID_BEAST_ACTIONS` at line 80: `'catalog'`, `'spawn'`, `'list'`, `'status'`, `'logs'`, `'stop'`, `'kill'`, `'restart'`
- `packages/franken-orchestrator/src/daemon/daemon-client.ts` — DaemonClient from Chunk 03

---

## Current State

`handleBeastCommand()` in `beast-cli.ts` (96 lines):
- Dispatch switch on `args.beastAction` (line 19)
- Uses `services.dispatch.createRun()` for spawn (line 36)
- Uses `services.runs.*` for logs, stop, kill, restart
- All operations are **run-oriented** — `beastTarget` resolves to run IDs
- No `--json` flag, no `--follow` for logs, no `delete`, no `--interactive`, no `--params`

`VALID_BEAST_ACTIONS` already includes: `'catalog'`, `'spawn'`, `'list'`, `'status'`, `'logs'`, `'stop'`, `'kill'`, `'restart'`. Missing: `'delete'`, `'resume'`.

Note: `PATCH /v1/beasts/agents/:id/config` (runtime config updates) is out of scope for this chunk — tracked as a future enhancement.

**Conceptual shift:** All subcommands become **agent-oriented**. Users pass `<agent-id>` (prefixed `agent_*`). The daemon resolves agent → linked run internally.

---

## Tasks

### Task 1: Add `delete` action and new flags to args.ts

- [ ] **Step 1: Write the failing test — delete is a valid beast action**

Create `packages/franken-orchestrator/tests/unit/cli/args-beasts.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseArgs } from '../../../src/cli/args.js';

describe('beasts subcommand args', () => {
  it('parses delete as a valid beast action', () => {
    const args = parseArgs(['beasts', 'delete', 'agent_abc']);
    expect(args.beastAction).toBe('delete');
    expect(args.beastTarget).toBe('agent_abc');
  });

  it('parses resume as a valid beast action', () => {
    const args = parseArgs(['beasts', 'resume', 'agent_abc']);
    expect(args.beastAction).toBe('resume');
    expect(args.beastTarget).toBe('agent_abc');
  });

  it('parses --json flag', () => {
    const args = parseArgs(['beasts', 'list', '--json']);
    expect(args.beastAction).toBe('list');
    expect(args.json).toBe(true);
  });

  it('parses --follow flag for logs', () => {
    const args = parseArgs(['beasts', 'logs', 'agent_abc', '--follow']);
    expect(args.beastAction).toBe('logs');
    expect(args.follow).toBe(true);
  });

  it('parses --tail flag for logs', () => {
    const args = parseArgs(['beasts', 'logs', 'agent_abc', '--tail', '50']);
    expect(args.tail).toBe(50);
  });

  it('parses --force flag for stop', () => {
    const args = parseArgs(['beasts', 'stop', 'agent_abc', '--force']);
    expect(args.force).toBe(true);
  });

  it('parses --status filter for list', () => {
    const args = parseArgs(['beasts', 'list', '--status', 'running']);
    expect(args.statusFilter).toBe('running');
  });

  it('parses --params as multiple key=value pairs', () => {
    const args = parseArgs(['beasts', 'spawn', 'martin-loop', '--params', 'provider=claude', '--params', 'chunkDirectory=./plan/']);
    expect(args.params).toEqual(['provider=claude', 'chunkDirectory=./plan/']);
  });

  it('parses --interactive flag', () => {
    const args = parseArgs(['beasts', 'spawn', 'martin-loop', '--interactive']);
    expect(args.interactive).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/cli/args-beasts.test.ts --reporter=verbose`
Expected: FAIL — new flags not defined

- [ ] **Step 3: Add new flags and actions to args.ts**

In `packages/franken-orchestrator/src/cli/args.ts`:

1. Add `'delete'` and `'resume'` to `VALID_BEAST_ACTIONS`
2. Add to `CliArgs` interface:
   ```typescript
   json?: boolean;
   follow?: boolean;
   tail?: number;
   force?: boolean;
   statusFilter?: string;
   params?: string[];
   interactive?: boolean;
   ```
3. Add flag parsing in the `parseArgs()` function for these new flags. `--params` uses `multiple: true` in the arg definition.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/cli/args-beasts.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/cli/args.ts packages/franken-orchestrator/tests/unit/cli/args-beasts.test.ts
git commit -m "feat(orchestrator): add delete action, --json, --follow, --params flags to beast CLI args"
```

---

### Task 2: Rewrite handleBeastCommand to use DaemonClient

- [ ] **Step 1: Write the failing tests — agent-oriented CLI commands**

Create `packages/franken-orchestrator/tests/unit/cli/beast-cli.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleBeastCommand } from '../../../src/cli/beast-cli.js';

describe('handleBeastCommand (DaemonClient)', () => {
  let mockClient: Record<string, ReturnType<typeof vi.fn>>;
  let mockOutput: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockClient = {
      listAgents: vi.fn().mockResolvedValue([
        { id: 'agent_a1', status: 'running', definitionId: 'martin-loop', createdAt: '2026-03-16T14:02:00Z' },
      ]),
      getAgent: vi.fn().mockResolvedValue({
        id: 'agent_a1',
        status: 'running',
        definitionId: 'martin-loop',
        dispatchRunId: 'run_1',
      }),
      stopAgent: vi.fn().mockResolvedValue(undefined),
      killAgent: vi.fn().mockResolvedValue(undefined),
      restartAgent: vi.fn().mockResolvedValue(undefined),
      resumeAgent: vi.fn().mockResolvedValue(undefined),
      deleteAgent: vi.fn().mockResolvedValue(undefined),
      createAgent: vi.fn().mockResolvedValue({ id: 'agent_new' }),
      getLogs: vi.fn().mockResolvedValue(['log line 1', 'log line 2']),
    };
    mockOutput = vi.fn();
  });

  it('list calls listAgents and prints tabular output', async () => {
    await handleBeastCommand(
      { subcommand: 'beasts', beastAction: 'list' } as any,
      mockClient as any,
      { write: mockOutput },
    );
    expect(mockClient.listAgents).toHaveBeenCalled();
    expect(mockOutput).toHaveBeenCalled();
  });

  it('list --json outputs JSON', async () => {
    await handleBeastCommand(
      { subcommand: 'beasts', beastAction: 'list', json: true } as any,
      mockClient as any,
      { write: mockOutput },
    );
    const output = mockOutput.mock.calls.map((c: unknown[]) => c[0]).join('');
    expect(() => JSON.parse(output.trim())).not.toThrow();
  });

  it('list --status filters by status', async () => {
    await handleBeastCommand(
      { subcommand: 'beasts', beastAction: 'list', statusFilter: 'running' } as any,
      mockClient as any,
      { write: mockOutput },
    );
    expect(mockClient.listAgents).toHaveBeenCalledWith({ status: 'running' });
  });

  it('status calls getAgent with agent ID', async () => {
    await handleBeastCommand(
      { subcommand: 'beasts', beastAction: 'status', beastTarget: 'agent_a1' } as any,
      mockClient as any,
      { write: mockOutput },
    );
    expect(mockClient.getAgent).toHaveBeenCalledWith('agent_a1');
  });

  it('stop calls stopAgent', async () => {
    await handleBeastCommand(
      { subcommand: 'beasts', beastAction: 'stop', beastTarget: 'agent_a1' } as any,
      mockClient as any,
      { write: mockOutput },
    );
    expect(mockClient.stopAgent).toHaveBeenCalledWith('agent_a1');
  });

  it('stop --force calls killAgent', async () => {
    await handleBeastCommand(
      { subcommand: 'beasts', beastAction: 'stop', beastTarget: 'agent_a1', force: true } as any,
      mockClient as any,
      { write: mockOutput },
    );
    expect(mockClient.killAgent).toHaveBeenCalledWith('agent_a1');
  });

  it('kill calls killAgent', async () => {
    await handleBeastCommand(
      { subcommand: 'beasts', beastAction: 'kill', beastTarget: 'agent_a1' } as any,
      mockClient as any,
      { write: mockOutput },
    );
    expect(mockClient.killAgent).toHaveBeenCalledWith('agent_a1');
  });

  it('restart calls restartAgent', async () => {
    await handleBeastCommand(
      { subcommand: 'beasts', beastAction: 'restart', beastTarget: 'agent_a1' } as any,
      mockClient as any,
      { write: mockOutput },
    );
    expect(mockClient.restartAgent).toHaveBeenCalledWith('agent_a1');
  });

  it('resume calls resumeAgent', async () => {
    await handleBeastCommand(
      { subcommand: 'beasts', beastAction: 'resume', beastTarget: 'agent_a1' } as any,
      mockClient as any,
      { write: mockOutput },
    );
    expect(mockClient.resumeAgent).toHaveBeenCalledWith('agent_a1');
  });

  it('delete calls deleteAgent', async () => {
    await handleBeastCommand(
      { subcommand: 'beasts', beastAction: 'delete', beastTarget: 'agent_a1' } as any,
      mockClient as any,
      { write: mockOutput },
    );
    expect(mockClient.deleteAgent).toHaveBeenCalledWith('agent_a1');
  });

  it('logs calls getLogs and prints lines', async () => {
    await handleBeastCommand(
      { subcommand: 'beasts', beastAction: 'logs', beastTarget: 'agent_a1' } as any,
      mockClient as any,
      { write: mockOutput },
    );
    expect(mockClient.getAgent).toHaveBeenCalledWith('agent_a1');
    expect(mockClient.getLogs).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/cli/beast-cli.test.ts --reporter=verbose`
Expected: FAIL — `handleBeastCommand` signature changed

- [ ] **Step 3: Rewrite beast-cli.ts**

Note: The current `beast-cli.ts` imports `createBeastServices`, `collectBeastConfig`, and direct service types. The rewrite removes ALL of these — the new file imports only `CliArgs` and `DaemonClient`. The old `handleBeastCommand(args, services, paths, config)` signature becomes `handleBeastCommand(args, client, output?)`. Callers in `run.ts` must be updated to match (done in Step 4).

Rewrite `packages/franken-orchestrator/src/cli/beast-cli.ts`:

```typescript
import type { CliArgs } from './args.js';
import type { DaemonClient } from '../daemon/daemon-client.js';

interface OutputWriter {
  write(text: string): void;
}

export async function handleBeastCommand(
  args: CliArgs,
  client: DaemonClient,
  output: OutputWriter = { write: (t) => process.stdout.write(t) },
): Promise<void> {
  switch (args.beastAction) {
    case 'list': {
      const agents = await client.listAgents(
        args.statusFilter ? { status: args.statusFilter } : undefined,
      );
      if (args.json) {
        output.write(JSON.stringify(agents, null, 2) + '\n');
      } else {
        printAgentTable(agents as any[], output);
      }
      break;
    }

    case 'status': {
      requireTarget(args);
      const agent = await client.getAgent(args.beastTarget!);
      output.write(JSON.stringify(agent, null, 2) + '\n');
      break;
    }

    case 'stop': {
      requireTarget(args);
      if (args.force) {
        await client.killAgent(args.beastTarget!);
        output.write(`Killed agent ${args.beastTarget}\n`);
      } else {
        await client.stopAgent(args.beastTarget!);
        output.write(`Stopped agent ${args.beastTarget}\n`);
      }
      break;
    }

    case 'kill': {
      requireTarget(args);
      await client.killAgent(args.beastTarget!);
      output.write(`Killed agent ${args.beastTarget}\n`);
      break;
    }

    case 'restart': {
      requireTarget(args);
      await client.restartAgent(args.beastTarget!);
      output.write(`Restarted agent ${args.beastTarget}\n`);
      break;
    }

    case 'resume': {
      requireTarget(args);
      await client.resumeAgent(args.beastTarget!);
      output.write(`Resumed agent ${args.beastTarget}\n`);
      break;
    }

    case 'delete': {
      requireTarget(args);
      await client.deleteAgent(args.beastTarget!);
      output.write(`Deleted agent ${args.beastTarget}\n`);
      break;
    }

    case 'logs': {
      requireTarget(args);
      const agent = await client.getAgent(args.beastTarget!) as any;
      if (!agent.dispatchRunId) {
        output.write('Agent has no active run\n');
        break;
      }
      const logs = await client.getLogs(agent.dispatchRunId);
      const tail = args.tail ?? logs.length;
      const lines = logs.slice(-tail);
      for (const line of lines) {
        output.write(line + '\n');
      }
      // --follow: connect to SSE stream (requires Plan 1 Chunk 06 SSE endpoint)
      // For now, logs are one-shot. Follow is wired in Plan 3 or as a follow-up.
      break;
    }

    case 'spawn': {
      requireTarget(args); // target is definitionId
      const config = parseParams(args.params ?? []);
      const agent = await client.createAgent({
        definitionId: args.beastTarget!,
        initAction: { kind: args.beastTarget! as any, command: '', config },
      });
      output.write(`Created agent ${(agent as any).id}\n`);
      break;
    }

    case 'catalog': {
      const catalog = await client.getCatalog();
      output.write(JSON.stringify(catalog, null, 2) + '\n');
      break;
    }

    default:
      output.write(`Unknown beast action: ${args.beastAction}\n`);
  }
}

function requireTarget(args: CliArgs): void {
  if (!args.beastTarget) {
    throw new Error(`Missing required argument: <agent-id>`);
  }
}

function parseParams(params: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const p of params) {
    const idx = p.indexOf('=');
    if (idx === -1) throw new Error(`Invalid param format: "${p}" (expected key=value)`);
    result[p.slice(0, idx)] = p.slice(idx + 1);
  }
  return result;
}

function printAgentTable(agents: Array<{ id: string; status: string; definitionId: string; createdAt: string }>, output: OutputWriter): void {
  const header = 'ID\t\tSTATUS\t\tDEFINITION\t\tCREATED';
  output.write(header + '\n');
  for (const a of agents) {
    const created = new Date(a.createdAt).toLocaleString();
    output.write(`${a.id}\t${a.status}\t\t${a.definitionId}\t\t${created}\n`);
  }
  if (agents.length === 0) {
    output.write('No agents found\n');
  }
}
```

- [ ] **Step 4: Update run.ts to pass DaemonClient to handleBeastCommand**

In `packages/franken-orchestrator/src/cli/run.ts`, update the `beasts` case:

```typescript
case 'beasts': {
  const { DaemonClient } = await import('../daemon/daemon-client.js');
  const { DaemonLifecycle } = await import('../daemon/daemon-lifecycle.js');

  const daemonPort = config.beasts?.daemon?.port ?? 4050;
  const daemonUrl = `http://localhost:${daemonPort}`;

  // Ensure daemon is running (lazy start)
  const lifecycle = new DaemonLifecycle({
    pidFilePath: join(paths.projectRoot, '.frankenbeast', 'beasts-daemon.pid'),
  });
  await lifecycle.ensureDaemonRunning({
    daemonCommand: process.execPath,
    daemonArgs: [process.argv[1], 'beasts-daemon'],
    healthUrl: `${daemonUrl}/v1/beasts/health`,
    healthTimeoutMs: 10_000,
  });

  const client = new DaemonClient({
    baseUrl: daemonUrl,
    operatorToken: config.operatorToken ?? '',
  });

  const { handleBeastCommand } = await import('./beast-cli.js');
  await handleBeastCommand(args, client);
  return;
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/cli/beast-cli.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/franken-orchestrator/src/cli/beast-cli.ts packages/franken-orchestrator/src/cli/args.ts packages/franken-orchestrator/src/cli/run.ts packages/franken-orchestrator/tests/unit/cli/beast-cli.test.ts
git commit -m "feat(orchestrator): rewrite beast CLI to use DaemonClient, add agent-oriented subcommands"
```
