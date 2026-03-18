import { describe, it, expect } from 'vitest';
import { designInterviewDefinition } from '../../../../src/beasts/definitions/design-interview-definition.js';
import { parseArgs } from '../../../../src/cli/args.js';

describe('designInterviewDefinition', () => {
  const validConfig = {
    goal: 'design a new API layer',
    outputPath: '/tmp/design-doc.md',
  };

  describe('buildProcessSpec', () => {
    it('uses process.execPath as the command', () => {
      const spec = designInterviewDefinition.buildProcessSpec(validConfig);
      expect(spec.command).toBe(process.execPath);
    });

    it('includes resolveCliEntrypoint result as first arg', () => {
      const spec = designInterviewDefinition.buildProcessSpec(validConfig);
      expect(spec.args[0]).toMatch(/cli\/run\.(js|ts)$/);
    });

    it('passes interview subcommand', () => {
      const spec = designInterviewDefinition.buildProcessSpec(validConfig);
      expect(spec.args[1]).toBe('interview');
    });

    it('passes --goal flag with value', () => {
      const spec = designInterviewDefinition.buildProcessSpec(validConfig);
      const idx = spec.args.indexOf('--goal');
      expect(idx).toBeGreaterThan(-1);
      expect(spec.args[idx + 1]).toBe('design a new API layer');
    });

    it('passes --output flag with value', () => {
      const spec = designInterviewDefinition.buildProcessSpec(validConfig);
      const idx = spec.args.indexOf('--output');
      expect(idx).toBeGreaterThan(-1);
      expect(spec.args[idx + 1]).toBe('/tmp/design-doc.md');
    });

    it('sets FRANKENBEAST_SPAWNED=1 in env', () => {
      const spec = designInterviewDefinition.buildProcessSpec(validConfig);
      expect(spec.env).toEqual({ FRANKENBEAST_SPAWNED: '1' });
    });

    it('uses config.projectRoot as cwd when provided', () => {
      const config = { ...validConfig, projectRoot: '/home/user/project' };
      const spec = designInterviewDefinition.buildProcessSpec(config);
      expect(spec.cwd).toBe('/home/user/project');
    });

    it('falls back to process.cwd() when projectRoot is not provided', () => {
      const spec = designInterviewDefinition.buildProcessSpec(validConfig);
      expect(spec.cwd).toBe(process.cwd());
    });

    it('produces args that parseArgs accepts without throwing', () => {
      const spec = designInterviewDefinition.buildProcessSpec(validConfig);
      const cliArgs = spec.args.slice(1);
      expect(() => parseArgs(cliArgs)).not.toThrow();
    });

    it('produces args where --goal and --output map to CliArgs fields', () => {
      const spec = designInterviewDefinition.buildProcessSpec(validConfig);
      const cliArgs = spec.args.slice(1);
      const parsed = parseArgs(cliArgs);
      expect(parsed.interviewGoal).toBe('design a new API layer');
      expect(parsed.interviewOutput).toBe('/tmp/design-doc.md');
    });
  });

  describe('configSchema', () => {
    it('validates a complete config', () => {
      const result = designInterviewDefinition.configSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it('rejects missing goal', () => {
      const result = designInterviewDefinition.configSchema.safeParse({
        outputPath: '/tmp/out.md',
      });
      expect(result.success).toBe(false);
    });
  });
});
