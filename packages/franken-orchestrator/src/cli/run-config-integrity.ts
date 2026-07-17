import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { z } from 'zod';

export const RUN_CONFIG_INTEGRITY_ALGORITHM = 'hmac-sha256';
export const RUN_CONFIG_INTEGRITY_VERSION = 1;
export const DEFAULT_RUN_CONFIG_INTEGRITY_TTL_MS = 24 * 60 * 60 * 1000;

export const RUN_CONFIG_INTEGRITY_ENV = 'FRANKENBEAST_RUN_CONFIG_INTEGRITY';
export const RUN_CONFIG_INTEGRITY_SECRET_ENV = 'FRANKENBEAST_RUN_CONFIG_INTEGRITY_SECRET';
export const RUN_CONFIG_INTEGRITY_BYPASS_ENV = 'FRANKENBEAST_RUN_CONFIG_INTEGRITY_BYPASS';

const HEX_SHA256_PATTERN = /^[0-9a-f]{64}$/i;

const RunConfigIntegrityManifestSchema = z.object({
  version: z.literal(RUN_CONFIG_INTEGRITY_VERSION),
  algorithm: z.literal(RUN_CONFIG_INTEGRITY_ALGORITHM),
  configPath: z.string().min(1).optional(),
  configSha256: z.string().regex(HEX_SHA256_PATTERN),
  createdAtUnixMs: z.number().int().nonnegative(),
  expiresAtUnixMs: z.number().int().nonnegative(),
  signature: z.string().regex(HEX_SHA256_PATTERN),
}).strict();

export type RunConfigIntegrityManifest = z.infer<typeof RunConfigIntegrityManifestSchema>;

export interface CreateRunConfigIntegrityManifestOptions {
  readonly configPath?: string | undefined;
  readonly nowUnixMs?: number | undefined;
  readonly ttlMs?: number | undefined;
}

export interface VerifyRunConfigIntegrityOptions {
  readonly nowUnixMs?: number | undefined;
}

export class RunConfigIntegrityError extends Error {
  public readonly code = 'RUN_CONFIG_INTEGRITY_ERROR';

  constructor(
    public readonly filePath: string,
    public readonly reason: string,
    options?: ErrorOptions,
  ) {
    super(`Runtime config integrity verification failed for ${filePath}: ${reason}`, options);
    this.name = 'RunConfigIntegrityError';
  }
}

function sha256Hex(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalIntegrityPayload(fields: Omit<RunConfigIntegrityManifest, 'signature'>): string {
  return [
    `version:${fields.version}`,
    `algorithm:${encodeURIComponent(fields.algorithm)}`,
    `configSha256:${fields.configSha256.toLowerCase()}`,
    `createdAtUnixMs:${fields.createdAtUnixMs}`,
    `expiresAtUnixMs:${fields.expiresAtUnixMs}`,
  ].join('|');
}

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function timingSafeHexEqual(expected: string, actual: string): boolean {
  if (!HEX_SHA256_PATTERN.test(actual)) return false;
  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(actual, 'hex');
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export function createRunConfigIntegrityManifest(
  configBytes: string | Buffer,
  secret: string,
  options: CreateRunConfigIntegrityManifestOptions = {},
): RunConfigIntegrityManifest {
  const now = options.nowUnixMs ?? Date.now();
  const ttl = options.ttlMs ?? DEFAULT_RUN_CONFIG_INTEGRITY_TTL_MS;
  if (!secret) {
    throw new Error('runtime config integrity secret is required');
  }
  if (!Number.isFinite(ttl) || ttl <= 0) {
    throw new Error('runtime config integrity ttl must be a positive finite number');
  }
  const unsigned = {
    version: RUN_CONFIG_INTEGRITY_VERSION,
    algorithm: RUN_CONFIG_INTEGRITY_ALGORITHM,
    ...(options.configPath ? { configPath: options.configPath } : {}),
    configSha256: sha256Hex(configBytes),
    createdAtUnixMs: now,
    expiresAtUnixMs: now + ttl,
  } satisfies Omit<RunConfigIntegrityManifest, 'signature'>;
  return {
    ...unsigned,
    signature: signPayload(canonicalIntegrityPayload(unsigned), secret),
  };
}

export function verifyRunConfigIntegrity(
  configPath: string,
  manifestPath: string,
  secret: string,
  options: VerifyRunConfigIntegrityOptions = {},
): void {
  if (!manifestPath) {
    throw new RunConfigIntegrityError(configPath, 'missing runtime config integrity manifest');
  }
  if (!secret) {
    throw new RunConfigIntegrityError(configPath, 'missing runtime config integrity secret');
  }

  let manifest: RunConfigIntegrityManifest;
  try {
    manifest = RunConfigIntegrityManifestSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf-8')));
  } catch (error) {
    throw new RunConfigIntegrityError(
      configPath,
      'invalid runtime config integrity manifest',
      error instanceof Error ? { cause: error } : undefined,
    );
  }

  const now = options.nowUnixMs ?? Date.now();
  if (manifest.expiresAtUnixMs < now) {
    throw new RunConfigIntegrityError(configPath, 'stale runtime config signature');
  }
  if (manifest.createdAtUnixMs > now + 60_000) {
    throw new RunConfigIntegrityError(configPath, 'runtime config signature timestamp is in the future');
  }

  const unsigned = {
    version: manifest.version,
    algorithm: manifest.algorithm,
    ...(manifest.configPath ? { configPath: manifest.configPath } : {}),
    configSha256: manifest.configSha256,
    createdAtUnixMs: manifest.createdAtUnixMs,
    expiresAtUnixMs: manifest.expiresAtUnixMs,
  } satisfies Omit<RunConfigIntegrityManifest, 'signature'>;
  const expectedSignature = signPayload(canonicalIntegrityPayload(unsigned), secret);
  if (!timingSafeHexEqual(expectedSignature, manifest.signature)) {
    throw new RunConfigIntegrityError(configPath, 'signature mismatch');
  }

  const actualSha256 = sha256Hex(readFileSync(configPath));
  if (actualSha256 !== manifest.configSha256.toLowerCase()) {
    throw new RunConfigIntegrityError(configPath, 'checksum mismatch');
  }
}
