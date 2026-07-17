import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadRunConfig,
  loadRunConfigFromEnv,
  RunConfigParseError,
  type RunConfig,
} from '../../../src/cli/run-config-loader.js';
import {
  createRunConfigIntegrityManifest,
  RUN_CONFIG_INTEGRITY_BYPASS_ENV,
  RUN_CONFIG_INTEGRITY_ENV,
  RUN_CONFIG_INTEGRITY_SECRET_ENV,
  RunConfigIntegrityError,
} from '../../../src/cli/run-config-integrity.js';

describe('RunConfigLoader', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
    delete process.env['FRANKENBEAST_RUN_CONFIG'];
    delete process.env[RUN_CONFIG_INTEGRITY_ENV];
    delete process.env[RUN_CONFIG_INTEGRITY_SECRET_ENV];
    delete process.env[RUN_CONFIG_INTEGRITY_BYPASS_ENV];
  });

  describe('loadRunConfig', () => {
    it('loads and validates a complete config from a JSON file', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'run-config-'));
      const config: RunConfig = {
        provider: 'claude',
        objective: 'Build feature X',
        chunkDirectory: '/tmp/chunks',
        llmConfig: {
          default: {
            provider: 'claude',
            model: 'claude-sonnet-4-6',
          },
          overrides: {
            planning: { provider: 'claude', model: 'claude-opus-4-6' },
          },
        },
        modules: {
          firewall: true,
          skills: true,
          memory: false,
          planner: true,
          critique: true,
          governor: false,
          heartbeat: false,
        },
        gitConfig: {
          baseBranch: 'develop',
          branchPattern: '',
          prCreation: 'auto',
          mergeStrategy: 'squash',
          commitConvention: 'conventional',
        },
        promptConfig: {
          text: 'You are a helpful assistant.',
          files: ['context.md'],
        },
        maxTotalTokens: 100000,
      };
      const filePath = join(workDir, 'config.json');
      await writeFile(filePath, JSON.stringify(config));

      const result = loadRunConfig(filePath);

      expect(result.provider).toBe('claude');
      expect(result.objective).toBe('Build feature X');
      expect(result.llmConfig?.default?.provider).toBe('claude');
      expect(result.llmConfig?.default?.model).toBe('claude-sonnet-4-6');
      expect(result.llmConfig?.overrides?.planning?.model).toBe('claude-opus-4-6');
      expect(result.modules?.firewall).toBe(true);
      expect(result.modules?.memory).toBe(false);
      expect(result.gitConfig?.baseBranch).toBe('develop');
      expect(result.gitConfig?.branchPattern).toBe('');
      expect(result.gitConfig?.prCreation).toBe('auto');
      expect(result.gitConfig?.commitConvention).toBe('conventional');
      expect(result.promptConfig?.text).toBe('You are a helpful assistant.');
      expect(result.promptConfig?.files).toEqual(['context.md']);
      expect(result.maxTotalTokens).toBe(100000);
    });

    it('loads a provider-only config', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'run-config-'));
      const config = {
        provider: 'claude',
      };
      const filePath = join(workDir, 'minimal.json');
      await writeFile(filePath, JSON.stringify(config));

      const result = loadRunConfig(filePath);

      expect(result.provider).toBe('claude');
      expect(result.objective).toBeUndefined();
      expect(result.chunkDirectory).toBeUndefined();
      expect(result.llmConfig).toBeUndefined();
      expect(result.modules).toBeUndefined();
      expect(result.gitConfig).toBeUndefined();
    });

    it('accepts unknown fields (passthrough mode)', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'run-config-'));
      const config = {
        provider: 'claude',
        customField: 'should-not-reject',
      };
      const filePath = join(workDir, 'passthrough.json');
      await writeFile(filePath, JSON.stringify(config));

      const result = loadRunConfig(filePath);

      expect(result.provider).toBe('claude');
    });

    it('loads providerless config snapshots for non-martin wizard runs', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'run-config-'));
      const config = {
        objective: 'No provider selected for this workflow',
        chunkDirectory: '/tmp/chunks',
        promptConfig: { text: 'carry wizard prompt context' },
      };
      const filePath = join(workDir, 'providerless.json');
      await writeFile(filePath, JSON.stringify(config));

      const result = loadRunConfig(filePath);

      expect(result.provider).toBeUndefined();
      expect(result.objective).toBe('No provider selected for this workflow');
      expect(result.promptConfig?.text).toBe('carry wizard prompt context');
    });

    it('throws a structured parse error with file path and reason for malformed JSON', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'run-config-'));
      const filePath = join(workDir, 'malformed.json');
      await writeFile(filePath, '{"provider": "claude",');

      expect(() => loadRunConfig(filePath)).toThrow(RunConfigParseError);

      try {
        loadRunConfig(filePath);
      } catch (error) {
        expect(error).toBeInstanceOf(RunConfigParseError);
        expect(error).toMatchObject({
          code: 'RUN_CONFIG_PARSE_ERROR',
          filePath,
          reason: expect.stringContaining('JSON'),
        });
        expect((error as Error).message).toContain(filePath);
        expect((error as Error).cause).toBeInstanceOf(SyntaxError);
      }
    });

    it('throws when file does not exist', () => {
      expect(() => loadRunConfig('/nonexistent/path/config.json')).toThrow();
    });

    it('loads a valid signed config when integrity env vars are present', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'run-config-'));
      const config = { provider: 'claude', objective: 'signed' };
      const filePath = join(workDir, 'signed.json');
      const secret = 'test-secret-value';
      const bytes = JSON.stringify(config);
      await writeFile(filePath, bytes);
      const manifestPath = join(workDir, 'signed.json.integrity');
      await writeFile(manifestPath, JSON.stringify(createRunConfigIntegrityManifest(bytes, secret, {
        configPath: filePath,
      })));
      process.env[RUN_CONFIG_INTEGRITY_ENV] = manifestPath;
      process.env[RUN_CONFIG_INTEGRITY_SECRET_ENV] = secret;

      expect(loadRunConfig(filePath)).toMatchObject(config);
    });

    it('fails closed before JSON parsing when a signed config is tampered', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'run-config-'));
      const filePath = join(workDir, 'tampered.json');
      const secret = 'test-secret-value';
      const originalBytes = JSON.stringify({ provider: 'claude' });
      await writeFile(filePath, '{"provider":"claude",');
      const manifestPath = join(workDir, 'tampered.json.integrity');
      await writeFile(manifestPath, JSON.stringify(createRunConfigIntegrityManifest(originalBytes, secret, {
        configPath: filePath,
      })));
      process.env[RUN_CONFIG_INTEGRITY_ENV] = manifestPath;
      process.env[RUN_CONFIG_INTEGRITY_SECRET_ENV] = secret;

      expect(() => loadRunConfig(filePath)).toThrow(RunConfigIntegrityError);
      expect(() => loadRunConfig(filePath)).not.toThrow(RunConfigParseError);
    });

    it('fails closed when integrity env vars require a missing manifest', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'run-config-'));
      const filePath = join(workDir, 'config.json');
      await writeFile(filePath, JSON.stringify({ provider: 'claude' }));
      process.env[RUN_CONFIG_INTEGRITY_ENV] = join(workDir, 'missing.integrity');
      process.env[RUN_CONFIG_INTEGRITY_SECRET_ENV] = 'test-secret-value';

      expect(() => loadRunConfig(filePath)).toThrow(RunConfigIntegrityError);
      expect(() => loadRunConfig(filePath)).toThrow('invalid runtime config integrity manifest');
    });

    it('fails closed for stale signatures', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'run-config-'));
      const filePath = join(workDir, 'stale.json');
      const secret = 'test-secret-value';
      const bytes = JSON.stringify({ provider: 'claude' });
      await writeFile(filePath, bytes);
      const manifestPath = join(workDir, 'stale.json.integrity');
      await writeFile(manifestPath, JSON.stringify(createRunConfigIntegrityManifest(bytes, secret, {
        configPath: filePath,
        nowUnixMs: 0,
        ttlMs: 1,
      })));
      process.env[RUN_CONFIG_INTEGRITY_ENV] = manifestPath;
      process.env[RUN_CONFIG_INTEGRITY_SECRET_ENV] = secret;

      expect(() => loadRunConfig(filePath)).toThrow('stale runtime config signature');
    });

    it('fails closed for untrusted signatures', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'run-config-'));
      const filePath = join(workDir, 'untrusted.json');
      const bytes = JSON.stringify({ provider: 'claude' });
      await writeFile(filePath, bytes);
      const manifestPath = join(workDir, 'untrusted.json.integrity');
      await writeFile(manifestPath, JSON.stringify(createRunConfigIntegrityManifest(bytes, 'trusted-secret', {
        configPath: filePath,
      })));
      process.env[RUN_CONFIG_INTEGRITY_ENV] = manifestPath;
      process.env[RUN_CONFIG_INTEGRITY_SECRET_ENV] = 'attacker-secret';

      expect(() => loadRunConfig(filePath)).toThrow('signature mismatch');
    });

    it('preserves manual loading when integrity env vars are absent', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'run-config-'));
      const filePath = join(workDir, 'manual.json');
      await writeFile(filePath, JSON.stringify({ provider: 'claude' }));

      expect(loadRunConfig(filePath).provider).toBe('claude');
    });

    it('allows explicit integrity bypass and emits a warning', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'run-config-'));
      const filePath = join(workDir, 'bypass.json');
      await writeFile(filePath, JSON.stringify({ provider: 'claude' }));
      process.env[RUN_CONFIG_INTEGRITY_ENV] = join(workDir, 'missing.integrity');
      process.env[RUN_CONFIG_INTEGRITY_SECRET_ENV] = 'test-secret-value';
      process.env[RUN_CONFIG_INTEGRITY_BYPASS_ENV] = '1';
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      try {
        expect(loadRunConfig(filePath).provider).toBe('claude');
        expect(consoleSpy).toHaveBeenCalledWith(`runtime config integrity bypass enabled for ${filePath}`);
      } finally {
        consoleSpy.mockRestore();
      }
    });
  });

  describe('loadRunConfigFromEnv', () => {
    it('loads config from FRANKENBEAST_RUN_CONFIG env var', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'run-config-'));
      const config = {
        provider: 'claude',
        objective: 'Env-loaded',
        chunkDirectory: '/tmp/chunks',
      };
      const filePath = join(workDir, 'env-config.json');
      await writeFile(filePath, JSON.stringify(config));
      process.env['FRANKENBEAST_RUN_CONFIG'] = filePath;

      const result = loadRunConfigFromEnv();

      expect(result).toBeDefined();
      expect(result!.provider).toBe('claude');
      expect(result!.objective).toBe('Env-loaded');
    });

    it('logs the config file path on successful load', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'run-config-'));
      const config = { provider: 'claude' };
      const filePath = join(workDir, 'log-test.json');
      await writeFile(filePath, JSON.stringify(config));
      process.env['FRANKENBEAST_RUN_CONFIG'] = filePath;

      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      try {
        loadRunConfigFromEnv();
        expect(consoleSpy).toHaveBeenCalledWith(`loaded config from ${filePath}`);
      } finally {
        consoleSpy.mockRestore();
      }
    });

    it('returns undefined when env var is not set', () => {
      delete process.env['FRANKENBEAST_RUN_CONFIG'];

      const result = loadRunConfigFromEnv();

      expect(result).toBeUndefined();
    });
  });
});
