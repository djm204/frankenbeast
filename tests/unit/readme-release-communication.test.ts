import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const README = readFileSync(resolve(ROOT, 'README.md'), 'utf-8');

describe('README release communication', () => {
  it('shows the latest release badge and release notes link', () => {
    expect(README).toContain('![Latest release](https://img.shields.io/github/v/release/djm204/frankenbeast?label=release)');
    expect(README).toContain('[Release v0.45.0](https://github.com/djm204/frankenbeast/releases/tag/v0.45.0)');
  });

  it('announces the release highlights to repository visitors', () => {
    expect(README).toContain('## Latest release announcement');
    expect(README).toContain('one-click onboarding');
    expect(README).toContain('security hardening');
    expect(README).toContain('deterministic mode');
  });
});
