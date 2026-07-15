import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readText = (relativePath: string) => readFileSync(resolve(ROOT, relativePath), 'utf8');

describe('issue #2098 critique ramp-up wiring status docs', () => {
  it('documents the current orchestrator critique wiring and fallback conditions', () => {
    const rampUp = readText('packages/franken-critique/docs/RAMP_UP.md');

    expect(rampUp).toContain('**Status**: **Integrated safety module**');
    expect(rampUp).toContain('loads `@franken/critique` when the critique module is enabled');
    expect(rampUp).toContain('`createCritiqueDeps()`');
    expect(rampUp).toContain('`CritiquePortAdapter`');
    expect(rampUp).toContain('`stubCritique`');
    expect(rampUp).toContain('`FRANKENBEAST_ALLOW_MISSING_SAFETY_MODULES=1`');

    expect(rampUp).not.toMatch(/\bGHOST\b/u);
    expect(rampUp).not.toContain('currently **unwired**');
    expect(rampUp).not.toContain('skips the reflection phase by using a stub that returns a perfect score');
    expect(rampUp).not.toContain('real critique-loop wiring as future work');
  });
});
