import { describe, it, expect } from 'vitest';
import { chunkPlanDefinition } from '../../../../src/beasts/definitions/chunk-plan-definition.js';

describe('chunkPlanDefinition', () => {
  const validConfig = {
    designDocPath: '/tmp/design.md',
    outputDir: '/tmp/chunks-out',
  };

  describe('buildProcessSpec', () => {
    it('uses process.execPath as the command', () => {
      const spec = chunkPlanDefinition.buildProcessSpec(validConfig);
      expect(spec.command).toBe(process.execPath);
    });

    it('includes resolveCliEntrypoint result as first arg', () => {
      const spec = chunkPlanDefinition.buildProcessSpec(validConfig);
      expect(spec.args[0]).toMatch(/cli\/run\.(js|ts)$/);
    });

    it('passes plan subcommand', () => {
      const spec = chunkPlanDefinition.buildProcessSpec(validConfig);
      expect(spec.args[1]).toBe('plan');
    });

    it('passes --design-doc flag with value', () => {
      const spec = chunkPlanDefinition.buildProcessSpec(validConfig);
      const idx = spec.args.indexOf('--design-doc');
      expect(idx).toBeGreaterThan(-1);
      expect(spec.args[idx + 1]).toBe('/tmp/design.md');
    });

    it('passes --output-dir flag with value', () => {
      const spec = chunkPlanDefinition.buildProcessSpec(validConfig);
      const idx = spec.args.indexOf('--output-dir');
      expect(idx).toBeGreaterThan(-1);
      expect(spec.args[idx + 1]).toBe('/tmp/chunks-out');
    });

    it('sets FRANKENBEAST_SPAWNED=1 in env', () => {
      const spec = chunkPlanDefinition.buildProcessSpec(validConfig);
      expect(spec.env).toBeDefined();
      expect(spec.env!['FRANKENBEAST_SPAWNED']).toBe('1');
    });

    it('uses config.projectRoot as cwd when provided', () => {
      const config = { ...validConfig, projectRoot: '/home/user/project' };
      const spec = chunkPlanDefinition.buildProcessSpec(config);
      expect(spec.cwd).toBe('/home/user/project');
    });

    it('falls back to process.cwd() when projectRoot is not provided', () => {
      const spec = chunkPlanDefinition.buildProcessSpec(validConfig);
      expect(spec.cwd).toBe(process.cwd());
    });
  });

  describe('configSchema', () => {
    it('validates a complete config', () => {
      const result = chunkPlanDefinition.configSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it('rejects missing designDocPath', () => {
      const result = chunkPlanDefinition.configSchema.safeParse({
        outputDir: '/tmp',
      });
      expect(result.success).toBe(false);
    });
  });
});
