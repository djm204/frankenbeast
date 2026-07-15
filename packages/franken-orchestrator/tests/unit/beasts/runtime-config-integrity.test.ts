import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  assertRuntimeConfigIntegrity,
  RuntimeConfigIntegrityError,
  runtimeConfigIntegrityManifestPath,
  verifyRuntimeConfigIntegrity,
  writeRuntimeConfigIntegrityManifest,
} from '../../../src/beasts/execution/runtime-config-integrity.js';

describe('runtime config integrity manifests', () => {
  it('verifies a runtime config file that matches its checksum manifest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-runtime-config-integrity-'));
    try {
      const configPath = join(dir, 'run-1.json');
      writeFileSync(configPath, '{"provider":"claude","objective":"ship"}\n');
      const manifest = writeRuntimeConfigIntegrityManifest({
        configPath,
        now: new Date('2026-07-15T00:00:00.000Z'),
      });

      const result = assertRuntimeConfigIntegrity({ configPath });

      expect(result).toMatchObject({ ok: true, bypassed: false, expectedDigest: manifest.digest, actualDigest: manifest.digest });
      expect(existsSync(runtimeConfigIntegrityManifestPath(configPath))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports drift when the runtime config changes after manifest approval', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-runtime-config-integrity-'));
    try {
      const configPath = join(dir, 'run-2.json');
      writeFileSync(configPath, '{"provider":"claude","objective":"ship"}\n');
      writeRuntimeConfigIntegrityManifest({ configPath });
      writeFileSync(configPath, '{"provider":"codex","objective":"ship"}\n');

      const result = verifyRuntimeConfigIntegrity({ configPath });

      expect(result).toMatchObject({ ok: false, bypassed: false, reason: 'runtime config digest drifted from manifest' });
      expect(result.expectedDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(result.actualDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(() => assertRuntimeConfigIntegrity({ configPath })).toThrow(RuntimeConfigIntegrityError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('fails closed when the runtime config manifest is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'franken-runtime-config-integrity-'));
    try {
      const configPath = join(dir, 'run-3.json');
      writeFileSync(configPath, '{"provider":"claude"}\n');

      const result = verifyRuntimeConfigIntegrity({ configPath });

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
      writeRuntimeConfigIntegrityManifest({ configPath });
      rmSync(configPath);
      mkdirSync(configPath);

      const result = verifyRuntimeConfigIntegrity({ configPath });

      expect(result).toMatchObject({
        ok: false,
        bypassed: false,
        reason: expect.stringContaining('runtime config file could not be read for integrity verification'),
      });
      expect(() => assertRuntimeConfigIntegrity({ configPath })).toThrow(RuntimeConfigIntegrityError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
