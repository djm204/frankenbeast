import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const RUNTIME_CONFIG_INTEGRITY_SCHEMA_VERSION = 1;
const RUNTIME_CONFIG_INTEGRITY_ALGORITHM = 'sha256';
const RUNTIME_CONFIG_MANIFEST_SIGNATURE_ALGORITHM = 'hmac-sha256';
const RUNTIME_CONFIG_MANIFEST_MAX_BYTES = 4096;
export const RUNTIME_CONFIG_MANIFEST_KEY_ENV = 'FRANKENBEAST_RUN_CONFIG_MANIFEST_KEY';

export interface RuntimeConfigIntegrityManifest {
  readonly schemaVersion: typeof RUNTIME_CONFIG_INTEGRITY_SCHEMA_VERSION;
  readonly fileName: string;
  readonly algorithm: typeof RUNTIME_CONFIG_INTEGRITY_ALGORITHM;
  readonly digest: string;
  readonly generatedAt: string;
  readonly signatureAlgorithm: typeof RUNTIME_CONFIG_MANIFEST_SIGNATURE_ALGORITHM;
  readonly signature: string;
}

export interface RuntimeConfigIntegrityVerification {
  readonly ok: boolean;
  readonly bypassed: boolean;
  readonly manifestPath: string;
  readonly configPath: string;
  readonly expectedDigest?: string | undefined;
  readonly actualDigest?: string | undefined;
  readonly reason?: string | undefined;
}

