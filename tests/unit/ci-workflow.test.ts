import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { load } from 'js-yaml';

const ROOT = resolve(import.meta.dirname, '..', '..');
const CI_PATH = resolve(ROOT, '.github/workflows/ci.yml');
const RELEASE_PATH = resolve(ROOT, '.github/workflows/release-please.yml');
const WORKFLOW_LINT_PATH = resolve(ROOT, '.github/workflows/workflow-lint.yml');
const NPMRC_PATH = resolve(ROOT, '.npmrc');

function packageManifestPaths(): string[] {
  const packageDirs = readdirSync(resolve(ROOT, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(ROOT, 'packages', entry.name, 'package.json'))
    .filter((path) => existsSync(path));

  return [resolve(ROOT, 'package.json'), ...packageDirs];
}

function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

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

function expectCiJob(workflow: Record<string, unknown>): Record<string, unknown> {
  const jobs = expectRecord(workflow.jobs, 'workflow.jobs');
  return expectRecord(jobs['build-test-lint'], 'jobs.build-test-lint');
}

function expectSetupNodeUsesPinnedNvmrc(step: Record<string, unknown>, label: string): void {
  const setupNodeWith = expectRecord(step.with, `${label}.actions/setup-node.with`);
  expect(setupNodeWith['node-version-file']).toBe('.nvmrc');
  expect(setupNodeWith['node-version']).toBeUndefined();

  for (const key of Object.keys(setupNodeWith)) {
    expect(key, `${label} should not configure malformed Node version inputs`).not.toMatch(
      /^node-version(?:$|-(?!file$))/,
    );
  }
}

function expectStepByRun(
  steps: Array<Record<string, unknown>>,
  run: string,
  label: string,
): Record<string, unknown> {
  const step = steps.find((candidate) => candidate.run === run);
  expect(step, `CI should include ${label}`).toBeTruthy();
  return step as Record<string, unknown>;
}

function expectStepByName(
  steps: Array<Record<string, unknown>>,
  name: string,
  label: string,
): Record<string, unknown> {
  const step = steps.find((candidate) => candidate.name === name);
  expect(step, `CI should include ${label}`).toBeTruthy();
  return step as Record<string, unknown>;
}

function expectBuildTypecheckStep(workflow: Record<string, unknown>): Record<string, unknown> {
  return expectStepByRun(
    expectSteps(expectCiJob(workflow)),
    'npx turbo run build typecheck',
    'a Turbo build/typecheck step',
  );
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

    it('has required top-level workflow keys', () => {
      expect(workflow).toHaveProperty('name');
      expect(workflow).toHaveProperty('on');
      expect(workflow).toHaveProperty('jobs');
    });

    it('has a workflow name', () => {
      expect(workflow.name).toBe('CI');
    });

    it('explicitly limits CI push and pull_request triggers to the main branch', () => {
      const triggers = expectRecord(workflow.on, 'workflow.on');

      expect(Object.keys(triggers).sort()).toEqual(['pull_request', 'push']);
      expect(expectRecord(triggers.push, 'workflow.on.push')).toEqual({ branches: ['main'] });
      expect(expectRecord(triggers.pull_request, 'workflow.on.pull_request')).toEqual({ branches: ['main'] });
    });

    it('uses the repository-pinned minimum supported Node.js version', () => {
      const setupNode = expectSteps(expectCiJob(workflow)).find((step) => step.uses === 'actions/setup-node@v4');
      expect(setupNode).toBeTruthy();
      expectSetupNodeUsesPinnedNvmrc(setupNode as Record<string, unknown>, 'build-test-lint');
    });

    it('runs npm ci for deterministic installs', () => {
      expectStepByRun(expectSteps(expectCiJob(workflow)), 'npm ci', 'a deterministic npm install step');
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
      const steps = expectSteps(expectCiJob(workflow));
      const buildTypecheckStep = expectBuildTypecheckStep(workflow);
      const workspaceLintStep = expectStepByRun(steps, 'npm run lint', 'a workspace lint gate step');
      const ciTestStep = expectStepByRun(steps, 'npm run test:ci', 'the shared root/package CI test target');

      expect(buildTypecheckStep.name).toBe('Run package build and typecheck');
      expect(workspaceLintStep.name).toBe('Run workspace lint gate');
      expect(ciTestStep.name).toBe('Run root and package CI test suite');
      expect(steps.indexOf(buildTypecheckStep)).toBeLessThan(steps.indexOf(workspaceLintStep));
      expect(steps.indexOf(workspaceLintStep)).toBeLessThan(steps.indexOf(ciTestStep));
      expect(content).not.toMatch(/turbo run.*build\s+test\s+lint/);
      expect(content).not.toContain('npx turbo run build typecheck lint');
    });

    it('runs the deterministic root Vitest suite through the shared CI test script', () => {
      const packageJson = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8')) as {
        scripts?: Record<string, string>;
      };
      const steps = expectSteps(expectCiJob(workflow));
      const ciTestStep = expectStepByName(
        steps,
        'Run root and package CI test suite',
        'the shared root/package CI test target',
      );
      const testCiScript = packageJson.scripts?.['test:ci'] ?? '';

      expect(ciTestStep.run).toBe('npm run test:ci');
      const e2eStep = expectStepByName(
        steps,
        'Run orchestrator E2E smoke CI suite',
        'the orchestrator E2E smoke gate',
      );
      expect(e2eStep.run).toBe('npm run ci:test:e2e');
      expect(packageJson.scripts?.['ci:test:root']).toBe('node scripts/retry-ci-command.mjs -- npm run test:root');
      expect(packageJson.scripts?.['ci:test:e2e']).toBe(
        'node scripts/retry-ci-command.mjs -- npm run test:e2e -- tests/e2e/smoke.test.ts tests/e2e/chat/chat-e2e.test.ts',
      );
      expect(testCiScript).toContain('npm run ci:test:root');
      expect(testCiScript.indexOf('npm run ci:test:root')).toBeLessThan(testCiScript.indexOf('npm run ci:test:packages'));
      expect(content.indexOf('npm run test:ci')).toBeLessThan(content.indexOf('npm run ci:test:e2e'));
      expect(content).not.toMatch(/npm run test:root --/);
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
      expect(packageJson.scripts?.['ci:test:observer-eval']).toBe(
        'node scripts/retry-ci-command.mjs -- npm run test:eval --workspace @franken/observer',
      );
      expect(packageJson.scripts?.['ci:test:e2e']).toBe(
        'node scripts/retry-ci-command.mjs -- npm run test:e2e -- tests/e2e/smoke.test.ts tests/e2e/chat/chat-e2e.test.ts',
      );
      expect(packageJson.scripts?.['test:ci']).toBe(
        'npm run build --workspace @franken/types && npm run ci:test:root && npm run ci:test:packages && npm run ci:test:planner-integration && npm run ci:test:observer-eval',
      );
      expect(content).toContain('npm run test:ci');
      expect(content).toContain('run: npm run ci:test:e2e');
      expect(content).not.toContain('run: npm run ci:test:root');
      expect(content).not.toContain('run: npm run ci:test:packages');
      expect(content).not.toContain('run: npm run ci:test:planner-integration');
      expect(content).not.toContain('run: npm run ci:test:observer-eval');
      expect(content).not.toContain('run: npm run test:root');
      expect(content).not.toContain('run: npx turbo run test');
    });

    it('documents the package build, typecheck, workspace lint, and shared root/package CI test targets in step names', () => {
      expect(content).toMatch(/name:\s*Run package build and typecheck/);
      expect(content).toMatch(/name:\s*Run workspace lint gate/);
      expect(content).toMatch(/name:\s*Run root and package CI test suite/);
      expect(content).toMatch(/name:\s*Run orchestrator E2E smoke CI suite/);
    });

    it('keeps workflow linting in a dedicated workflow so broken ci.yml syntax can be reported', () => {
      expect(existsSync(WORKFLOW_LINT_PATH)).toBe(true);
      const workflowLint = readFileSync(WORKFLOW_LINT_PATH, 'utf-8');
      expect(workflowLint).toContain('Lint GitHub Actions workflows');
      expect(workflowLint).toContain('raven-actions/actionlint@v2.2.0');
      expect(workflowLint).toContain('version: 1.7.12');
      expect(workflowLint).toContain("'.github/workflows/**'");
      expect(content).not.toContain('actions/bin/check-yaml');
      expect(content).not.toContain('raven-actions/actionlint');
    });

    it('uses actions/setup-node with npm cache', () => {
      const setupNode = expectSteps(expectCiJob(workflow)).find((step) => step.uses === 'actions/setup-node@v4');
      expect(setupNode).toBeTruthy();
      const setupNodeWith = expectRecord(setupNode?.with, 'actions/setup-node.with');
      expect(setupNodeWith.cache).toBe('npm');
    });

    it('uses the pinned minimum Node.js version in every CI setup-node step', () => {
      const jobs = expectRecord(workflow.jobs, 'workflow.jobs');
      const nvmrc = readFileSync(resolve(ROOT, '.nvmrc'), 'utf-8').trim();
      expect(nvmrc).toMatch(/^\d+\.\d+\.\d+$/);

      for (const [jobName, jobConfig] of Object.entries(jobs)) {
        const job = expectRecord(jobConfig, `jobs.${jobName}`);
        for (const step of expectSteps(job).filter((candidate) => candidate.uses === 'actions/setup-node@v4')) {
          expectSetupNodeUsesPinnedNvmrc(step, jobName);
        }
      }

      expect(nvmrc).toBe('22.13.0');
    });

    it('does not schedule unsupported Node 20 test jobs', () => {
      const jobs = expectRecord(workflow.jobs, 'workflow.jobs');
      const serializedJobs = JSON.stringify(jobs);

      expect(serializedJobs).not.toContain('"node-version":');
      expect(serializedJobs).not.toMatch(/\b20(?:\.\d+)?\b/);
    });

    it('keeps package engines aligned with the Node baseline exercised in CI', () => {
      const rootPackage = readJsonFile<{ engines?: { node?: string } }>(resolve(ROOT, 'package.json'));
      const rootNodeRange = rootPackage.engines?.node;
      expect(rootNodeRange).toBe('>=22.13.0 <23 || >=24.0.0 <26');
      expect(rootNodeRange).not.toContain('20');
      expect(readFileSync(NPMRC_PATH, 'utf-8')).toContain('engine-strict=true');

      for (const manifestPath of packageManifestPaths()) {
        const manifest = readJsonFile<{ name?: string; engines?: { node?: string } }>(manifestPath);
        expect(manifest.engines?.node, `${manifest.name ?? manifestPath} should match root Node engines`).toBe(rootNodeRange);
      }
    });

    it('uses actions/checkout with full history for root verification tests', () => {
      const checkout = expectSteps(expectCiJob(workflow)).find((step) => step.uses === 'actions/checkout@v4');
      expect(checkout).toBeTruthy();
      const checkoutWith = expectRecord(checkout?.with, 'actions/checkout.with');
      expect(checkoutWith['fetch-depth']).toBe(0);
    });

    it('runs on ubuntu-latest', () => {
      expect(expectCiJob(workflow)['runs-on']).toBe('ubuntu-latest');
    });
  });
});

