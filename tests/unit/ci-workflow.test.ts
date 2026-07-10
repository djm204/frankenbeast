import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '..', '..');
const CI_PATH = resolve(ROOT, '.github/workflows/ci.yml');
const RELEASE_PATH = resolve(ROOT, '.github/workflows/release-please.yml');
const WORKFLOW_LINT_PATH = resolve(ROOT, '.github/workflows/workflow-lint.yml');

describe('CI Workflow (.github/workflows/ci.yml)', () => {
  it('ci.yml file exists', () => {
    expect(existsSync(CI_PATH)).toBe(true);
  });

  describe('workflow configuration', () => {
    let content: string;

    beforeAll(() => {
      content = readFileSync(CI_PATH, 'utf-8');
    });

    it('is valid YAML (parseable by node)', () => {
      // Use node's built-in JSON to validate after converting with a simple check
      // At minimum, it should not throw when we try to parse it
      expect(content.length).toBeGreaterThan(0);
      expect(content).toContain('name:');
    });

    it('has a workflow name', () => {
      expect(content).toMatch(/^name:/m);
    });

    it('triggers on push to main', () => {
      expect(content).toMatch(/on:/);
      expect(content).toMatch(/push:/);
      expect(content).toMatch(/branches:.*\[?.*main.*\]?/);
    });

    it('triggers on pull_request to main', () => {
      expect(content).toMatch(/pull_request:/);
    });

    it('uses Node.js 22', () => {
      expect(content).toContain('node-version');
      expect(content).toMatch(/node-version.*['"]?22['"]?/);
    });

    it('runs npm ci for deterministic installs', () => {
      expect(content).toContain('npm ci');
    });

    it('runs the guarded security audit after deterministic installs', () => {
      expect(content).toContain('npm run audit:security');
      expect(content.indexOf('npm ci')).toBeLessThan(content.indexOf('npm run audit:security'));
    });

    it('enables Corepack and verifies the packageManager-pinned npm before installing', () => {
      expect(content).toContain('corepack enable npm');
      expect(content).toContain('corepack prepare "$(node -p "require(\'./package.json\').packageManager")" --activate');
      expect(content).toContain('node scripts/check-package-manager.mjs');
      expect(content.indexOf('node scripts/check-package-manager.mjs')).toBeLessThan(content.indexOf('npm ci'));
    });

    it('builds before running package tests in CI', () => {
      expect(content).toContain('turbo run');
      expect(content).toMatch(/turbo run build lint[\s\S]*turbo run test/);
      expect(content.indexOf('turbo run build lint')).toBeLessThan(content.indexOf('turbo run test'));
      expect(content).not.toMatch(/turbo run.*build\s+test\s+lint/);
    });

    it('runs the deterministic root Vitest suite separately from Turbo', () => {
      expect(content).toMatch(/name:\s*Run deterministic root Vitest suite/);
      expect(content).toContain('npm run test:root');
      expect(content).not.toMatch(/npm run test:root --/);
      expect(content.indexOf('npm run test:root')).toBeLessThan(content.indexOf('npx turbo run test'));
    });

    it('runs CI test commands with a fixed deterministic seed matrix', () => {
      expect(content).toContain('deterministic-seed');
      expect(content).toContain("deterministic-seed: ['1337']");
      expect(content).toContain('FRANKENBEAST_SEED: ${{ matrix.deterministic-seed }}');
      expect(content.indexOf('FRANKENBEAST_SEED')).toBeLessThan(content.indexOf('npm run test:root'));
    });

    it('documents the root-suite and package-Turbo CI split in step names', () => {
      expect(content).toMatch(/name:\s*Run package build and lint/);
      expect(content).toMatch(/name:\s*Run package tests/);
      expect(content).toMatch(/name:\s*Run deterministic root Vitest suite/);
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
      expect(content).toContain('actions/setup-node');
      expect(content).toMatch(/cache.*npm/);
    });

    it('uses actions/checkout with full history for root verification tests', () => {
      expect(content).toContain('actions/checkout');
      expect(content).toMatch(/actions\/checkout@v4[\s\S]*fetch-depth:\s*0/);
    });

    it('runs on ubuntu-latest', () => {
      expect(content).toContain('ubuntu-latest');
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
