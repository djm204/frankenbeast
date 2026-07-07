import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chunkPlanDefinition } from '../../../../src/beasts/definitions/chunk-plan-definition.js';
import { parseArgs } from '../../../../src/cli/args.js';

describe('chunkPlanDefinition', () => {
  const validConfig = {
    designDocPath: 'docs/design.md',
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
      expect(spec.args[idx + 1]).toBe(resolve(process.cwd(), 'docs/design.md'));
    });

    it('passes --output-dir flag with value', () => {
      const spec = chunkPlanDefinition.buildProcessSpec(validConfig);
      const idx = spec.args.indexOf('--output-dir');
      expect(idx).toBeGreaterThan(-1);
      expect(spec.args[idx + 1]).toBe('/tmp/chunks-out');
    });

    it('sets FRANKENBEAST_SPAWNED=1 in env', () => {
      const spec = chunkPlanDefinition.buildProcessSpec(validConfig);
      expect(spec.env).toEqual({ FRANKENBEAST_SPAWNED: '1' });
    });

    it('uses config.projectRoot as cwd when provided', () => {
      const config = { ...validConfig, projectRoot: '/home/user/project' };
      const spec = chunkPlanDefinition.buildProcessSpec(config);
      expect(spec.cwd).toBe('/home/user/project');
    });

    it('rejects designDocPath values with parent-directory traversal before resolving projectRoot', () => {
      const config = {
        ...validConfig,
        projectRoot: '/home/user/project',
        designDocPath: '../secret.md',
      };

      expect(() => chunkPlanDefinition.buildProcessSpec(config)).toThrow(
        /designDocPath.*parent-directory traversal/,
      );
    });

    it('rejects absolute designDocPath values before CLI argument construction', () => {
      expect(() => chunkPlanDefinition.buildProcessSpec({
        ...validConfig,
        designDocPath: '/tmp/design.md',
      })).toThrow(/designDocPath.*repo-relative/);
    });

    it('rejects drive-letter designDocPath values before CLI argument construction', () => {
      expect(() => chunkPlanDefinition.buildProcessSpec({
        ...validConfig,
        designDocPath: 'C:\\tmp\\design.md',
      })).toThrow(/designDocPath.*repo-relative/);
    });

    it('rejects non-markdown designDocPath values before CLI argument construction', () => {
      expect(() => chunkPlanDefinition.buildProcessSpec({
        ...validConfig,
        designDocPath: 'docs/design.txt',
      })).toThrow(/designDocPath.*Markdown design document/);
    });

    it('rejects symlinked designDocPath values that resolve to non-markdown files', () => {
      const testDir = mkdtempSync(resolve(tmpdir(), 'fb-chunk-plan-'));
      const projectRoot = resolve(testDir, 'project');
      const docsDir = resolve(projectRoot, 'docs');

      try {
        mkdirSync(docsDir, { recursive: true });
        writeFileSync(resolve(docsDir, 'design.txt'), '# Not actually Markdown');
        symlinkSync('design.txt', resolve(docsDir, 'design.md'));

        expect(() => chunkPlanDefinition.buildProcessSpec({
          ...validConfig,
          projectRoot,
          designDocPath: 'docs/design.md',
        })).toThrow(/designDocPath.*resolve to a Markdown design document/);
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('allows designDocPath values inside a symlinked projectRoot', () => {
      const testDir = mkdtempSync(resolve(tmpdir(), 'fb-chunk-plan-'));
      const realRoot = resolve(testDir, 'project');
      const linkRoot = resolve(testDir, 'project-link');
      const designPath = resolve(realRoot, 'docs', 'design.md');

      try {
        mkdirSync(resolve(realRoot, 'docs'), { recursive: true });
        writeFileSync(designPath, '# Design');
        symlinkSync(realRoot, linkRoot, 'dir');

        const spec = chunkPlanDefinition.buildProcessSpec({
          ...validConfig,
          projectRoot: linkRoot,
          designDocPath: 'docs/design.md',
        });

        expect(spec.args[spec.args.indexOf('--design-doc') + 1]).toBe(designPath);
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('falls back to process.cwd() when projectRoot is not provided', () => {
      const spec = chunkPlanDefinition.buildProcessSpec(validConfig);
      expect(spec.cwd).toBe(process.cwd());
    });

    it('produces args that parseArgs accepts without throwing', () => {
      const spec = chunkPlanDefinition.buildProcessSpec(validConfig);
      const cliArgs = spec.args.slice(1);
      expect(() => parseArgs(cliArgs)).not.toThrow();
    });

    it('produces args where --output-dir maps to outputDir', () => {
      const spec = chunkPlanDefinition.buildProcessSpec(validConfig);
      const cliArgs = spec.args.slice(1);
      const parsed = parseArgs(cliArgs);
      expect(parsed.outputDir).toBe('/tmp/chunks-out');
    });
  });

  describe('configSchema', () => {
    it('validates a complete config', () => {
      const result = chunkPlanDefinition.configSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it('keeps promptConfig for dashboard frontloaded prompts', () => {
      const result = chunkPlanDefinition.configSchema.safeParse({
        ...validConfig,
        promptConfig: { text: 'attached context' },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.promptConfig?.text).toBe('attached context');
      }
    });

    it('rejects missing designDocPath', () => {
      const result = chunkPlanDefinition.configSchema.safeParse({
        outputDir: '/tmp',
      });
      expect(result.success).toBe(false);
    });

    it.each([
      ['/tmp/design.md'],
      ['C:\\tmp\\design.md'],
      ['..\\secret.md'],
      ['docs/../secret.md'],
      ['docs/design.txt'],
      ['docs/design.md\0'],
    ])('rejects unsafe designDocPath %s', (designDocPath) => {
      const result = chunkPlanDefinition.configSchema.safeParse({
        ...validConfig,
        designDocPath,
      });

      expect(result.success).toBe(false);
    });
  });
});