describe('release-please.yml publishes released npm packages', () => {
  let content: string;
  let workflow: Record<string, unknown>;
  let jobs: Record<string, unknown>;
  let releasePlease: Record<string, unknown>;
  let publishNpm: Record<string, unknown>;
  let releaseStep: Record<string, unknown>;

  beforeAll(() => {
    content = readFileSync(RELEASE_PATH, 'utf-8');
    workflow = parseWorkflowYaml(content);
    jobs = expectRecord(workflow.jobs, 'release workflow jobs');
    releasePlease = expectRecord(jobs['release-please'], 'jobs.release-please');
    publishNpm = expectRecord(jobs['publish-npm'], 'jobs.publish-npm');
    const matchingReleaseStep = expectSteps(releasePlease).find(
      (step) => step.uses === 'googleapis/release-please-action@v5',
    );
    if (!matchingReleaseStep) {
      throw new Error('release-please action v5 step should be present');
    }
    releaseStep = matchingReleaseStep;
  });

  it('release-please.yml exists', () => {
    expect(existsSync(RELEASE_PATH)).toBe(true);
  });

  it('rejects syntactically invalid release workflow YAML even when release keys are present', () => {
    expect(() =>
      parseWorkflowYaml(`name: Release Please
on:
  push:
    branches: [main
jobs:
  release-please:
    steps:
      - uses: googleapis/release-please-action@v5
`),
    ).toThrow(/YAML/);
  });

  it('is valid YAML and triggers only on push to main', () => {
    expect(workflow.name).toBe('Release Please');
    const triggers = expectRecord(workflow.on, 'release workflow on');
    const push = expectRecord(triggers.push, 'release workflow on.push');
    expect(push.branches).toEqual(['main']);
    expect(triggers.pull_request).toBeUndefined();
  });

  it('keeps release-please permissions scoped to the release job', () => {
    expect(expectRecord(workflow.permissions, 'release workflow root permissions')).toEqual({ contents: 'read' });
    expect(expectRecord(releasePlease.permissions, 'release-please permissions')).toEqual({
      contents: 'write',
      'pull-requests': 'write',
    });
  });

  it('anchors config-file and manifest-file under the release-please action step', () => {
    expect(releaseStep.id).toBe('release');
    const releaseWith = expectRecord(releaseStep.with, 'release-please action with');
    expect(releaseWith['config-file']).toBe('release-please-config.json');
    expect(releaseWith['manifest-file']).toBe('.release-please-manifest.json');
  });

  it('exposes release-please released paths to a publish job', () => {
    expect(expectRecord(releasePlease.outputs, 'release-please outputs').paths_released).toBe(
      '${{ steps.release.outputs.paths_released }}',
    );
    expect(publishNpm.needs).toBe('release-please');
    expect(expectRecord(publishNpm.env, 'publish-npm env').PATHS_RELEASED).toBe(
      '${{ needs.release-please.outputs.paths_released }}',
    );
  });

  it('authenticates npm only in the publish step with the NPM_TOKEN secret and registry auth', () => {
    const publishSteps = expectSteps(publishNpm);
    const setupNode = publishSteps.find((step) => step.uses === 'actions/setup-node@v4');
    expect(setupNode).toBeTruthy();
    expect(expectRecord(setupNode?.with, 'publish setup-node with')['registry-url']).toBe('https://registry.npmjs.org');

    const publishStep = publishSteps.find((step) => step.name === 'Publish released npm packages');
    expect(publishStep).toBeTruthy();
    expect(expectRecord(publishStep?.env, 'publish step env').NODE_AUTH_TOKEN).toBe('${{ secrets.NPM_TOKEN }}');
  });

  it('keeps OIDC scoped to the publish job only', () => {
    expect(expectRecord(workflow.permissions, 'release workflow root permissions')).toEqual({ contents: 'read' });
    expect(expectRecord(publishNpm.permissions, 'publish-npm permissions')).toEqual({
      contents: 'read',
      'id-token': 'write',
    });
  });

  it('validates build, typecheck, test, and lint before release records are created', () => {
    const validateRelease = expectRecord(jobs['validate-release'], 'jobs.validate-release');
    expect(releasePlease.needs).toBe('validate-release');
    const validationStep = expectSteps(validateRelease).find((step) => step.name === 'Validate release before creating tags');
    expect(validationStep).toBeTruthy();
    const validationRun = String(validationStep?.run ?? '');
    expect(validationRun).toContain('turbo run build typecheck lint');
    expect(validationRun).toContain('turbo run test');
    expect(validationRun).toContain('npm run ci:test:observer-eval');
    expect(validationRun.indexOf('turbo run build typecheck lint')).toBeLessThan(validationRun.indexOf('turbo run test'));
    expect(validationRun.indexOf('turbo run test')).toBeLessThan(validationRun.indexOf('npm run ci:test:observer-eval'));
    expect(validationRun).not.toMatch(/turbo run.*build\s+typecheck\s+test\s+lint/);
  });

  it('enforces the packageManager-pinned npm before release installs and publishes', () => {
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

  it('does not demote component-only latest releases unless a root release exists to promote', () => {
    const releaseLatestStep = expectSteps(releasePlease).find(
      (step) => step.name === 'Ensure only root release is marked latest',
    );
    expect(releaseLatestStep).toBeTruthy();
    const releaseLatestRun = String(releaseLatestStep?.run ?? '');

    const rootLookupIndex = releaseLatestRun.indexOf('root_tag=$(gh release list');
    const emptyRootNormalizationIndex = releaseLatestRun.indexOf('.tagName // empty');
    const noRootGuardIndex = releaseLatestRun.indexOf(
      'No root release found; leaving component latest unchanged',
    );
    const demoteIndex = releaseLatestRun.indexOf('gh release edit "$latest_tag" --latest=false');
    const promoteIndex = releaseLatestRun.indexOf('gh release edit "$root_tag" --latest');

    expect(rootLookupIndex).toBeGreaterThan(-1);
    expect(releaseLatestRun).toContain('gh release list --limit 1000 --json tagName');
    expect(emptyRootNormalizationIndex).toBeGreaterThan(rootLookupIndex);
    expect(noRootGuardIndex).toBeGreaterThan(emptyRootNormalizationIndex);
    expect(demoteIndex).toBeGreaterThan(noRootGuardIndex);
    expect(promoteIndex).toBeGreaterThan(demoteIndex);
    expect(releaseLatestRun).toContain('if [ -z "$root_tag" ]; then');
    expect(releaseLatestRun).toContain('exit 0');
  });

  it('defers npm token enforcement until a public package needs publishing', () => {
    const publishStep = expectSteps(publishNpm).find((step) => step.name === 'Publish released npm packages');
    const publishRun = String(publishStep?.run ?? '');
    const tokenCheckIndex = publishRun.indexOf('NPM_TOKEN secret is required to publish $name@$version');
    const privateSkipIndex = publishRun.indexOf('Skipping $package_path: package is private');
    expect(tokenCheckIndex).toBeGreaterThan(privateSkipIndex);
    expect(publishRun).toContain('npm publish "$package_path" --access public --provenance');
  });

  it('does not demote a component latest release unless a root release can be promoted', () => {
    const latestStep = expectSteps(releasePlease).find((step) => step.name === 'Ensure only root release is marked latest');
    expect(latestStep).toBeTruthy();

    const latestRun = String(latestStep?.run ?? '');
    const rootLookupIndex = latestRun.indexOf('root_tag=$(gh release list');
    const missingRootGuardIndex = latestRun.indexOf('No root release found; leaving component latest unchanged');
    const demoteIndex = latestRun.indexOf('gh release edit "$latest_tag" --latest=false');
    const promoteIndex = latestRun.indexOf('gh release edit "$root_tag" --latest');

    expect(rootLookupIndex).toBeGreaterThan(-1);
    expect(latestRun).toContain('gh release list --limit 1000 --json tagName');
    expect(missingRootGuardIndex).toBeGreaterThan(rootLookupIndex);
    expect(demoteIndex).toBeGreaterThan(missingRootGuardIndex);
    expect(promoteIndex).toBeGreaterThan(demoteIndex);
    expect(latestRun).toContain('[0].tagName // empty');
  });
});

// release-auto-merge.yml was removed during package consolidation
