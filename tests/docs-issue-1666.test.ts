import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mapPath = 'docs/onboarding/architecture-map.md';
const readText = (relativePath: string) => readFileSync(resolve(ROOT, relativePath), 'utf8');

describe('issue #1666 architecture map for new agent contributors', () => {
  it('links the architecture map from onboarding entrypoints and workspace tour docs', () => {
    const onboarding = readText('ONBOARDING.md');
    const readme = readText('README.md');
    const workspaceTour = readText('scripts/workspace-tour.mjs');

    expect(onboarding).toContain('[architecture map for new agent contributors](docs/onboarding/architecture-map.md)');
    expect(readme).toContain('[architecture map for new agent contributors](docs/onboarding/architecture-map.md)');
    expect(workspaceTour).toContain("doc('architecture-map', 'docs/onboarding/architecture-map.md'");
  });

  it('documents package responsibilities, change recipes, HITL boundaries, and memory boundaries', () => {
    const map = readText(mapPath);

    for (const requiredSection of [
      '# Architecture map for new agent contributors',
      '## Runtime control-loop map',
      '## Package-to-responsibility table',
      '## Common change recipes',
      '## Web and orchestrator boundary',
      '## Approval/HITL boundaries',
      '## Memory boundaries',
      '## Related maps to read next',
    ]) {
      expect(map).toContain(requiredSection);
    }

    for (const requiredPackage of [
      'packages/franken-types/',
      'packages/franken-orchestrator/',
      'packages/franken-mcp-suite/',
      'packages/franken-web/',
      'packages/franken-planner/',
      'packages/franken-brain/',
      'packages/franken-observer/',
      'packages/franken-critique/',
      'packages/franken-governor/',
      'packages/live-bench/',
    ]) {
      expect(map).toContain(requiredPackage);
    }

    for (const requiredGuidance of [
      'Start with the package that owns the user-visible symptom',
      'If an issue touches force-pushes, merges, destructive cleanup, external webhooks, secret material, or production-affecting commands',
      'Runtime working/episodic/semantic memory lives in `@franken/brain`',
      'Observer traces, cost records, and eval telemetry are evidence records, not prompt memory',
      'Hermes/Kanban worker lessons under `tasks/` are repository coordination artifacts',
    ]) {
      expect(map).toContain(requiredGuidance);
    }
  });

  it('keeps markdown links in the architecture map resolvable inside the repository', () => {
    const map = readText(mapPath);
    const linkPattern = /\[[^\]]+\]\((?<href>[^)]+)\)/g;
    const links = [...map.matchAll(linkPattern)].map((match) => match.groups?.href).filter((href): href is string => Boolean(href));

    expect(links).toEqual(expect.arrayContaining([
      '../RAMP_UP.md',
      '../ARCHITECTURE.md',
      '../DATA_FLOW.md',
      '../CONTRACT_MATRIX.md',
      'repository-ownership.md',
      'test-command-decision-tree.md',
    ]));

    for (const href of links) {
      if (/^[a-z]+:/i.test(href) || href.startsWith('#')) continue;
      const [relativePath] = href.split('#');
      expect(existsSync(resolve(ROOT, dirname(mapPath), relativePath)), `Missing linked doc ${href}`).toBe(true);
    }
  });
});
