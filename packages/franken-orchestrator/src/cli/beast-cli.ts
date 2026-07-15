import type { CliArgs } from './args.js';
import type { InterviewIO } from '../planning/interview-loop.js';
import { createBeastServices } from '../beasts/create-beast-services.js';
import { UnknownBeastRunError } from '../beasts/services/beast-run-service.js';
import { collectBeastConfig } from './beast-prompts.js';
import type { ProjectPaths } from './project-root.js';
import { createBeastControlClient } from './beast-control-client.js';
import type { BeastExecutionMode, BeastRun, BeastRunAttempt } from '../beasts/types.js';
import { spawnSync } from 'node:child_process';

type BeastControlClient = Omit<ReturnType<typeof createBeastControlClient>, 'dispose'> & {
  dispose?: () => void;
};

const liveRunStatuses = new Set<BeastRun['status']>([
  'queued',
  'interviewing',
  'running',
  'pending_approval',
]);

function shouldKeepServicesAliveForRun(run: Pick<BeastRun, 'status' | 'currentAttemptId'>): boolean {
  return Boolean(run.currentAttemptId && liveRunStatuses.has(run.status));
}

function assertContainerRuntimeAvailable(): void {
  const result = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.error || result.status !== 0) {
    const detail = result.error?.message ?? result.stderr?.trim() ?? 'docker version failed';
    throw new Error(`Container Beast execution requires a working Docker runtime. Install/start Docker and retry, or use --mode process. Details: ${detail}`);
  }
}

function latestAttempt(run: BeastRun, attempts: readonly BeastRunAttempt[]): BeastRunAttempt | undefined {
  return attempts.find((attempt) => attempt.id === run.currentAttemptId)
    ?? [...attempts].sort((left, right) => right.attemptNumber - left.attemptNumber)[0];
}

