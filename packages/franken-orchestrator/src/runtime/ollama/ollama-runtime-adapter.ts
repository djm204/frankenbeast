import type {
  RuntimeAdapter,
  RuntimeEventRequest,
  RuntimeSnapshotRequest,
} from '../runtime-adapter.js';
import { RuntimeCursorError } from '../runtime-adapter.js';
import {
  RuntimeEventPageSchema,
  RuntimeActionResultSchema,
  RuntimeProviderSchema,
  RuntimeSnapshotSchema,
  type RuntimeActionRequest,
  type RuntimeActionResult,
  type RuntimeEventPage,
  type RuntimeProvider,
  type RuntimeSnapshot,
  type RuntimeWorkspace,
} from '../runtime-schemas.js';
import {
  createEgressGuardedFetch,
  EgressPolicyViolation,
  type EgressAuditSink,
  type EgressOverride,
  type EgressPolicyConfig,
} from '../../network/egress-policy.js';

export interface OllamaEndpointConfig {
  id: string;
  baseUrl: string;
  apiKeyEnv?: string | undefined;
}

export interface OllamaRuntimeAdapterOptions {
  endpoints?: readonly OllamaEndpointConfig[] | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  now?: (() => Date) | undefined;
  minimumPollIntervalMs?: number | undefined;
  requestTimeoutMs?: number | undefined;
  maxResponseBytes?: number | undefined;
  egressPolicy?: EgressPolicyConfig | undefined;
  egressPolicyProvider?: (() => EgressPolicyConfig | undefined) | undefined;
  egressOverride?: EgressOverride | undefined;
  egressAudit?: EgressAuditSink | undefined;
  fetchImpl?: typeof fetch | undefined;
}

interface OllamaModel {
  name: string;
  size: number;
  sizeVram: number;
  expiresAt?: string | undefined;
}

interface EndpointInspection {
  config: OllamaEndpointConfig;
  version?: string | undefined;
  installedModels: OllamaModel[];
  loadedModels: OllamaModel[];
  error?: string | undefined;
}

const UNCONFIGURED_REASON = 'Ollama endpoint is not configured; set OLLAMA_HOST or pass an endpoint';
const UNSUPPORTED_REASON = 'Ollama does not expose a canonical upstream source for this data';
const MAX_ENDPOINTS = 32;

class OllamaEndpointError extends Error {}

function boundedInteger(name: string, value: number | undefined, fallback: number, min: number, max: number): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < min || resolved > max) {
    throw new RangeError(`${name} must be an integer between ${min} and ${max}`);
  }
  return resolved;
}

function modelList(value: unknown, includeVram: boolean): OllamaModel[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { models?: unknown }).models)) return [];
  return (value as { models: unknown[] }).models.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as Record<string, unknown>;
    const name = typeof row['name'] === 'string' && row['name'].trim().length > 0
      ? row['name'].trim()
      : typeof row['model'] === 'string' ? row['model'].trim() : '';
    if (!name) return [];
    const expiresAt = typeof row['expires_at'] === 'string' && !Number.isNaN(Date.parse(row['expires_at']))
      ? new Date(row['expires_at']).toISOString()
      : undefined;
    return [{
      name,
      size: typeof row['size'] === 'number' && Number.isSafeInteger(row['size']) && row['size'] >= 0 ? row['size'] : 0,
      sizeVram: includeVram && typeof row['size_vram'] === 'number'
        && Number.isSafeInteger(row['size_vram']) && row['size_vram'] >= 0
        ? row['size_vram']
        : 0,
      ...(expiresAt ? { expiresAt } : {}),
    }];
  });
}

function hasValidModelEntries(value: unknown): boolean {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { models?: unknown }).models)) return false;
  return (value as { models: unknown[] }).models.every((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const row = entry as Record<string, unknown>;
    return (typeof row['name'] === 'string' && row['name'].trim().length > 0)
      || (typeof row['model'] === 'string' && row['model'].trim().length > 0);
  });
}

function nextModelExpiry(models: readonly OllamaModel[]): string | undefined {
  return models.flatMap((model) => model.expiresAt ? [model.expiresAt] : []).sort()[0];
}

