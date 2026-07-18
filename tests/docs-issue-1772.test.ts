import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const guidePath = 'docs/onboarding/test-command-decision-tree.md';

function readText(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

describe('issue #1772 onboarding test command decision tree', () => {
  it('documents a focused command decision tree for common change surfaces', () => {
    const guide = readText(guidePath);

    for (const requiredText of [
      '# Test command decision tree',
      'Did you only change onboarding/docs copy?',
      'Did you change root scripts, CI metadata, Turbo config, or repository guardrails?',
      "Did you change one package's runtime or tests?",
      'Did you change shared types or cross-package contracts?',
      'Did you change integration, eval, E2E, or live-benchmark behavior?',
      'Are you preparing a CI-equivalent local handoff?',
      'Coordinator/worker handoff shape',
    ]) {
      expect(guide).toContain(requiredText);
    }
  });

  it('anchors decisions to live root scripts instead of stale command names', () => {
    const guide = readText(guidePath);
    const packageJson = JSON.parse(readText('package.json')) as { scripts?: Record<string, string> };

    for (const command of [
      'test:root',
      'test:ci',
      'test:integration',
      'test:eval',
      'test:e2e',
      'test:live:bench',
      'ci:test:e2e',
      'typecheck',
      'lint',
    ]) {
      expect(packageJson.scripts?.[command], `package.json should define ${command}`).toBeTruthy();
      expect(guide).toContain(`npm run ${command}`);
    }

    expect(packageJson.scripts?.['build:all']).toBeUndefined();
    expect(packageJson.scripts?.['test:all']).toBeUndefined();
    expect(guide).toContain('Do not use `npm run build:all` or `npm run test:all`');
  });

  it('covers explicit negative and edge cases so workers do not overclaim verification', () => {
    const guide = readText(guidePath);

    for (const requiredText of [
      'Do not use `npm run build:all` or `npm run test:all`',
      'Do not use `test:eval`, `test:e2e`, or `test:live:bench` as default smoke checks.',
      'Do not treat a dry-run task graph as enough evidence by itself.',
      'Do not run package scripts from a stale shell directory.',
      'npm run build --workspace @franken/<package>',
      'npm run test:integration --workspace @franken/<package>',
      'E2E=true npm run test:root -- tests/integration/e2e-beast-loop.test.ts',
      'npm run ci:test:e2e',
      'Broader gates skipped:',
    ]) {
      expect(guide).toContain(requiredText);
    }
  });

  it('links the decision tree from onboarding and quickstart entrypoints', () => {
    expect(readText('ONBOARDING.md')).toContain('[test command decision tree](docs/onboarding/test-command-decision-tree.md)');
    expect(readText('docs/guides/quickstart.md')).toContain('[test command decision tree](../onboarding/test-command-decision-tree.md)');
  });
});
