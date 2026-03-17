import { describe, it, expect } from 'vitest';
import { martinLoopDefinition } from '../../../../src/beasts/definitions/martin-loop-definition.js';

describe('martinLoopDefinition', () => {
  const validConfig = {
    provider: 'claude',
    objective: 'implement feature X',
    chunkDirectory: '/tmp/chunks',
  };

  describe('buildProcessSpec', () => {
    it('uses process.execPath as the command', () => {
      const spec = martinLoopDefinition.buildProcessSpec(validConfig);
      expect(spec.command).toBe(process.execPath);
    });

    it('includes resolveCliEntrypoint result as first arg', () => {
      const spec = martinLoopDefinition.buildProcessSpec(validConfig);
      expect(spec.args[0]).toMatch(/cli\/run\.(js|ts)$/);
    });

    it('passes run subcommand', () => {
      const spec = martinLoopDefinition.buildProcessSpec(validConfig);
      expect(spec.args[1]).toBe('run');
    });

    it('passes --provider flag with value', () => {
      const spec = martinLoopDefinition.buildProcessSpec(validConfig);
      const providerIdx = spec.args.indexOf('--provider');
      expect(providerIdx).toBeGreaterThan(-1);
      expect(spec.args[providerIdx + 1]).toBe('claude');
    });

    it('passes --chunks flag with chunk directory', () => {
      const spec = martinLoopDefinition.buildProcessSpec(validConfig);
      const chunksIdx = spec.args.indexOf('--chunks');
      expect(chunksIdx).toBeGreaterThan(-1);
      expect(spec.args[chunksIdx + 1]).toBe('/tmp/chunks');
    });

    it('sets FRANKENBEAST_SPAWNED=1 in env', () => {
      const spec = martinLoopDefinition.buildProcessSpec(validConfig);
      expect(spec.env).toBeDefined();
      expect(spec.env!['FRANKENBEAST_SPAWNED']).toBe('1');
    });

    it('uses config.projectRoot as cwd when provided', () => {
      const config = { ...validConfig, projectRoot: '/home/user/project' };
      const spec = martinLoopDefinition.buildProcessSpec(config);
      expect(spec.cwd).toBe('/home/user/project');
    });

    it('falls back to process.cwd() when projectRoot is not provided', () => {
      const spec = martinLoopDefinition.buildProcessSpec(validConfig);
      expect(spec.cwd).toBe(process.cwd());
    });
  });

  describe('configSchema', () => {
    it('validates a complete config', () => {
      const result = martinLoopDefinition.configSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it('rejects missing provider', () => {
      const result = martinLoopDefinition.configSchema.safeParse({
        objective: 'test',
        chunkDirectory: '/tmp',
      });
      expect(result.success).toBe(false);
    });
  });
});
