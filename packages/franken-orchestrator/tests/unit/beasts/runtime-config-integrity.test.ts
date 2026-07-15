import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  assertRuntimeConfigIntegrity,
  RUNTIME_CONFIG_MANIFEST_KEY_ENV,
  RuntimeConfigIntegrityError,
  runtimeConfigIntegrityManifestPath,
  verifyRuntimeConfigIntegrity,
  writeRuntimeConfigIntegrityManifest,
} from '../../../src/beasts/execution/runtime-config-integrity.js';

const manifestKey = 'test-runtime-config-integrity-key';

describe('runtime config integrity manifests', () => {
  it('verifies a runtime config file that matches its checksum manifest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-runtime-config-integrity-'));
    try {
      const configPath = join(dir, 'run-1.json');
      writeFileSync(configPath, '{"provider":"claude","objective":"ship"}\n');
      const manifest = writeRuntimeConfigIntegrityManifest({
        configPath,
        manifestKey,
        now: new Date('2026-07-15T00:00:00.000Z'),
      });

      const result = assertRuntimeConfigIntegrity({ configPath, manifestKey });

      expect(result).toMatchObject({ ok: true, bypassed: false, expectedDigest: manifest.digest, actualDigest: manifest.digest });
      expect(existsSync(runtimeConfigIntegrityManifestPath(configPath))).toBe(true);
      expect(manifest.signature).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports drift when the runtime config changes after manifest approval', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-runtime-config-integrity-'));
    try {
      const configPath = join(dir, 'run-2.json');
      writeFileSync(configPath, '{"provider":"claude","objective":"ship"}\n');
      writeRuntimeConfigIntegrityManifest({ configPath, manifestKey });
      writeFileSync(configPath, '{"provider":"codex","objective":"ship"}\n');

      const result = verifyRuntimeConfigIntegrity({ configPath, manifestKey });

      expect(result).toMatchObject({ ok: false, bypassed: false, reason: 'runtime config digest drifted from manifest' });
      expect(result.expectedDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(result.actualDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(() => assertRuntimeConfigIntegrity({ configPath, manifestKey })).toThrow(RuntimeConfigIntegrityError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('fails closed when the runtime config manifest is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-runtime-config-integrity-'));
    try {
      const configPath = join(dir, 'run-3.json');
      writeFileSync(configPath, '{"provider":"claude"}\n');

      const result = verifyRuntimeConfigIntegrity({ configPath, manifestKey });

      expect(result).toMatchObject({ ok: false, bypassed: false, reason: 'runtime config integrity manifest is missing' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('requires an explicit bypass to continue without a manifest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-runtime-config-integrity-'));
    try {
      const configPath = join(dir, 'run-4.json');
      writeFileSync(configPath, '{"provider":"claude"}\n');
      rmSync(runtimeConfigIntegrityManifestPath(configPath), { force: true });

      const result = assertRuntimeConfigIntegrity({ configPath, bypass: true });

      expect(result).toMatchObject({ ok: true, bypassed: true, reason: 'explicit bypass' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('wraps unreadable runtime configs in a structured verification failure', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-runtime-config-integrity-'));
    try {
      const configPath = join(dir, 'run-5.json');
      writeFileSync(configPath, '{"provider":"claude"}\n');
      writeRuntimeConfigIntegrityManifest({ configPath, manifestKey });
      rmSync(configPath);
      mkdirSync(configPath);

      const result = verifyRuntimeConfigIntegrity({ configPath, manifestKey });

      expect(result).toMatchObject({
        ok: false,
        bypassed: false,
        reason: expect.stringContaining('runtime config file could not be read for integrity verification'),
      });
      expect(() => assertRuntimeConfigIntegrity({ configPath, manifestKey })).toThrow(RuntimeConfigIntegrityError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects co-tampered configs when the manifest signature is stale', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-runtime-config-integrity-'));
    try {
      const configPath = join(dir, 'run-6.json');
      writeFileSync(configPath, '{"provider":"claude"}\n');
      const manifestPath = runtimeConfigIntegrityManifestPath(configPath);
      writeRuntimeConfigIntegrityManifest({ configPath, manifestKey });
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
      writeFileSync(configPath, '{"provider":"codex"}\n');
      const forgedDigest = createHash('sha256').update(readFileSync(configPath)).digest('hex');
      writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, digest: forgedDigest }, null, 2)}\n`);

      const result = verifyRuntimeConfigIntegrity({ configPath, manifestKey });

      expect(result).toMatchObject({ ok: false, bypassed: false, reason: 'runtime config integrity manifest signature is invalid' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('bounds manifest reads before parsing JSON', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-runtime-config-integrity-'));
    try {
      const configPath = join(dir, 'run-7.json');
      writeFileSync(configPath, '{"provider":"claude"}\n');
      writeFileSync(runtimeConfigIntegrityManifestPath(configPath), `${' '.repeat(4097)}{}`);

      const result = verifyRuntimeConfigIntegrity({ configPath, manifestKey });

      expect(result).toMatchObject({
        ok: false,
        bypassed: false,
        reason: expect.stringContaining('runtime config integrity manifest exceeds maxBytes'),
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('uses the manifest key from the environment when no explicit key is provided', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-runtime-config-integrity-'));
    const previous = process.env[RUNTIME_CONFIG_MANIFEST_KEY_ENV];
    try {
      process.env[RUNTIME_CONFIG_MANIFEST_KEY_ENV] = manifestKey;
      const configPath = join(dir, 'run-8.json');
      writeFileSync(configPath, '{"provider":"claude"}\n');
      writeRuntimeConfigIntegrityManifest({ configPath });

      expect(assertRuntimeConfigIntegrity({ configPath })).toMatchObject({ ok: true });
    } finally {
      if (previous === undefined) delete process.env[RUNTIME_CONFIG_MANIFEST_KEY_ENV];
      else process.env[RUNTIME_CONFIG_MANIFEST_KEY_ENV] = previous;
      await rm(dir, { recursive: true, force: true });
    }
  });
});
