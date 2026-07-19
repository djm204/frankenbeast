import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');

function readDoc(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

const manifest = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
  packageManager: string;
  engines?: { node?: string };
};

describe('issue #2881 onboarding npm prereqs', () => {
  it('derives toolchain requirements from root package metadata', () => {
    const rampUp = readDoc('docs/RAMP_UP.md');

    expect(rampUp).toContain('## Prerequisites');
    expect(rampUp).toContain('root `package.json` `packageManager` field (`' + manifest.packageManager + ')');
    expect(rampUp).toContain('root `package.json` `engines.node` field (`' + `${manifest.engines?.node ?? ''}` + ')');
    expect(rampUp).toContain("corepack prepare \"$(node -p \"require('./package.json').packageManager\")\" --activate");
    expect(rampUp).toContain('npm run check:package-manager');
    expect(rampUp).toContain('npm run setup:healthcheck');
  });
});
