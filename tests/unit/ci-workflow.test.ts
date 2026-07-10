import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { load } from 'js-yaml';

const ROOT = resolve(import.meta.dirname, '..', '..');
const CI_PATH = resolve(ROOT, '.github/workflows/ci.yml');
const RELEASE_PATH = resolve(ROOT, '.github/workflows/release-please.yml');
const WORKFLOW_LINT_PATH = resolve(ROOT, '.github/workflows/workflow-lint.yml');

function parseWorkflowYaml(source: string): Record<string, unknown> {
  let workflow: unknown;
  try {
    workflow = load(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`YAML parse error: ${message}`);
  }

  if (typeof workflow !== 'object' || workflow === null || Array.isArray(workflow)) {
    throw new Error('YAML workflow must parse to an object');
  }

  return workflow as Record<string, unknown>;
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  expect(value, `${label} should be an object`).toBeTypeOf('object');
  expect(value, `${label} should be present`).not.toBeNull();
  expect(Array.isArray(value), `${label} should not be an array`).toBe(false);
  return value as Record<string, unknown>;
}

function expectSteps(job: Record<string, unknown>): Array<Record<string, unknown>> {
  expect(Array.isArray(job.steps)).toBe(true);
  return job.steps as Array<Record<string, unknown>>;
}

function expectBuildTypecheckStep(workflow: Record<string, unknown>): Record<string, unknown> {
  const jobs = expectRecord(workflow.jobs, 'workflow.jobs');
  const buildTestLint = expectRecord(jobs['build-test-lint'], 'jobs.build-test-lint');
  const step = expectSteps(buildTestLint).find(
    (candidate) => candidate.run === 'npx turbo run build typecheck',
  );
  expect(step, 'CI should explicitly gate build and typecheck through Turbo').toBeTruthy();
  return step as Record<string, unknown>;
}

