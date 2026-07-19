import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const readText = (relativePath: string) => readFileSync(resolve(ROOT, relativePath), 'utf8');

describe('issue #3392 concise agent onboarding path', () => {
  it('keeps the full guide under docs/onboarding and the old path as a compatibility pointer', () => {
    const canonicalPath = 'docs/onboarding/RAMP_UP.md';
    const compatibilityPath = 'docs/RAMP_UP.md';
    const canonical = readText(canonicalPath);
    const compatibility = readText(compatibilityPath);

    expect(existsSync(resolve(ROOT, canonicalPath))).toBe(true);
    expect(canonical).toContain('# Frankenbeast Agent Ramp-Up');
    expect(canonical).toContain('## The Beast Loop (4 Phases)');
    expect(compatibility).toContain('[`docs/onboarding/RAMP_UP.md`](onboarding/RAMP_UP.md)');
    expect(compatibility).not.toContain('## The Beast Loop (4 Phases)');
  });

  it('uses the canonical onboarding path from primary discovery entrypoints', () => {
    for (const entrypoint of ['README.md', 'ONBOARDING.md', 'docs/onboarding/README.md']) {
      expect(readText(entrypoint), `${entrypoint} should link the canonical ramp-up guide`).toContain(
        entrypoint === 'docs/onboarding/README.md' ? '(RAMP_UP.md)' : 'docs/onboarding/RAMP_UP.md',
      );
    }
  });
});