function pickContainerMetadata(metadata: Readonly<Record<string, unknown>> | undefined): Readonly<Record<string, unknown>> | undefined {
  if (!metadata) {
    return undefined;
  }
  const entries = Object.entries(metadata).filter(([key]) => (
    key === 'containerId'
    || key === 'containerName'
    || key === 'image'
    || key === 'resourceSnapshot'
    || key === 'resources'
  ));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function statusPayload(run: BeastRun, attempts: readonly BeastRunAttempt[]) {
  const currentAttempt = latestAttempt(run, attempts);
  const containerMetadata = run.executionMode === 'container'
    ? pickContainerMetadata(currentAttempt?.executorMetadata)
    : undefined;
  return {
    ...run,
    ...(currentAttempt ? { currentAttempt } : {}),
    ...(containerMetadata
      ? { container: containerMetadata }
      : {}),
  };
}

function containerLogHeader(run: BeastRun, attempts: readonly BeastRunAttempt[]): string[] {
  if (run.executionMode !== 'container') {
    return [];
  }
  const metadata = pickContainerMetadata(latestAttempt(run, attempts)?.executorMetadata);
  if (!metadata) {
    return [`# Beast container run ${run.id}`, '# Container metadata: unavailable'];
  }
  return [
    `# Beast container run ${run.id}`,
    `# Container metadata: ${JSON.stringify(metadata)}`,
  ];
}

interface BeastCommandDeps {
  args: CliArgs;
  io: InterviewIO;
  paths: ProjectPaths;
  print(message: string): void;
  control?: BeastControlClient;
}

export async function handleBeastCommand(deps: BeastCommandDeps): Promise<void> {
  const { args, io, paths, print } = deps;
  const services = createBeastServices(paths);
  let control = deps.control;
  let ownsControl = false;
  const getControl = (): BeastControlClient => {
    if (!control) {
      control = createBeastControlClient(paths, services);
      ownsControl = true;
    }
    const activeControl = control;
    return activeControl;
  };
  const actor = process.env.USER ?? 'operator';
  let keepServicesAlive = false;
  let liveRunId: string | undefined;
  let signalCleanupStarted = false;
  const exitCodeForSignal = (signal: NodeJS.Signals): number => {
    if (signal === 'SIGINT') return 130;
    if (signal === 'SIGHUP') return 129;
    return 143;
  };
  const disposeForSignal = (signal: NodeJS.Signals): void => {
    if (signalCleanupStarted) {
      return;
    }
    signalCleanupStarted = true;
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
    process.off('SIGHUP', onSighup);
    Promise.resolve(liveRunId ? services.runs.kill(liveRunId, actor) : undefined)
      .catch(() => undefined)
      .finally(() => {
        try {
          services.dispose();
        } finally {
          if (ownsControl) {
            control?.dispose?.();
          }
          process.exit(exitCodeForSignal(signal));
        }
      });
  };
  const onSigint = (): void => disposeForSignal('SIGINT');
  const onSigterm = (): void => disposeForSignal('SIGTERM');
  const onSighup = (): void => disposeForSignal('SIGHUP');
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);
  process.once('SIGHUP', onSighup);

  try {
    switch (args.beastAction) {
      case 'catalog': {
        const catalog = services.catalog.listDefinitions()
          .map((definition) => `${definition.id}: ${definition.description}`)
          .join('\n');
        print(catalog);
        return;
      }
      case 'create':
      case 'spawn': {
        if (!args.beastTarget) {
          throw new Error('beasts spawn requires a definition id');
        }
        const definition = services.catalog.getDefinition(args.beastTarget);
        if (!definition) {
          throw new Error(`Unknown Beast definition: ${args.beastTarget}`);
        }
        const executionMode: BeastExecutionMode = args.beastExecutionMode ?? 'process';
        if (executionMode === 'container') {
          assertContainerRuntimeAvailable();
        }
        const config = await collectBeastConfig(io, definition);
        const run = await services.dispatch.createRun({
          definitionId: definition.id,
          config,
          dispatchedBy: 'cli',
          dispatchedByUser: actor,
          executionMode,
          startNow: true,
          onRunCreated: (createdRun) => {
            liveRunId = createdRun.id;
          },
          ...(args.moduleConfig ? { moduleConfig: args.moduleConfig } : {}),
        });
        keepServicesAlive = shouldKeepServicesAliveForRun(run);
        liveRunId = keepServicesAlive ? run.id : undefined;
        print(`Spawned ${run.definitionId} as ${run.id}`);
        return;
      }
      case 'list': {
        const runs = services.runs.listRuns();
        print(JSON.stringify(runs, null, 2));
        return;
      }
      case 'status': {
        if (!args.beastTarget) {
          throw new Error('beasts status requires a run id');
        }
        const run = services.runs.getRun(args.beastTarget);
        if (!run) {
          throw new UnknownBeastRunError(args.beastTarget);
        }
        const attempts = services.runs.listAttempts(args.beastTarget);
        print(JSON.stringify(statusPayload(run, attempts), null, 2));
        return;
      }
      case 'logs': {
        if (!args.beastTarget) {
          throw new Error('beasts logs requires a run id');
        }
        const run = services.runs.getRun(args.beastTarget);
        const header = run ? containerLogHeader(run, services.runs.listAttempts(args.beastTarget)) : [];
        const logs = await services.runs.readLogs(args.beastTarget);
        print([...header, ...logs].join('\n'));
        return;
      }
      case 'stop': {
        if (!args.beastTarget) {
          throw new Error('beasts stop requires a run id');
        }
        const run = await services.runs.stop(args.beastTarget, actor);
        print(`Stopped ${run.id}`);
        return;
      }
      case 'kill': {
        if (!args.beastTarget) {
          throw new Error('beasts kill requires a run id');
        }
        const run = await services.runs.kill(args.beastTarget, actor);
        print(`Killed ${run.id}`);
        return;
      }
      case 'restart': {
        if (!args.beastTarget) {
          throw new Error('beasts restart requires a run id');
        }
        liveRunId = args.beastTarget;
        const run = await services.runs.restart(args.beastTarget, actor);
        keepServicesAlive = shouldKeepServicesAliveForRun(run);
        liveRunId = keepServicesAlive ? run.id : undefined;
        print(`Restarted ${run.id}`);
        return;
      }
      case 'resume': {
        if (!args.beastTarget) throw new Error('beasts resume requires an agent id');
        const run = await getControl().resumeAgent(args.beastTarget, actor);
        keepServicesAlive = shouldKeepServicesAliveForRun(run);
        liveRunId = keepServicesAlive ? run.id : undefined;
        print(`Resumed ${run.id}`);
        return;
      }
      case 'delete': {
        if (!args.beastTarget) throw new Error('beasts delete requires an agent id');
        await getControl().deleteAgent(args.beastTarget);
        print(`Deleted ${args.beastTarget}`);
        return;
      }
      default:
        throw new Error('Unknown beasts command');
    }
  } finally {
    if (!keepServicesAlive) {
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
      process.off('SIGHUP', onSighup);
      services.dispose();
    }
    if (ownsControl && !keepServicesAlive) {
      control?.dispose?.();
    }
  }
}
