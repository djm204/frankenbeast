import { join, resolve } from 'node:path';
import { BeastEventBus } from './events/beast-event-bus.js';
import { BeastLogStore } from './events/beast-log-store.js';
import { SseConnectionTicketStore } from './events/sse-connection-ticket.js';
import { ContainerBeastExecutor } from './execution/container-beast-executor.js';
import { DEFAULT_SANDBOX_POLICY, nonRootUserForWorkspace } from './execution/sandbox-policy.js';
import { ProcessBeastExecutor } from './execution/process-beast-executor.js';
import { ProcessSupervisor } from './execution/process-supervisor.js';
import { cleanupAbandonedBeastWorktrees } from './execution/git-worktree-isolation.js';
import { SQLiteBeastRepository } from './repository/sqlite-beast-repository.js';
import { BeastCatalogService } from './services/beast-catalog-service.js';
import { BeastDispatchService } from './services/beast-dispatch-service.js';
import { assertDispatcherStartupIntegrity } from './services/dispatcher-startup-integrity.js';
import { reconcileDispatcherQueueAfterRestart } from './services/dispatcher-queue-reconciliation.js';
import { BeastInterviewService } from './services/beast-interview-service.js';
import { AgentService } from './services/agent-service.js';
import { CapacityReservationPolicy, type CapacityReservationRule } from './services/capacity-reservation-policy.js';
import { BeastRunService } from './services/beast-run-service.js';
import { MaintenanceModeService } from './services/maintenance-mode-service.js';
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
  maintenance: MaintenanceModeService;
  eventBus: BeastEventBus;
  ticketStore: SseConnectionTicketStore;
  dispose(): void;
}

export function createBeastServices(paths: BeastServicePaths): BeastServiceBundle {
  const repository = new SQLiteBeastRepository(paths.beastsDb);
  const logStore = new BeastLogStore(paths.beastLogsDir, createBeastLogStoreOptionsFromEnv());
  const projectRoot = resolve(paths.root ?? process.env.FBEAST_ROOT ?? process.cwd());
  const runConfigDir = join(projectRoot, '.fbeast', '.build', 'run-configs');
  const catalog = new BeastCatalogService();
  const metrics = new PrometheusBeastMetrics();
  const eventBus = new BeastEventBus();
  const ticketStore = new SseConnectionTicketStore({ databasePath: paths.beastsDb });
  const capacityPolicy = createCapacityReservationPolicyFromEnv();
  const maintenance = MaintenanceModeService.forProjectRoot(projectRoot);

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

  assertDispatcherStartupIntegrity({
    definitions: catalog.listDefinitions(),
    executors,
  });
  reconcileDispatcherQueueAfterRestart(repository);
  cleanupAbandonedBeastWorktrees({
    agents: repository.listTrackedAgents(),
    dryRun: false,
    projectRoot,
    runs: repository.listRuns(),
  });

  runService = new BeastRunService(repository, catalog, executors, metrics, logStore, { eventBus, capacityPolicy, maintenance });

  return {
    agents: new AgentService(repository, undefined, { capacityPolicy }),
    catalog,
    dispatch: new BeastDispatchService(repository, catalog, executors, metrics, logStore, { eventBus, capacityPolicy, maintenance }),
    runs: runService,
    interviews: new BeastInterviewService(repository, catalog),
    metrics,
    maintenance,
    eventBus,
    ticketStore,
    dispose: () => {
      ticketStore.destroy();
      repository.close();
    },
  };
}

function createBeastLogStoreOptionsFromEnv(): { maxLogFileBytes?: number; maxRotatedLogFiles?: number } {
  const maxLogFileBytes = parsePositiveIntegerEnv('FBEAST_RUN_LOG_MAX_BYTES', process.env.FBEAST_RUN_LOG_MAX_BYTES);
  const maxRotatedLogFiles = parseNonNegativeIntegerEnv(
    'FBEAST_RUN_LOG_MAX_ROTATED_FILES',
    process.env.FBEAST_RUN_LOG_MAX_ROTATED_FILES,
  );
  return {
    ...(maxLogFileBytes === undefined ? {} : { maxLogFileBytes }),
    ...(maxRotatedLogFiles === undefined ? {} : { maxRotatedLogFiles }),
  };
}

function createCapacityReservationPolicyFromEnv(): CapacityReservationPolicy | undefined {
  const totalSlots = parsePositiveInteger(process.env.FBEAST_AGENT_CAPACITY_TOTAL);
  const reservations = parseCapacityReservations(process.env.FBEAST_AGENT_CAPACITY_RESERVATIONS);
  const releasedReservationIds = parseCsv(process.env.FBEAST_AGENT_CAPACITY_RELEASED_RESERVATIONS);
  if (reservations.length > 0 && totalSlots === undefined) {
    throw new RangeError('FBEAST_AGENT_CAPACITY_TOTAL is required when FBEAST_AGENT_CAPACITY_RESERVATIONS is set');
  }
  if (totalSlots === undefined) {
    return undefined;
  }
  return new CapacityReservationPolicy({
    totalSlots,
    reservations,
    releasedReservationIds,
  });
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  return parsePositiveIntegerEnv('FBEAST_AGENT_CAPACITY_TOTAL', value);
}

function parsePositiveIntegerEnv(name: string, value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new RangeError(`${name} must be a positive integer, received ${value}`);
  }
  return parsed;
}

function parseNonNegativeIntegerEnv(name: string, value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new RangeError(`${name} must be a non-negative integer, received ${value}`);
  }
  return parsed;
}

function parseCapacityReservations(value: string | undefined): CapacityReservationRule[] {
  if (!value) return [];
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) {
    throw new RangeError('FBEAST_AGENT_CAPACITY_RESERVATIONS must be a JSON array');
  }
  return parsed.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new RangeError(`FBEAST_AGENT_CAPACITY_RESERVATIONS[${index}] must be an object`);
    }
    return {
      id: requiredString(entry.id, `FBEAST_AGENT_CAPACITY_RESERVATIONS[${index}].id`),
      slots: requiredPositiveInteger(entry.slots, `FBEAST_AGENT_CAPACITY_RESERVATIONS[${index}].slots`),
      labels: optionalStringArray(entry.labels, `FBEAST_AGENT_CAPACITY_RESERVATIONS[${index}].labels`),
      categories: optionalStringArray(entry.categories, `FBEAST_AGENT_CAPACITY_RESERVATIONS[${index}].categories`),
    };
  });
}

function parseCsv(value: string | undefined): string[] {
  return value?.split(',').map((entry) => entry.trim()).filter(Boolean) ?? [];
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new RangeError(`${field} must be a non-empty string`);
  }
  return value;
}

function requiredPositiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${field} must be a positive integer`);
  }
  return value;
}

function optionalStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new RangeError(`${field} must be an array of strings`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
