import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES_DIR = resolve(ROOT, 'packages');

const readText = (relativePath: string) => readFileSync(resolve(ROOT, relativePath), 'utf8');
const readJson = <T>(relativePath: string): T => JSON.parse(readText(relativePath)) as T;

const activePackages = () =>
  readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(resolve(PACKAGES_DIR, entry.name, 'package.json')))
    .map((entry) => {
      const packageJson = readJson<{ name?: string }>(`packages/${entry.name}/package.json`);
      return { dir: entry.name, name: packageJson.name ?? '' };
    })
    .sort((left, right) => left.dir.localeCompare(right.dir));

const currentDocs = [
  'README.md',
  'CLAUDE.md',
  'docs/ARCHITECTURE.md',
  'docs/DATA_FLOW.md',
  'docs/onboarding/RAMP_UP.md',
  'docs/project-overview.md',
  'docs/guides/add-llm-provider.md',
  'docs/guides/quickstart.md',
  'docs/guides/wrap-external-agent.md',
];

const removedStandalonePackagePattern =
  /(?<![\w@/-])(?:frankenfirewall|franken-skills|franken-heartbeat|franken-mcp|franken-comms)(?![-\w/])/u;

describe('issue #2631 current docs package inventory', () => {
  it('keeps the README current package table aligned to packages/*', () => {
    const readme = readText('README.md');
    const packages = activePackages();

    expect(packages).toHaveLength(10);
    for (const { name } of packages) {
      expect(readme, `README should list ${name}`).toContain(`| \`${name}\` |`);
    }
    expect(readme).toContain('current ten-package inventory');
    expect(readme).toContain('consolidated into `@franken/orchestrator` and `@franken/mcp-suite`');
  });

  it('does not name removed standalone packages in current docs', () => {
    for (const doc of currentDocs) {
      expect(readText(doc), `${doc} should point to current packages instead`).not.toMatch(
        removedStandalonePackagePattern,
      );
    }
  });
});
