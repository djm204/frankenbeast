import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const README = readFileSync(resolve(ROOT, 'README.md'), 'utf-8');

describe('README release communication', () => {
  it('links to version-independent release information', () => {
    expect(README).toContain('[![Latest root release](https://img.shields.io/github/v/release/djm204/frankenbeast?filter=v*&label=release)](https://github.com/djm204/frankenbeast/releases?q=v*&expanded=true)');
    expect(README).toContain('[GitHub Releases](https://github.com/djm204/frankenbeast/releases)');
    expect(README).toContain('[CHANGELOG.md](CHANGELOG.md)');
  });

  it('does not pin a release version or future announcement instructions', () => {
    expect(README).not.toMatch(/\[Release v\d+\.\d+\.\d+\][^\n]*is the latest Frankenbeast release line\./);
    expect(README).not.toContain('Community announcement target:');
  });
});
