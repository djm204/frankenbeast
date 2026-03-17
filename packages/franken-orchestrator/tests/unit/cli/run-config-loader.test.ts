import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadRunConfig, loadRunConfigFromEnv, type RunConfig } from '../../../src/cli/run-config-loader.js';

describe('RunConfigLoader', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
    delete process.env['FRANKENBEAST_RUN_CONFIG'];
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
          prCreation: 'auto',
          mergeStrategy: 'squash',
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
      expect(result.gitConfig?.prCreation).toBe('auto');
      expect(result.promptConfig?.text).toBe('You are a helpful assistant.');
      expect(result.promptConfig?.files).toEqual(['context.md']);
      expect(result.maxTotalTokens).toBe(100000);
    });

    it('loads a minimal config with only required fields', async () => {
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

    it('throws on invalid config (missing provider)', async () => {
      workDir = await mkdtemp(join(tmpdir(), 'run-config-'));
      const config = {
        objective: 'No provider',
        chunkDirectory: '/tmp/chunks',
      };
      const filePath = join(workDir, 'invalid.json');
      await writeFile(filePath, JSON.stringify(config));

      expect(() => loadRunConfig(filePath)).toThrow();
    });

    it('throws when file does not exist', () => {
      expect(() => loadRunConfig('/nonexistent/path/config.json')).toThrow();
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

    it('returns undefined when env var is not set', () => {
      delete process.env['FRANKENBEAST_RUN_CONFIG'];

      const result = loadRunConfigFromEnv();

      expect(result).toBeUndefined();
    });
  });
});
