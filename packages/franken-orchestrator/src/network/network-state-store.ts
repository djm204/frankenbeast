import { mkdir, readFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { atomicWriteFileSync, quarantineFile } from '../session/atomic-file.js';

export interface ManagedNetworkServiceState {
  id: string;
  pid: number;
  detached?: boolean | undefined;
  dependsOn: string[];
  startedAt: string;
  status?: 'started' | 'already-running';
  inProcess?: boolean | undefined;
  logFile?: string | undefined;
  url?: string | undefined;
  healthUrl?: string | undefined;
  serviceIdentity?: string | undefined;
  hostServiceId?: string | undefined;
  channels?: Record<string, boolean> | undefined;
}

export interface NetworkOperatorState {
  mode: 'secure' | 'insecure';
  secureBackend: string;
  detached: boolean;
  startedAt: string;
  services: ManagedNetworkServiceState[];
}

export interface NetworkStateCorruptionDiagnostic {
  readonly path: string;
  readonly quarantinePath?: string | undefined;
  readonly reason: string;
  readonly repairHint: string;
}

const NETWORK_STATE_REPAIR_HINT =
  'Inspect the quarantined network-state file, recover any still-running services manually, then rerun the network operator to recreate clean state; do not edit live state in place while services are running.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: Record<string, unknown>, field: string, context: string): string {
  const current = value[field];
  if (typeof current !== 'string' || current.length === 0) {
    throw new Error(`${context}.${field} must be a non-empty string`);
  }
  return current;
}

function requireBoolean(value: Record<string, unknown>, field: string, context: string): boolean {
  const current = value[field];
  if (typeof current !== 'boolean') {
    throw new Error(`${context}.${field} must be a boolean`);
  }
  return current;
}

function validateManagedNetworkService(value: unknown, index: number): ManagedNetworkServiceState {
  const context = `network state services[${index}]`;
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object`);
  }

  const id = requireString(value, 'id', context);
  const pid = value.pid;
  if (typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid < 0) {
    throw new Error(`${context}.pid must be a non-negative integer`);
  }
  const dependsOn = value.dependsOn;
  if (!Array.isArray(dependsOn) || dependsOn.some((dependency) => typeof dependency !== 'string')) {
    throw new Error(`${context}.dependsOn must be an array of strings`);
  }
  const status = value.status;
  if (status !== undefined && status !== 'started' && status !== 'already-running') {
    throw new Error(`${context}.status must be "started" or "already-running" when present`);
  }

  const service: ManagedNetworkServiceState = {
    id,
    pid,
    dependsOn,
    startedAt: requireString(value, 'startedAt', context),
  };
  if (typeof value.detached === 'boolean') service.detached = value.detached;
  if (status !== undefined) service.status = status;
  if (typeof value.inProcess === 'boolean') service.inProcess = value.inProcess;
  if (typeof value.logFile === 'string') service.logFile = value.logFile;
  if (typeof value.url === 'string') service.url = value.url;
  if (typeof value.healthUrl === 'string') service.healthUrl = value.healthUrl;
  if (typeof value.serviceIdentity === 'string') service.serviceIdentity = value.serviceIdentity;
  if (typeof value.hostServiceId === 'string') service.hostServiceId = value.hostServiceId;
  if (isRecord(value.channels)) {
    service.channels = Object.fromEntries(
      Object.entries(value.channels).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'),
    );
  }
  return service;
}

function validateNetworkOperatorState(value: unknown): NetworkOperatorState {
  if (!isRecord(value)) {
    throw new Error('network state must be a JSON object');
  }
  if (value.schemaVersion !== undefined && value.schemaVersion !== 1) {
    throw new Error('network state schemaVersion is unsupported; expected version 1');
  }
  if (value.mode !== 'secure' && value.mode !== 'insecure') {
    throw new Error('network state mode must be "secure" or "insecure"');
  }
  const servicesValue = value.services;
  if (!Array.isArray(servicesValue)) {
    throw new Error('network state services must be an array');
  }
  const services = servicesValue.map(validateManagedNetworkService);
  const seenServiceIds = new Set<string>();
  for (const service of services) {
    if (seenServiceIds.has(service.id)) {
      throw new Error(`network state services contains duplicate service id ${JSON.stringify(service.id)}`);
    }
    seenServiceIds.add(service.id);
  }
  return {
    mode: value.mode,
    secureBackend: requireString(value, 'secureBackend', 'network state'),
    detached: requireBoolean(value, 'detached', 'network state'),
    startedAt: requireString(value, 'startedAt', 'network state'),
    services,
  };
}

export class NetworkStateStore {
  private corruption: NetworkStateCorruptionDiagnostic | undefined;

  constructor(private readonly filePath: string) {}

  async load(): Promise<NetworkOperatorState | undefined> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.corruption = undefined;
        return undefined;
      }
      throw error;
    }

    try {
      const state = validateNetworkOperatorState(JSON.parse(raw) as unknown);
      this.corruption = undefined;
      return state;
    } catch (error) {
      this.corruption = this.quarantineCorruptState(error);
      return undefined;
    }
  }

  listCorruptions(): NetworkStateCorruptionDiagnostic[] {
    return this.corruption ? [this.corruption] : [];
  }

  async save(state: NetworkOperatorState): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    atomicWriteFileSync(this.filePath, JSON.stringify(state, null, 2));
  }

  async clear(): Promise<void> {
    await rm(this.filePath, { force: true });
    this.corruption = undefined;
  }

  private quarantineCorruptState(error: unknown): NetworkStateCorruptionDiagnostic {
    const quarantinePath = quarantineFile(this.filePath);
    const reason = error instanceof Error ? error.message : String(error);
    const diagnostic: NetworkStateCorruptionDiagnostic = {
      path: this.filePath,
      ...(quarantinePath === undefined ? {} : { quarantinePath }),
      reason,
      repairHint: NETWORK_STATE_REPAIR_HINT,
    };
    console.warn(
      `[network-state-store] corrupt network state at ${this.filePath}${quarantinePath ? ` quarantined at ${quarantinePath}` : ''}: ${reason}. ${NETWORK_STATE_REPAIR_HINT}`,
    );
    return diagnostic;
  }
}