describe('CI Workflow (.github/workflows/ci.yml)', () => {
  it('ci.yml file exists', () => {
    expect(existsSync(CI_PATH)).toBe(true);
  });

  describe('workflow configuration', () => {
    let content: string;
    let workflow: Record<string, unknown>;

    beforeAll(() => {
      content = readFileSync(CI_PATH, 'utf-8');
      workflow = parseWorkflowYaml(content);
    });

    it('rejects syntactically invalid CI workflow YAML even when a name is present', () => {
      expect(() =>
        parseWorkflowYaml(`name: CI
on:
  push:
    branches: [main
`),
      ).toThrow(/YAML/);
    });

    it('is valid YAML (parseable by node)', () => {
      expect(() => parseWorkflowYaml(content)).not.toThrow();
    });

    it('has a workflow name', () => {
      expect(workflow.name).toBe('CI');
    });

    it('triggers on push to main', () => {
      const triggers = expectRecord(workflow.on, 'workflow.on');
      const push = expectRecord(triggers.push, 'workflow.on.push');
      expect(push.branches).toEqual(['main']);
    });

    it('triggers on pull_request to main', () => {
      const triggers = expectRecord(workflow.on, 'workflow.on');
      const pullRequest = expectRecord(triggers.pull_request, 'workflow.on.pull_request');
      expect(pullRequest.branches).toEqual(['main']);
    });

    it('uses the repository-pinned minimum supported Node.js version', () => {
      const jobs = expectRecord(workflow.jobs, 'workflow.jobs');
      const buildTestLint = expectRecord(jobs['build-test-lint'], 'jobs.build-test-lint');
      const setupNode = expectSteps(buildTestLint).find((step) => step.uses === 'actions/setup-node@v4');
      expect(setupNode).toBeTruthy();
      const setupNodeWith = expectRecord(setupNode?.with, 'actions/setup-node.with');
      expect(setupNodeWith['node-version-file']).toBe('.nvmrc');
      expect(setupNodeWith['node-version']).toBeUndefined();
    });

    it('runs npm ci for deterministic installs', () => {
      const jobs = expectRecord(workflow.jobs, 'workflow.jobs');
      const buildTestLint = expectRecord(jobs['build-test-lint'], 'jobs.build-test-lint');
      expect(expectSteps(buildTestLint).some((step) => step.run === 'npm ci')).toBe(true);
    });

    it('runs the guarded security audit after deterministic installs', () => {
      expect(content).toContain('npm run audit:security');
      expect(content.indexOf('npm ci')).toBeLessThan(content.indexOf('npm run audit:security'));
    });

    it('enables Corepack and verifies the packageManager-pinned npm before installing', () => {
      expect(content).toContain('npm install -g corepack@0.34.4');
      expect(content).toContain('corepack enable npm');
      expect(content).toContain('corepack prepare "$(node -p "require(\'./package.json\').packageManager")" --activate');
      expect(content).toContain('node scripts/check-package-manager.mjs');
      expect(content.indexOf('npm install -g corepack@0.34.4')).toBeLessThan(content.indexOf('corepack enable npm'));
      expect(content.indexOf('node scripts/check-package-manager.mjs')).toBeLessThan(content.indexOf('npm ci'));
    });

    it('explicitly gates build, typecheck, and the root lint coverage check before running the shared CI test target', () => {
      const buildTypecheckStep = expectBuildTypecheckStep(workflow);
      expect(buildTypecheckStep.name).toBe('Run package build and typecheck');
      expect(content).toMatch(/npx turbo run build typecheck[\s\S]*npm run lint[\s\S]*npm run test:ci/);
      const workspaceLintStep = '\n        run: npm run lint\n';
      expect(content.indexOf('npx turbo run build typecheck')).toBeLessThan(content.indexOf(workspaceLintStep));
      expect(content.indexOf(workspaceLintStep)).toBeLessThan(content.indexOf('npm run test:ci'));
      expect(content).not.toMatch(/turbo run.*build\s+test\s+lint/);
      expect(content).not.toContain('npx turbo run build typecheck lint');
    });

    it('runs the deterministic root Vitest suite through the shared CI test script', () => {
      const packageJson = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8')) as {
        scripts?: Record<string, string>;
      };

      expect(content).toMatch(/name:\s*Run CI test suite/);
      expect(packageJson.scripts?.['test:ci']).toContain('npm run ci:test:root');
      expect(content).not.toMatch(/npm run test:root --/);
      expect(packageJson.scripts?.['test:ci']?.indexOf('npm run ci:test:root')).toBeLessThan(
        packageJson.scripts?.['test:ci']?.indexOf('npm run ci:test:packages') ?? -1,
      );
    });

    it('runs a bootstrap dry-run after deterministic install and fails the workflow on prerequisite errors', () => {
      expect(content).toMatch(/name:\s*Validate bootstrap script \(dry-run\)/);
      expect(content).toContain('npm run bootstrap:dry-run');
      expect(content.indexOf('npm ci')).toBeLessThan(content.indexOf('npm run bootstrap:dry-run'));
      expect(content.indexOf('npm run bootstrap:dry-run')).toBeLessThan(content.indexOf('npm run audit:dependencies'));
      expect(content).toContain('CI_BOOTSTRAP_DRY_RUN: "1"');
    });

    it('runs CI test commands with a fixed deterministic seed matrix', () => {
      expect(content).toContain('deterministic-seed');
      expect(content).toContain("deterministic-seed: ['1337']");
      expect(content).toContain('FRANKENBEAST_SEED: ${{ matrix.deterministic-seed }}');
      expect(content.indexOf('FRANKENBEAST_SEED')).toBeLessThan(content.indexOf('npm run test:ci'));
    });

    it('runs test commands through a configurable retry wrapper', () => {
      const packageJson = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8')) as {
        scripts?: Record<string, string>;
      };

      expect(content).toContain("CI_TEST_RETRIES: ${{ vars.CI_TEST_RETRIES || '2' }}");
      expect(packageJson.scripts?.['ci:test:root']).toBe('node scripts/retry-ci-command.mjs -- npm run test:root');
      expect(packageJson.scripts?.['ci:test:packages']).toBe('node scripts/retry-ci-command.mjs -- npx turbo run test');
      expect(packageJson.scripts?.['ci:test:planner-integration']).toBe(
        'node scripts/retry-ci-command.mjs -- npm run test:integration --workspace @franken/planner',
      );
      expect(packageJson.scripts?.['test:ci']).toBe(
        'npm run build --workspace @franken/types && npm run ci:test:root && npm run ci:test:packages && npm run ci:test:planner-integration',
      );
      expect(content).toContain('npm run test:ci');
      expect(content).not.toContain('run: npm run ci:test:root');
      expect(content).not.toContain('run: npm run ci:test:packages');
      expect(content).not.toContain('run: npm run ci:test:planner-integration');
      expect(content).not.toContain('run: npm run test:root');
      expect(content).not.toContain('run: npx turbo run test');
    });

    it('documents the package build, typecheck, workspace lint, and shared CI test targets in step names', () => {
      expect(content).toMatch(/name:\s*Run package build and typecheck/);
      expect(content).toMatch(/name:\s*Run workspace lint gate/);
      expect(content).toMatch(/name:\s*Run CI test suite/);
    });

    it('keeps workflow linting in a dedicated workflow so broken ci.yml syntax can be reported', () => {
      expect(existsSync(WORKFLOW_LINT_PATH)).toBe(true);
      const workflowLint = readFileSync(WORKFLOW_LINT_PATH, 'utf-8');
      expect(workflowLint).toContain('Lint GitHub Actions workflows');
      expect(workflowLint).toContain('raven-actions/actionlint@v2.1.2');
      expect(workflowLint).toContain('version: 1.7.12');
      expect(workflowLint).toContain("'.github/workflows/**'");
      expect(content).not.toContain('actions/bin/check-yaml');
      expect(content).not.toContain('raven-actions/actionlint');
    });

    it('uses actions/setup-node with npm cache', () => {
      const jobs = expectRecord(workflow.jobs, 'workflow.jobs');
      const buildTestLint = expectRecord(jobs['build-test-lint'], 'jobs.build-test-lint');
      const setupNode = expectSteps(buildTestLint).find((step) => step.uses === 'actions/setup-node@v4');
      expect(setupNode).toBeTruthy();
      const setupNodeWith = expectRecord(setupNode?.with, 'actions/setup-node.with');
      expect(setupNodeWith.cache).toBe('npm');
    });

    it('uses the pinned minimum Node.js version in every CI setup-node step', () => {
      const jobs = expectRecord(workflow.jobs, 'workflow.jobs');
      const nvmrc = readFileSync(resolve(ROOT, '.nvmrc'), 'utf-8').trim();

      for (const [jobName, jobConfig] of Object.entries(jobs)) {
        const job = expectRecord(jobConfig, `jobs.${jobName}`);
        for (const step of expectSteps(job).filter((candidate) => candidate.uses === 'actions/setup-node@v4')) {
          const setupNodeWith = expectRecord(step.with, `${jobName}.actions/setup-node.with`);
          expect(setupNodeWith['node-version-file']).toBe('.nvmrc');
          expect(setupNodeWith['node-version']).toBeUndefined();
        }
      }

      expect(nvmrc).toBe('22.13.0');
    });

    it('uses actions/checkout with full history for root verification tests', () => {
      const jobs = expectRecord(workflow.jobs, 'workflow.jobs');
      const buildTestLint = expectRecord(jobs['build-test-lint'], 'jobs.build-test-lint');
      const checkout = expectSteps(buildTestLint).find((step) => step.uses === 'actions/checkout@v4');
      expect(checkout).toBeTruthy();
      const checkoutWith = expectRecord(checkout?.with, 'actions/checkout.with');
      expect(checkoutWith['fetch-depth']).toBe(0);
    });

    it('runs on ubuntu-latest', () => {
      const jobs = expectRecord(workflow.jobs, 'workflow.jobs');
      const buildTestLint = expectRecord(jobs['build-test-lint'], 'jobs.build-test-lint');
      expect(buildTestLint['runs-on']).toBe('ubuntu-latest');
    });
  });
});