export class RuntimeConfigIntegrityError extends Error {
  constructor(readonly verification: RuntimeConfigIntegrityVerification) {
    super(formatRuntimeConfigIntegrityError(verification));
    this.name = 'RuntimeConfigIntegrityError';
  }
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function sha256FileVerification(path: string): { digest?: string; reason?: string } {
  try {
    return { digest: sha256File(path) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { reason: `runtime config file could not be read for integrity verification: ${message}` };
  }
}

function manifestSigningPayload(input: Omit<RuntimeConfigIntegrityManifest, 'signature'>): string {
  return JSON.stringify({
    schemaVersion: input.schemaVersion,
    fileName: input.fileName,
    algorithm: input.algorithm,
    digest: input.digest,
    generatedAt: input.generatedAt,
    signatureAlgorithm: input.signatureAlgorithm,
  });
}

function signManifest(input: Omit<RuntimeConfigIntegrityManifest, 'signature'>, key: string): string {
  return createHmac('sha256', key).update(manifestSigningPayload(input)).digest('hex');
}

function verifyManifestSignature(manifest: RuntimeConfigIntegrityManifest, key: string): boolean {
  const expected = signManifest(manifest, key);
  const expectedBytes = Buffer.from(expected, 'hex');
  const actualBytes = Buffer.from(manifest.signature, 'hex');
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

function formatRuntimeConfigIntegrityError(verification: RuntimeConfigIntegrityVerification): string {
  const reason = verification.reason ?? 'runtime config integrity verification failed';
  const digestDetails = verification.expectedDigest && verification.actualDigest
    ? ` expected sha256 ${verification.expectedDigest} but found ${verification.actualDigest}`
    : '';
  return `Runtime config integrity check failed for ${verification.configPath}: ${reason}.${digestDetails} Refresh the manifest only after reviewing and approving the config change, or set FRANKENBEAST_RUN_CONFIG_INTEGRITY_BYPASS=1 for an explicit emergency bypass.`;
}

function parseManifest(path: string): RuntimeConfigIntegrityManifest {
  const info = statSync(path);
  if (info.size > RUNTIME_CONFIG_MANIFEST_MAX_BYTES) {
    throw new Error(`runtime config integrity manifest exceeds maxBytes: ${info.size} > ${RUNTIME_CONFIG_MANIFEST_MAX_BYTES}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`runtime config integrity manifest is not valid JSON: ${(error as Error).message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('runtime config integrity manifest must be a JSON object');
  }
  const manifest = parsed as Record<string, unknown>;
  if (manifest.schemaVersion !== RUNTIME_CONFIG_INTEGRITY_SCHEMA_VERSION) {
    throw new Error(`runtime config integrity manifest schemaVersion must be ${RUNTIME_CONFIG_INTEGRITY_SCHEMA_VERSION}`);
  }
  if (manifest.algorithm !== RUNTIME_CONFIG_INTEGRITY_ALGORITHM) {
    throw new Error(`runtime config integrity manifest algorithm must be ${RUNTIME_CONFIG_INTEGRITY_ALGORITHM}`);
  }
  if (typeof manifest.fileName !== 'string' || manifest.fileName.length === 0) {
    throw new Error('runtime config integrity manifest fileName must be a non-empty string');
  }
  if (typeof manifest.digest !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.digest)) {
    throw new Error('runtime config integrity manifest digest must be a lowercase sha256 hex digest');
  }
  if (typeof manifest.generatedAt !== 'string' || Number.isNaN(Date.parse(manifest.generatedAt))) {
    throw new Error('runtime config integrity manifest generatedAt must be a parseable timestamp');
  }
  if (manifest.signatureAlgorithm !== RUNTIME_CONFIG_MANIFEST_SIGNATURE_ALGORITHM) {
    throw new Error(`runtime config integrity manifest signatureAlgorithm must be ${RUNTIME_CONFIG_MANIFEST_SIGNATURE_ALGORITHM}`);
  }
  if (typeof manifest.signature !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.signature)) {
    throw new Error('runtime config integrity manifest signature must be a lowercase hmac-sha256 hex digest');
  }
  return manifest as unknown as RuntimeConfigIntegrityManifest;
}

export function runtimeConfigIntegrityManifestPath(configPath: string): string {
  return `${configPath}.manifest.json`;
}

export function writeRuntimeConfigIntegrityManifest(input: {
  readonly configPath: string;
  readonly manifestPath?: string | undefined;
  readonly now?: Date | undefined;
  readonly manifestKey?: string | undefined;
}): RuntimeConfigIntegrityManifest {
  const manifestKey = input.manifestKey ?? process.env[RUNTIME_CONFIG_MANIFEST_KEY_ENV];
  if (!manifestKey) {
    throw new Error(`runtime config integrity manifest requires ${RUNTIME_CONFIG_MANIFEST_KEY_ENV}`);
  }
  const unsignedManifest: Omit<RuntimeConfigIntegrityManifest, 'signature'> = {
    schemaVersion: RUNTIME_CONFIG_INTEGRITY_SCHEMA_VERSION,
    fileName: basename(input.configPath),
    algorithm: RUNTIME_CONFIG_INTEGRITY_ALGORITHM,
    digest: sha256File(input.configPath),
    generatedAt: (input.now ?? new Date()).toISOString(),
    signatureAlgorithm: RUNTIME_CONFIG_MANIFEST_SIGNATURE_ALGORITHM,
  };
  const manifest: RuntimeConfigIntegrityManifest = {
    ...unsignedManifest,
    signature: signManifest(unsignedManifest, manifestKey),
  };
  writeFileSync(input.manifestPath ?? runtimeConfigIntegrityManifestPath(input.configPath), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  return manifest;
}

export function verifyRuntimeConfigIntegrity(input: {
  readonly configPath: string;
  readonly manifestPath?: string | undefined;
  readonly bypass?: boolean | undefined;
  readonly manifestKey?: string | undefined;
}): RuntimeConfigIntegrityVerification {
  const manifestPath = input.manifestPath ?? runtimeConfigIntegrityManifestPath(input.configPath);
  if (input.bypass) {
    return { ok: true, bypassed: true, configPath: input.configPath, manifestPath, reason: 'explicit bypass' };
  }
  if (!existsSync(input.configPath)) {
    return { ok: false, bypassed: false, configPath: input.configPath, manifestPath, reason: 'runtime config file is missing' };
  }
  if (!existsSync(manifestPath)) {
    return { ok: false, bypassed: false, configPath: input.configPath, manifestPath, reason: 'runtime config integrity manifest is missing' };
  }
  let manifest: RuntimeConfigIntegrityManifest;
  try {
    manifest = parseManifest(manifestPath);
  } catch (error) {
    return { ok: false, bypassed: false, configPath: input.configPath, manifestPath, reason: (error as Error).message };
  }
  if (manifest.fileName !== basename(input.configPath)) {
    return {
      ok: false,
      bypassed: false,
      configPath: input.configPath,
      manifestPath,
      expectedDigest: manifest.digest,
      reason: `manifest fileName '${manifest.fileName}' does not match '${basename(input.configPath)}'`,
    };
  }
  const manifestKey = input.manifestKey ?? process.env[RUNTIME_CONFIG_MANIFEST_KEY_ENV];
  if (!manifestKey) {
    return {
      ok: false,
      bypassed: false,
      configPath: input.configPath,
      manifestPath,
      expectedDigest: manifest.digest,
      reason: `runtime config integrity manifest key is missing from ${RUNTIME_CONFIG_MANIFEST_KEY_ENV}`,
    };
  }
  if (!verifyManifestSignature(manifest, manifestKey)) {
    return {
      ok: false,
      bypassed: false,
      configPath: input.configPath,
      manifestPath,
      expectedDigest: manifest.digest,
      reason: 'runtime config integrity manifest signature is invalid',
    };
  }
  const { digest: actualDigest, reason: readFailureReason } = sha256FileVerification(input.configPath);
  if (!actualDigest) {
    return {
      ok: false,
      bypassed: false,
      configPath: input.configPath,
      manifestPath,
      expectedDigest: manifest.digest,
      reason: readFailureReason ?? 'runtime config file could not be read for integrity verification',
    };
  }
  if (actualDigest !== manifest.digest) {
    return {
      ok: false,
      bypassed: false,
      configPath: input.configPath,
      manifestPath,
      expectedDigest: manifest.digest,
      actualDigest,
      reason: 'runtime config digest drifted from manifest',
    };
  }
  return {
    ok: true,
    bypassed: false,
    configPath: input.configPath,
    manifestPath,
    expectedDigest: manifest.digest,
    actualDigest,
  };
}

export function assertRuntimeConfigIntegrity(input: {
  readonly configPath: string;
  readonly manifestPath?: string | undefined;
  readonly bypass?: boolean | undefined;
  readonly manifestKey?: string | undefined;
}): RuntimeConfigIntegrityVerification {
  const verification = verifyRuntimeConfigIntegrity(input);
  if (!verification.ok) {
    throw new RuntimeConfigIntegrityError(verification);
  }
  return verification;
}
