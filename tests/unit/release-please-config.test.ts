import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';

const ROOT = resolve(import.meta.dirname, '../..');

function readJson(relPath: string): unknown {
  return JSON.parse(readFileSync(resolve(ROOT, relPath), 'utf-8'));
}

function parseWorkflowYaml(relPath: string): Record<string, unknown> {
  const source = readFileSync(resolve(ROOT, relPath), 'utf-8');
  let parsed: unknown;
  try {
    parsed = load(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${relPath} must be valid YAML: ${message}`);
  }

  expect(parsed, `${relPath} should parse to an object`).toBeTypeOf('object');
  expect(parsed, `${relPath} should not parse to null`).not.toBeNull();
  expect(Array.isArray(parsed), `${relPath} should not parse to an array`).toBe(false);
  return parsed as Record<string, unknown>;
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  expect(value, `${label} should be an object`).toBeTypeOf('object');
  expect(value, `${label} should be present`).not.toBeNull();
  expect(Array.isArray(value), `${label} should not be an array`).toBe(false);
  return value as Record<string, unknown>;
}

function expectSteps(job: Record<string, unknown>, label: string): Array<Record<string, unknown>> {
  expect(Array.isArray(job.steps), `${label}.steps should be an array`).toBe(true);
  return job.steps as Array<Record<string, unknown>>;
}

function expandWorkspacePackageDirs(workspaces: string[]): string[] {
  const packageDirs = new Set<string>();

  for (const workspace of workspaces) {
    if (workspace.endsWith('/*') && workspace.indexOf('*') === workspace.length - 1) {
      const parentDir = workspace.slice(0, -2);
      for (const entry of readdirSync(resolve(ROOT, parentDir), { withFileTypes: true })) {
        if (entry.isDirectory()) {
          packageDirs.add(`${parentDir}/${entry.name}`);
        }
      }
      continue;
    }

    if (!workspace.includes('*')) {
      packageDirs.add(workspace);
      continue;
    }

    throw new Error(`Unsupported workspace glob in release policy test: ${workspace}`);
  }

  return [...packageDirs].sort();
}

describe('release-please monorepo config', () => {
  const config = readJson('release-please-config.json') as {
    packages: Record<
      string,
      { 'release-type'?: string; component?: string; 'exclude-paths'?: string[] }
    >;
  };
  const manifest = readJson('.release-please-manifest.json') as Record<string, string>;
  const rootPackage = readJson('package.json') as { version: string; workspaces: string[] };
  const packageDirs = expandWorkspacePackageDirs(rootPackage.workspaces);
  const releasePackageDirs = packageDirs.filter((dir) => dir !== '.');

  it('config has root "." entry preserved', () => {
    expect(config.packages['.']).toBeDefined();
    expect(config.packages['.']['release-type']).toBe('node');
  });

  it('config has an explicit release policy for every workspace package', () => {
    for (const dir of releasePackageDirs) {
      expect(config.packages[dir], `missing config entry for ${dir}`).toBeDefined();
    }

    const packageKeys = Object.keys(config.packages).filter((key) => key !== '.').sort();
    expect(packageKeys).toEqual(releasePackageDirs);
  });

  it('root release excludes every workspace package path', () => {
    expect(config.packages['.']['exclude-paths']?.sort()).toEqual(releasePackageDirs);
  });

  it('each package entry has release-type "node"', () => {
    for (const dir of releasePackageDirs) {
      expect(config.packages[dir]?.['release-type'], `${dir} missing release-type`).toBe('node');
    }
  });

  it('each package entry has a component name', () => {
    for (const dir of releasePackageDirs) {
      expect(config.packages[dir]?.component, `${dir} missing component`).toBeTruthy();
    }
  });

  it('manifest has root "." entry preserved', () => {
    expect(manifest['.']).toBe(rootPackage.version);
  });

  it('manifest has entries for every release-managed workspace package', () => {
    for (const dir of releasePackageDirs) {
      expect(manifest[dir], `missing manifest entry for ${dir}`).toBeDefined();
    }

    const manifestPackageKeys = Object.keys(manifest).filter((key) => key !== '.').sort();
    expect(manifestPackageKeys).toEqual(releasePackageDirs);
  });

  it('manifest versions match actual package.json versions', () => {
    for (const dir of releasePackageDirs) {
      const pkg = readJson(`${dir}/package.json`) as { version: string };
      expect(manifest[dir], `${dir} version mismatch`).toBe(pkg.version);
    }
  });

  it('user-facing release packages are publishable to npm', () => {
    for (const dir of ['franken-mcp-suite', 'franken-web', 'live-bench']) {
      const pkg = readJson(`packages/${dir}/package.json`) as {
        private?: boolean;
        publishConfig?: { access?: string };
      };
      expect(pkg.private, `packages/${dir} must not be private`).not.toBe(true);
      expect(pkg.publishConfig?.access, `packages/${dir} must publish publicly`).toBe('public');
    }
  });

  it('live-bench publishes fixtures referenced by its bundled corpus', () => {
    const pkg = readJson('packages/live-bench/package.json') as { files?: string[] };
    expect(pkg.files).toEqual(expect.arrayContaining(['corpus', 'fixtures']));
  });

  it('no per-module release-please-config.json files exist', () => {
    for (const dir of releasePackageDirs) {
      const configPath = resolve(ROOT, `${dir}/release-please-config.json`);
      expect(existsSync(configPath), `${configPath} should not exist`).toBe(false);
    }
  });

  it('no per-module .release-please-manifest.json files exist', () => {
    for (const dir of releasePackageDirs) {
      const manifestPath = resolve(ROOT, `${dir}/.release-please-manifest.json`);
      expect(existsSync(manifestPath), `${manifestPath} should not exist`).toBe(false);
    }
  });

  it('config JSON is valid (has $schema)', () => {
    expect(config).toHaveProperty('$schema');
  });

  it('release-please workflow YAML is parseable and runs the release policy tests before tagging', () => {
    const workflow = parseWorkflowYaml('.github/workflows/release-please.yml');

    expect(workflow.name).toBe('Release Please');
    const triggers = expectRecord(workflow.on, 'release workflow on');
    const push = expectRecord(triggers.push, 'release workflow on.push');
    expect(push.branches).toEqual(['main']);

    const jobs = expectRecord(workflow.jobs, 'release workflow jobs');
    const validateRelease = expectRecord(jobs['validate-release'], 'jobs.validate-release');
    const releasePlease = expectRecord(jobs['release-please'], 'jobs.release-please');

    expect(releasePlease.needs).toBe('validate-release');
    const validationStep = expectSteps(validateRelease, 'jobs.validate-release').find(
      (step) => step.name === 'Validate release before creating tags',
    );
    expect(validationStep, 'validate-release should run the release policy test file').toBeTruthy();
    const validationRun = String(validationStep?.run ?? '');
    expect(validationRun).toContain('tests/unit/release-please-config.test.ts');

    const releaseStep = expectSteps(releasePlease, 'jobs.release-please').find(
      (step) => step.uses === 'googleapis/release-please-action@v5',
    );
    expect(releaseStep, 'release-please action step should be present').toBeTruthy();
    const releaseWith = expectRecord(releaseStep?.with, 'release-please action with');
    expect(releaseWith['config-file']).toBe('release-please-config.json');
    expect(releaseWith['manifest-file']).toBe('.release-please-manifest.json');
  });
});
