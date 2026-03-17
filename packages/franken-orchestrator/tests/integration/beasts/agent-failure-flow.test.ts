import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BeastLogStore } from '../../../src/beasts/events/beast-log-store.js';
import { ProcessBeastExecutor } from '../../../src/beasts/execution/process-beast-executor.js';
import { ProcessSupervisor } from '../../../src/beasts/execution/process-supervisor.js';
import { SQLiteBeastRepository } from '../../../src/beasts/repository/sqlite-beast-repository.js';
import { BeastRunService } from '../../../src/beasts/services/beast-run-service.js';
import { BeastCatalogService } from '../../../src/beasts/services/beast-catalog-service.js';
import type { BeastDefinition } from '../../../src/beasts/types.js';
import type { BeastExecutors } from '../../../src/beasts/services/beast-dispatch-service.js';
import type { BeastMetrics } from '../../../src/beasts/telemetry/beast-metrics.js';
import { z } from 'zod';

function createFailingDefinition(): BeastDefinition {
  return {
    id: 'test-failing-process',
    version: 1,
    label: 'Test Failing Process',
    description: 'A beast definition that spawns a process that fails',
    executionModeDefault: 'process',
    configSchema: z.object({}).passthrough(),
    interviewPrompts: [],
    buildProcessSpec: () => ({
      command: process.execPath,
      args: ['-e', "console.error('boom'); console.error('stack trace here'); process.exit(1)"],
    }),
    telemetryLabels: { definition_id: 'test-failing-process' },
  };
}

describe('Agent Failure Flow (integration)', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('captures stderr, sets failed status, and records agent events for a crashing process', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-agent-failure-'));
    const repo = new SQLiteBeastRepository(join(workDir, 'beasts.db'));
    const logs = new BeastLogStore(join(workDir, 'logs'));
    const catalog = new BeastCatalogService();
    const supervisor = new ProcessSupervisor();
    const definition = createFailingDefinition();

    const mockMetrics = {
      recordRunStarted: vi.fn(),
      recordRunCompleted: vi.fn(),
      recordRunFailed: vi.fn(),
      recordRunStopped: vi.fn(),
    } as unknown as BeastMetrics;

    // Create tracked agent
    const now = new Date().toISOString();
    const agent = repo.createTrackedAgent({
      definitionId: definition.id,
      source: 'cli',
      status: 'dispatching',
      createdByUser: 'test-user',
      initAction: { kind: 'martin-loop', command: 'test-fail', config: {} },
      initConfig: {},
      createdAt: now,
      updatedAt: now,
    });

    // Create run linked to tracked agent
    const run = repo.createRun({
      trackedAgentId: agent.id,
      definitionId: definition.id,
      definitionVersion: definition.version,
      executionMode: 'process',
      configSnapshot: {},
      dispatchedBy: 'cli',
      dispatchedByUser: 'test-user',
      createdAt: now,
    });

    // Create service and executor wired together
    const mockExecutors = {
      process: { start: vi.fn(), stop: vi.fn(), kill: vi.fn() },
      container: { start: vi.fn(), stop: vi.fn(), kill: vi.fn() },
    } as unknown as BeastExecutors;
    const service = new BeastRunService(repo, catalog, mockExecutors, mockMetrics, logs);

    const executor = new ProcessBeastExecutor(
      repo, logs, supervisor,
      { onRunStatusChange: (runId: string) => service.notifyRunStatusChange(runId) },
    );

    // Start the process -- it will crash immediately
    await executor.start(run, definition);

    // Wait for the process to exit and events to propagate
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verify: run status is failed
    const updatedRun = repo.getRun(run.id);
    expect(updatedRun!.status).toBe('failed');
    expect(updatedRun!.latestExitCode).toBe(1);

    // Verify: attempt.failed event exists with lastStderrLines containing 'boom'
    const events = repo.listEvents(run.id);
    const failEvent = events.find((e) => e.type === 'attempt.failed');
    expect(failEvent).toBeDefined();
    const stderrLines = failEvent!.payload.lastStderrLines as string[];
    expect(stderrLines.some((line) => line.includes('boom'))).toBe(true);

    // Verify: logs contain stderr lines
    const attempt = repo.listAttempts(run.id)[0];
    const logLines = await logs.read(run.id, attempt.id);
    expect(logLines.some((line) => line.includes('boom'))).toBe(true);

    // Verify: agent-level event was appended
    const agentEvents = repo.listTrackedAgentEvents(agent.id);
    const agentFailEvent = agentEvents.find((e) => e.type === 'agent.run.failed');
    expect(agentFailEvent).toBeDefined();
    expect(agentFailEvent!.level).toBe('error');
    expect(agentFailEvent!.payload).toMatchObject({
      runId: run.id,
      exitCode: 1,
    });
  }, 10000);
});
