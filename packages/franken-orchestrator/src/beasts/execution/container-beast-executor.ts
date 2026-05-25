import type { BeastExecutor, StopOptions } from './beast-executor.js';
import type { BeastDefinition, BeastProcessSpec, BeastRun, BeastRunAttempt } from '../types.js';
import type { BeastLogStore } from '../events/beast-log-store.js';
import type { BeastEventBus } from '../events/beast-event-bus.js';
import type { SQLiteBeastRepository } from '../repository/sqlite-beast-repository.js';
import { ProcessBeastExecutor, type ProcessBeastExecutorOptions } from './process-beast-executor.js';
import { ProcessSupervisor, type ProcessCallbacks, type ProcessSupervisorLike } from './process-supervisor.js';
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

class DockerSupervisor implements ProcessSupervisorLike {
  constructor(
    private readonly inner: ProcessSupervisorLike,
    private readonly policy: SandboxPolicy,
  ) {}

  spawn(spec: BeastProcessSpec, callbacks: ProcessCallbacks) {
    return this.inner.spawn(toDockerSpec(spec, this.policy), callbacks);
  }

  stop(pid: number) {
    return this.inner.stop(pid);
  }

  kill(pid: number) {
    return this.inner.kill(pid);
  }
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

    this.inner = new ProcessBeastExecutor(
      deps.repository,
      deps.logStore,
      new DockerSupervisor(baseSupervisor, policy),
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
