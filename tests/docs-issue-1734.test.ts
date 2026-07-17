import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const fixturePath = 'examples/agent-practice-fixture';

function readText(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T;
}

describe('issue #1734 agent practice fixture', () => {
  it('ships an intentionally buggy fixture with a test, solution, reset script, and docs', () => {
    for (const path of [
      `${fixturePath}/package.json`,
      `${fixturePath}/README.md`,
      `${fixturePath}/src/scoreboard.js`,
      `${fixturePath}/test/scoreboard.test.js`,
      `${fixturePath}/fixtures/buggy/scoreboard.js`,
      `${fixturePath}/fixtures/solution/scoreboard.js`,
      `${fixturePath}/scripts/reset.js`,
      'docs/onboarding/sample-agent-practice-issue.md',
    ]) {
      expect(existsSync(resolve(ROOT, path)), `${path} should exist`).toBe(true);
    }

    expect(readText(`${fixturePath}/test/scoreboard.test.js`)).toContain('Grace: 5\\nKatherine: 3\\nAda: 2');
    expect(readText(`${fixturePath}/src/scoreboard.js`)).toBe(readText(`${fixturePath}/fixtures/buggy/scoreboard.js`));
    expect(readText(`${fixturePath}/fixtures/solution/scoreboard.js`)).toContain('.sort((left, right) => right.score - left.score');
    expect(readText(`${fixturePath}/README.md`)).toContain('npm run reset');
    expect(readText('docs/onboarding/sample-agent-practice-issue.md')).toContain('Only edit files under `examples/agent-practice-fixture`');
  });

  it('keeps the practice fixture outside production workspaces and root test discovery', () => {
    const rootPackage = readJson<{ workspaces?: string[] }>('package.json');
    const fixturePackage = readJson<{ private?: boolean; scripts?: Record<string, string> }>(`${fixturePath}/package.json`);
    const vitestConfig = readText('vitest.config.ts');

    expect(rootPackage.workspaces).toEqual(['packages/*']);
    expect(rootPackage.workspaces).not.toContain('examples/*');
    expect(fixturePackage.private).toBe(true);
    expect(fixturePackage.scripts?.test).toBe('node --test test/*.test.js');
    expect(vitestConfig).toContain("? ['tests/**/*.test.ts']");
    expect(vitestConfig).not.toMatch(/examples\/[*][*]\/[*.]test/u);
  });

  it('links the fixture from onboarding entrypoints', () => {
    expect(readText('ONBOARDING.md')).toContain('examples/agent-practice-fixture');
    expect(readText('README.md')).toContain('examples/agent-practice-fixture');
  });
});
