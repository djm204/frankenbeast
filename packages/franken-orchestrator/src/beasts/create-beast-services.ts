import { join, resolve } from 'node:path';
import { BeastEventBus } from './events/beast-event-bus.js';
import { BeastLogStore } from './events/beast-log-store.js';
import { SseConnectionTicketStore } from './events/sse-connection-ticket.js';
import { ContainerBeastExecutor } from './execution/container-beast-executor.js';
import { DEFAULT_SANDBOX_POLICY, nonRootUserForWorkspace } from './execution/sandbox-policy.js';
import { ProcessBeastExecutor } from './execution/process-beast-executor.js';
import { ProcessSupervisor } from './execution/process-supervisor.js';
import { SQLiteBeastRepository } from './repository/sqlite-beast-repository.js';
import { BeastCatalogService } from './services/beast-catalog-service.js';
import { BeastDispatchService } from './services/beast-dispatch-service.js';
import { BeastInterviewService } from './services/beast-interview-service.js';
import { AgentService } from './services/agent-service.js';
import { BeastRunService } from './services/beast-run-service.js';
import { PrometheusBeastMetrics } from './telemetry/prometheus-beast-metrics.js';

export interface BeastServicePaths {
  beastsDb: string;
  beastLogsDir: string;
  root?: string | undefined;
}

export interface BeastServiceBundle {
  agents: AgentService;
  catalog: BeastCatalogService;
  dispatch: BeastDispatchService;
  runs: BeastRunService;
  interviews: BeastInterviewService;
  metrics: PrometheusBeastMetrics;
  eventBus: BeastEventBus;
  ticketStore: SseConnectionTicketStore;
  dispose(): void;
}

export function createBeastServices(paths: BeastServicePaths): BeastServiceBundle {
  const repository = new SQLiteBeastRepository(paths.beastsDb);
  const logStore = new BeastLogStore(paths.beastLogsDir);
  const projectRoot = resolve(paths.root ?? process.env.FBEAST_ROOT ?? process.cwd());
  const runConfigDir = join(projectRoot, '.fbeast', '.build', 'run-configs');
  const catalog = new BeastCatalogService();
  const metrics = new PrometheusBeastMetrics();
  const eventBus = new BeastEventBus();
  const ticketStore = new SseConnectionTicketStore();

  // Deferred reference to break circular dep: executor → runService → executors → executor
  // eslint-disable-next-line prefer-const
  let runService: BeastRunService;
  const executors = {
    process: new ProcessBeastExecutor(repository, logStore, new ProcessSupervisor({ projectRoot }), {
      onRunStatusChange: (runId: string) => runService.notifyRunStatusChange(runId),
      eventBus,
      runConfigDir,
      runConfigRoot: projectRoot,
      worktreeIsolation: {
        enabled: true,
        projectRoot,
      },
    }),
    container: new ContainerBeastExecutor({
      repository,
      logStore,
      eventBus,
      onRunStatusChange: (runId: string) => runService.notifyRunStatusChange(runId),
      policy: {
        ...DEFAULT_SANDBOX_POLICY,
        workspaceHostPath: projectRoot,
        user: nonRootUserForWorkspace(projectRoot),
      },
    }),
  };

  runService = new BeastRunService(repository, catalog, executors, metrics, logStore, { eventBus });

  return {
    agents: new AgentService(repository),
    catalog,
    dispatch: new BeastDispatchService(repository, catalog, executors, metrics, logStore, { eventBus }),
    runs: runService,
    interviews: new BeastInterviewService(repository, catalog),
    metrics,
    eventBus,
    ticketStore,
    dispose: () => {
      ticketStore.destroy();
      repository.close();
    },
  };
}