function endpointUrl(baseUrl: string, path: string): URL {
  const base = new URL(baseUrl);
  if (base.username || base.password) throw new OllamaEndpointError('Ollama endpoint URL must not contain credentials');
  if (base.protocol !== 'http:' && base.protocol !== 'https:') {
    throw new OllamaEndpointError('Ollama endpoint URL must use HTTP or HTTPS');
  }
  const hostname = base.hostname.replace(/^\[|\]$/gu, '').toLowerCase();
  const loopback = hostname === 'localhost' || hostname.endsWith('.localhost')
    || hostname === '::1' || /^127(?:\.\d{1,3}){3}$/u.test(hostname);
  if (base.protocol === 'http:' && !loopback) {
    throw new OllamaEndpointError('Remote Ollama endpoints must use HTTPS');
  }
  return new URL(path, `${base.toString().replace(/\/+$/u, '')}/`);
}

function normalizeConfiguredHost(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(value)) return value;
  const localHttpPrefix = ['http:', ''].join('/');
  return `${localHttpPrefix}/${value}`;
}

async function readBoundedJson(response: Response, maxBytes: number): Promise<unknown> {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body?.cancel();
    throw new OllamaEndpointError(`Ollama response exceeds ${maxBytes} bytes`);
  }
  if (!response.body) throw new OllamaEndpointError('Ollama response body is unavailable');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new OllamaEndpointError(`Ollama response exceeds ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(body)) as unknown;
}

export class OllamaRuntimeAdapter implements RuntimeAdapter {
  readonly id = 'ollama';
  private readonly endpoints: readonly OllamaEndpointConfig[];
  private readonly env: NodeJS.ProcessEnv;
  private readonly now: () => Date;
  private readonly minimumPollIntervalMs: number;
  private readonly requestTimeoutMs: number;
  private readonly maxResponseBytes: number;
  private readonly fetchImpl: typeof fetch;
  private cachedInspection: EndpointInspection[] | undefined;
  private lastPollAt = 0;
  private lastInspectionAt: string | undefined;
  private pollInFlight: Promise<EndpointInspection[]> | undefined;
  private pollController: AbortController | undefined;
  private pollWaiterCount = 0;

  constructor(options: OllamaRuntimeAdapterOptions = {}) {
    this.env = options.env ?? process.env;
    const configuredHost = normalizeConfiguredHost(this.env['OLLAMA_HOST']?.trim());
    const apiKeyEnv = this.env['OLLAMA_API_KEY_REF']?.trim();
    const endpoints = options.endpoints ?? (configuredHost
      ? [{ id: 'default', baseUrl: configuredHost, ...(apiKeyEnv ? { apiKeyEnv } : {}) }]
      : []);
    if (endpoints.length > MAX_ENDPOINTS) {
      throw new RangeError(`Ollama polling supports at most ${MAX_ENDPOINTS} endpoints`);
    }
    const endpointIds = new Set<string>();
    for (const endpoint of endpoints) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(endpoint.id)) {
        throw new OllamaEndpointError('Ollama endpoint id must be a non-empty identifier');
      }
      if (endpointIds.has(endpoint.id)) {
        throw new OllamaEndpointError('Ollama endpoint ids must be unique');
      }
      endpointIds.add(endpoint.id);
    }
    this.endpoints = endpoints.map((endpoint) => ({ ...endpoint }));
    this.now = options.now ?? (() => new Date());
    this.minimumPollIntervalMs = boundedInteger('minimumPollIntervalMs', options.minimumPollIntervalMs, 1_000, 0, 60_000);
    this.requestTimeoutMs = boundedInteger('requestTimeoutMs', options.requestTimeoutMs, 5_000, 1, 60_000);
    this.maxResponseBytes = boundedInteger('maxResponseBytes', options.maxResponseBytes, 1_048_576, 1, 10_485_760);
    this.fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const guardedFetch = createEgressGuardedFetch({
        lane: 'operator',
        policy: options.egressPolicyProvider?.() ?? options.egressPolicy,
        override: options.egressOverride,
        audit: options.egressAudit,
        fetchImpl: options.fetchImpl,
      });
      return await guardedFetch(input, init);
    }) as typeof fetch;
  }

  async describe(): Promise<RuntimeProvider> {
    const inspections = await this.inspectEndpoints();
    const connected = inspections.filter((inspection) => !inspection.error).length;
    const state = inspections.length === 0
      ? 'unavailable' as const
      : connected === inspections.length
        ? 'connected' as const
        : connected > 0 ? 'degraded' as const : 'unavailable' as const;
    return RuntimeProviderSchema.parse({
      id: this.id,
      runtime: 'ollama',
      displayName: 'Ollama',
      health: {
        state,
        checkedAt: this.lastInspectionAt ?? this.now().toISOString(),
        ...(state === 'unavailable' ? { message: inspections.length === 0 ? UNCONFIGURED_REASON : 'Configured Ollama endpoints are unavailable' } : {}),
        ...(state === 'degraded' ? { message: 'One or more configured Ollama endpoints are unavailable' } : {}),
      },
      capabilities: {
        snapshot: { status: 'supported' },
        streaming: { status: 'unsupported', reason: 'Ollama does not expose a canonical runtime activity stream' },
        logs: { status: 'unsupported', reason: UNSUPPORTED_REASON },
        blockers: { status: 'unsupported', reason: UNSUPPORTED_REASON },
        approvals: { status: 'unsupported', reason: UNSUPPORTED_REASON },
        pause: { status: 'unsupported', reason: 'The Ollama adapter is read-only' },
        resume: { status: 'unsupported', reason: 'The Ollama adapter is read-only' },
        cancellation: { status: 'unsupported', reason: 'The Ollama adapter is read-only' },
        policyActions: { status: 'unsupported', reason: 'The Ollama adapter is read-only' },
      },
      metadata: {
        configuredEndpointCount: inspections.length,
        connectedEndpointCount: connected,
      },
    });
  }

  async executeAction(request: RuntimeActionRequest): Promise<RuntimeActionResult> {
    const targetId = request.action.type === 'approval.resolve'
      ? request.action.approvalId
      : request.action.taskId;
    return RuntimeActionResultSchema.parse({
      status: 'unsupported',
      providerId: this.id,
      correlationId: request.correlationId,
      reason: 'The Ollama adapter is read-only',
      audit: {
        requestedBy: 'authenticated-operator',
        actionType: request.action.type,
        targetId,
        outcome: 'unsupported',
      },
    });
  }

  async getSnapshot(request: RuntimeSnapshotRequest = {}): Promise<RuntimeSnapshot> {
    const allInspections = await this.inspectEndpoints(request.signal);
    const inspections = allInspections.filter((inspection) => (
      request.workspaceId === undefined || `ollama:${inspection.config.id}` === request.workspaceId
    ));
    const connected = inspections.filter((inspection) => !inspection.error).length;
    const workspaces: RuntimeWorkspace[] = inspections.map((inspection) => {
      const nextLoadedModelExpiry = nextModelExpiry(inspection.loadedModels);
      return {
        id: `ollama:${inspection.config.id}`,
        name: inspection.config.id,
        kind: 'workspace',
        state: inspection.error ? 'unavailable' : 'available',
        metadata: inspection.error
          ? { diagnostic: inspection.error }
          : {
              ...(inspection.version ? { version: inspection.version } : {}),
              installedModelCount: inspection.installedModels.length,
              installedModels: inspection.installedModels.map((model) => model.name).sort().join(','),
              installedModelBytes: inspection.installedModels.reduce((total, model) => total + model.size, 0),
              loadedModelCount: inspection.loadedModels.length,
              loadedModels: inspection.loadedModels.map((model) => model.name).sort().join(','),
              loadedModelBytes: inspection.loadedModels.reduce((total, model) => total + model.size, 0),
              loadedVramBytes: inspection.loadedModels.reduce((total, model) => total + model.sizeVram, 0),
              ...(nextLoadedModelExpiry ? { nextLoadedModelExpiry } : {}),
            },
      };
    });
    const state = allInspections.length === 0
      ? 'unavailable' as const
      : inspections.length === 0
        ? 'empty' as const
      : connected === 0
        ? 'unavailable' as const
        : connected < inspections.length ? 'degraded' as const : 'ready' as const;
    const message = state === 'unavailable'
      ? allInspections.length === 0 ? UNCONFIGURED_REASON : 'Configured Ollama endpoints are unavailable'
      : state === 'degraded' ? 'One or more configured Ollama endpoints are unavailable' : undefined;
    return RuntimeSnapshotSchema.parse({
      providerId: this.id,
      state,
      capturedAt: this.now().toISOString(),
      ...(message ? { message } : {}),
      workspaces: allInspections.length === 0
        ? { status: 'unsupported', reason: UNCONFIGURED_REASON }
        : { status: 'available', data: workspaces },
      agents: { status: 'unsupported', reason: UNSUPPORTED_REASON },
      tasks: { status: 'unsupported', reason: UNSUPPORTED_REASON },
      runs: { status: 'unsupported', reason: UNSUPPORTED_REASON },
      events: { status: 'unsupported', reason: 'Ollama does not expose canonical historical runtime events' },
      blockers: { status: 'unsupported', reason: UNSUPPORTED_REASON },
      approvals: { status: 'unsupported', reason: UNSUPPORTED_REASON },
    });
  }

  async getEvents(_request: RuntimeEventRequest = {}): Promise<RuntimeEventPage> {
    return RuntimeEventPageSchema.parse({ events: [], nextCursor: null });
  }

  validateEventCursor(_cursor: string): void {
    throw new RuntimeCursorError('Ollama does not expose runtime event cursors');
  }

  private async inspectEndpoints(signal?: AbortSignal): Promise<EndpointInspection[]> {
    if (signal?.aborted) return this.cancelledInspections();
    const inspection = this.inspectEndpointsShared();
    this.pollWaiterCount += 1;
    if (!signal) {
      try {
        return await inspection;
      } finally {
        this.releasePollWaiter(false);
      }
    }
    return await new Promise<EndpointInspection[]>((resolve, reject) => {
      let settled = false;
      const finish = (value: EndpointInspection[], cancelled = false) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        this.releasePollWaiter(cancelled);
        resolve(value);
      };
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        this.releasePollWaiter(false);
        reject(error);
      };
      const onAbort = () => finish(this.cancelledInspections(), true);
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
      void inspection.then(finish, fail);
    });
  }

  private releasePollWaiter(cancelled: boolean): void {
    this.pollWaiterCount = Math.max(0, this.pollWaiterCount - 1);
    if (cancelled && this.pollWaiterCount === 0) this.pollController?.abort();
  }

  private cancelledInspections(): EndpointInspection[] {
    return this.endpoints.map((config) => ({
      config,
      installedModels: [],
      loadedModels: [],
      error: 'Ollama request cancelled',
    }));
  }

  private async inspectEndpointsShared(): Promise<EndpointInspection[]> {
    const elapsed = Date.now() - this.lastPollAt;
    if (this.cachedInspection && elapsed < this.minimumPollIntervalMs) return this.cachedInspection;
    if (this.pollInFlight) {
      if (this.pollController?.signal.aborted) {
        await this.pollInFlight;
        if (this.pollWaiterCount === 0) return this.cancelledInspections();
        return await this.inspectEndpointsShared();
      }
      return await this.pollInFlight;
    }
    const controller = new AbortController();
    this.pollController = controller;
    this.pollInFlight = this.pollEndpoints(controller.signal);
    try {
      const inspection = await this.pollInFlight;
      if (!controller.signal.aborted) {
        this.cachedInspection = inspection;
        this.lastPollAt = Date.now();
        this.lastInspectionAt = this.now().toISOString();
      }
      return inspection;
    } finally {
      this.pollInFlight = undefined;
      if (this.pollController === controller) this.pollController = undefined;
    }
  }

  private async pollEndpoints(signal: AbortSignal): Promise<EndpointInspection[]> {
    return await Promise.all(this.endpoints.map(async (config) => {
      const timeoutSignal = AbortSignal.timeout(this.requestTimeoutMs);
      const normalizationController = new AbortController();
      const requestSignal = AbortSignal.any([signal, timeoutSignal, normalizationController.signal]);
      try {
        const headers = new Headers({ accept: 'application/json' });
        if (config.apiKeyEnv) {
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(config.apiKeyEnv)) {
            throw new OllamaEndpointError('Ollama credential reference is invalid');
          }
          const apiKey = this.env[config.apiKeyEnv]?.trim();
          if (!apiKey) throw new OllamaEndpointError('Ollama credential reference is unavailable');
          headers.set('authorization', `Bearer ${apiKey}`);
        }
        const init: RequestInit = { headers, redirect: 'error', signal: requestSignal };
        const settledResponses = await Promise.allSettled([
          this.fetchImpl(endpointUrl(config.baseUrl, 'api/version'), init),
          this.fetchImpl(endpointUrl(config.baseUrl, 'api/tags'), init),
          this.fetchImpl(endpointUrl(config.baseUrl, 'api/ps'), init),
        ]);
        const rejectedResponse = settledResponses.find((result) => result.status === 'rejected');
        if (rejectedResponse) {
          await Promise.allSettled(settledResponses.flatMap((result) => (
            result.status === 'fulfilled' ? [result.value.body?.cancel()] : []
          )));
          throw rejectedResponse.reason;
        }
        const responses = settledResponses.map((result) => {
          if (result.status === 'rejected') throw result.reason;
          return result.value;
        });
        const versionResponse = responses[0]!;
        const tagsResponse = responses[1]!;
        const psResponse = responses[2]!;
        const versionUnsupported = versionResponse.status === 404 || versionResponse.status === 405;
        const psUnsupported = psResponse.status === 404 || psResponse.status === 405;
        const failedResponse = !tagsResponse.ok
          ? tagsResponse
          : !versionResponse.ok && !versionUnsupported
            ? versionResponse
            : !psResponse.ok && !psUnsupported ? psResponse : undefined;
        if (failedResponse) {
          await Promise.allSettled(responses.map(async (response) => await response.body?.cancel()));
          throw new OllamaEndpointError(`Ollama endpoint returned HTTP ${failedResponse.status}`);
        }
        await Promise.allSettled([
          versionUnsupported ? versionResponse.body?.cancel() : undefined,
          psUnsupported ? psResponse.body?.cancel() : undefined,
        ]);
        let versionValue: unknown;
        let tagsValue: unknown;
        let psValue: unknown;
        try {
          [versionValue, tagsValue, psValue] = await Promise.all([
            versionUnsupported ? undefined : readBoundedJson(versionResponse, this.maxResponseBytes),
            readBoundedJson(tagsResponse, this.maxResponseBytes),
            psUnsupported ? { models: [] } : readBoundedJson(psResponse, this.maxResponseBytes),
          ]);
        } catch (error) {
          normalizationController.abort();
          await Promise.allSettled(responses.map(async (response) => await response.body?.cancel()));
          throw error;
        }
        const version = versionValue && typeof versionValue === 'object'
          && typeof (versionValue as { version?: unknown }).version === 'string'
          && (versionValue as { version: string }).version.trim().length > 0
          ? (versionValue as { version: string }).version
          : undefined;
        const tagsValid = hasValidModelEntries(tagsValue);
        const psValid = hasValidModelEntries(psValue);
        if ((!versionUnsupported && !version) || !tagsValid || !psValid) {
          throw new OllamaEndpointError('Ollama endpoint returned an invalid API payload');
        }
        return {
          config,
          ...(version ? { version } : {}),
          installedModels: modelList(tagsValue, false),
          loadedModels: modelList(psValue, true),
        };
      } catch (error) {
        return {
          config,
          installedModels: [],
          loadedModels: [],
          error: signal.aborted
            ? 'Ollama request cancelled'
            : timeoutSignal.aborted
              ? 'Ollama request timed out'
              : error instanceof EgressPolicyViolation
                ? 'Ollama endpoint blocked by egress policy'
                : error instanceof OllamaEndpointError
                  ? error.message
                  : 'Ollama endpoint request failed',
        };
      }
    }));
  }
}