describe('release-please.yml publishes released npm packages', () => {
  it('release-please.yml exists', () => {
    expect(existsSync(RELEASE_PATH)).toBe(true);
  });

  it('references correct config-file path', () => {
    const content = readFileSync(RELEASE_PATH, 'utf-8');
    expect(content).toContain('config-file: release-please-config.json');
  });

  it('references correct manifest-file path', () => {
    const content = readFileSync(RELEASE_PATH, 'utf-8');
    expect(content).toContain('manifest-file: .release-please-manifest.json');
  });

  it('exposes release-please released paths to a publish job', () => {
    const content = readFileSync(RELEASE_PATH, 'utf-8');
    expect(content).toContain('paths_released: ${{ steps.release.outputs.paths_released }}');
    expect(content).toContain('publish-npm:');
    expect(content).toContain('PATHS_RELEASED: ${{ needs.release-please.outputs.paths_released }}');
  });

  it('authenticates npm only in the publish step with the NPM_TOKEN secret and registry auth', () => {
    const content = readFileSync(RELEASE_PATH, 'utf-8');
    expect(content).toContain('registry-url: https://registry.npmjs.org');
    expect(content).toMatch(/- name: Publish released npm packages\n\s+env:\n\s+NODE_AUTH_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}/);
  });

  it('keeps OIDC scoped to the publish job only', () => {
    const content = readFileSync(RELEASE_PATH, 'utf-8');
    expect(content).toMatch(/permissions:\n\s+contents: read\n\njobs:/);
    expect(content).toMatch(/publish-npm:[\s\S]*permissions:\n\s+contents: read\n\s+id-token: write/);
  });

  it('validates build, typecheck, test, and lint before release records are created', () => {
    const content = readFileSync(RELEASE_PATH, 'utf-8');
    expect(content).toContain('validate-release:');
    expect(content).toContain('release-please:\n    needs: validate-release');
    expect(content).toMatch(/Validate release before creating tags[\s\S]*turbo run build typecheck lint[\s\S]*turbo run test/);
    expect(content.indexOf('turbo run build typecheck lint')).toBeLessThan(content.indexOf('turbo run test'));
    expect(content).not.toMatch(/turbo run.*build\s+typecheck\s+test\s+lint/);
  });

  it('enforces the packageManager-pinned npm before release installs and publishes', () => {
    const content = readFileSync(RELEASE_PATH, 'utf-8');
    expect(content.match(/corepack enable npm/g)?.length).toBe(2);
    expect(content.match(/node scripts\/check-package-manager\.mjs/g)?.length).toBe(2);
    expect(content.indexOf('node scripts/check-package-manager.mjs')).toBeLessThan(content.indexOf('npm ci'));
    expect(content.lastIndexOf('node scripts/check-package-manager.mjs')).toBeLessThan(content.lastIndexOf('npm ci'));
  });

  it('routes security audits through the packageManager-pinned npm guard', () => {
    const packageJson = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8')) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.['audit:security']).toBe(
      'node scripts/check-package-manager.mjs && npm audit --audit-level=moderate',
    );
  });

  it('defers npm token enforcement until a public package needs publishing', () => {
    const content = readFileSync(RELEASE_PATH, 'utf-8');
    const tokenCheckIndex = content.indexOf('NPM_TOKEN secret is required to publish $name@$version');
    const privateSkipIndex = content.indexOf('Skipping $package_path: package is private');
    expect(tokenCheckIndex).toBeGreaterThan(privateSkipIndex);
    expect(content).toContain('npm publish "$package_path" --access public --provenance');
  });
});

// release-auto-merge.yml was removed during package consolidation
