import type { BeastExecutor, StopOptions } from './beast-executor.js';
import type { BeastDefinition, BeastProcessSpec, BeastRun, BeastRunAttempt } from '../types.js';
import type { BeastLogStore } from '../events/beast-log-store.js';
import type { BeastEventBus } from '../events/beast-event-bus.js';
import type { SQLiteBeastRepository } from '../repository/sqlite-beast-repository.js';
import { ProcessBeastExecutor, type ProcessBeastExecutorOptions } from './process-beast-executor.js';
import { ProcessSupervisor, type ProcessSupervisorLike } from './process-supervisor.js';
import { toDockerSpec } from './docker-container-runtime.js';
import { DEFAULT_SANDBOX_POLICY, type SandboxPolicy } from './sandbox-policy.js';

export interface ContainerBeastExecutorDeps {
  readonly repository: SQLiteBeastRepository;
  readonly logStore: BeastLogStore;
  readonly eventBus?: BeastEventBus | undefined;
  readonly onRunStatusChange?: ProcessBeastExecutorOptions['onRunStatusChange'];
  readonly policy?: SandboxPolicy | undefined;
  readonly supervisorFactory?: () => ProcessSupervisorLike;
}

function containerNameForRun(run: BeastRun): string {
  return `fbeast-${run.id}`.replace(/[^a-zA-Z0-9_.-]/g, '-').slice(0, 128);
}

function containerAttemptMetadata(
  policy: SandboxPolicy,
  run: BeastRun,
  originalSpec: BeastProcessSpec,
  dockerSpec: BeastProcessSpec,
  handle: { pid: number },
): Readonly<Record<string, unknown>> {
  const containerName = containerNameForRun(run);
  const resourceSnapshot = {
    memory: policy.resourceLimits.memory,
    cpus: policy.resourceLimits.cpus,
    pidsLimit: policy.resourceLimits.pidsLimit,
  };
  return {
    backend: 'container',
    containerRuntime: 'docker',
    containerId: containerName,
    containerName,
    image: policy.image,
    containerImage: policy.image,
    containerNetwork: policy.network,
    resourceSnapshot,
    resources: resourceSnapshot,
    workspaceHostPath: policy.workspaceHostPath,
    workspaceContainerPath: policy.workspaceContainerPath,
    supervisorPid: handle.pid,
    command: originalSpec.command,
    args: [...originalSpec.args],
    dockerCommand: dockerSpec.command,
    dockerArgs: [...dockerSpec.args],
  };
}

export class ContainerBeastExecutor implements BeastExecutor {
  private readonly inner: ProcessBeastExecutor;

  constructor(deps: ContainerBeastExecutorDeps) {
    const policy = deps.policy ?? DEFAULT_SANDBOX_POLICY;
    const baseSupervisor = deps.supervisorFactory
      ? deps.supervisorFactory()
      : new ProcessSupervisor({ projectRoot: policy.workspaceHostPath });
    const options: ProcessBeastExecutorOptions = {};
    if (deps.onRunStatusChange) {
      options.onRunStatusChange = deps.onRunStatusChange;
    }
    if (deps.eventBus) {
      options.eventBus = deps.eventBus;
    }
    options.transformSpec = (run, _originalSpec, mergedSpec) => toDockerSpec(mergedSpec, policy, {
      containerName: containerNameForRun(run),
    });
    options.attemptMetadata = (run, originalSpec, dockerSpec, handle) => (
      containerAttemptMetadata(policy, run, originalSpec, dockerSpec, handle)
    );

    this.inner = new ProcessBeastExecutor(
      deps.repository,
      deps.logStore,
      baseSupervisor,
      options,
    );
  }

  start(run: BeastRun, definition: BeastDefinition): Promise<BeastRunAttempt> {
    return this.inner.start(run, definition);
  }

  stop(runId: string, attemptId: string, options?: StopOptions): Promise<BeastRunAttempt> {
    return this.inner.stop(runId, attemptId, options);
  }

  kill(runId: string, attemptId: string): Promise<BeastRunAttempt> {
    return this.inner.kill(runId, attemptId);
  }
}
