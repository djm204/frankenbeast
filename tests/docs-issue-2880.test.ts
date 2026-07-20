import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readDoc = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

const workspacePackages = () => readdirSync(resolve(ROOT, 'packages'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .filter((entry) => existsSync(resolve(ROOT, 'packages', entry.name, 'package.json')))
  .map((entry) => entry.name)
  .sort();

const packageRows = () => readDoc('docs/onboarding/RAMP_UP.md')
  .split('\n')
  .map((line) => line.match(/^\| `packages\/(?<dir>[^/`]+)\/`/u)?.groups?.dir)
  .filter((dir): dir is string => dir !== undefined)
  .sort();

describe('issue #2880 package metadata alignment', () => {
  it('keeps RAMP_UP package list and count aligned with workspace metadata', () => {
    const rampUp = readDoc('docs/onboarding/RAMP_UP.md');
    const workspacePackageDirs = workspacePackages();
    const listedPackageDirs = packageRows();

    expect(rampUp).toContain(`contains **${workspacePackageDirs.length} first-party packages**`);
    expect(listedPackageDirs).toEqual(workspacePackageDirs);
  });

  it('includes explicit entries for recently added packages', () => {
    const rampUp = readDoc('docs/onboarding/RAMP_UP.md');

    expect(rampUp).toContain('packages/franken-mcp-suite/');
    expect(rampUp).toContain('packages/live-bench/');
  });
});
