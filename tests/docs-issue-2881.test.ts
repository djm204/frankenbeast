import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');

function readDoc(path: string) {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

describe('issue #2881', () => {
  it('documents npm version and toolchain prerequisites in RAMP_UP', () => {
    const manifest = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
    const rampUp = readDoc('docs/RAMP_UP.md');

    expect(rampUp).toContain('## Prerequisites');
    expect(rampUp).toContain('root `package.json` `packageManager` field (`' + manifest.packageManager + '`)');
    expect(rampUp).toContain('root `package.json` `engines.node` field (`' + `${manifest.engines?.node ?? ''}` + '`)');
    expect(rampUp).toContain('corepack --version');
    expect(rampUp).toContain('corepack enable npm');
    expect(rampUp).toContain("corepack prepare \"$(node -p \"require('./package.json').packageManager\")\" --activate");
    expect(rampUp).toContain('npm run setup:healthcheck');
    expect(rampUp).toContain('For a narrower npm-only validation');
    expect(rampUp).toContain('npm run check:package-manager');
  });
});
