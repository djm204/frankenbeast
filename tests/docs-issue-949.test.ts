import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readText = (relativePath: string) => readFileSync(resolve(ROOT, relativePath), 'utf8');

const PACKAGE_RAMP_UP_DOCS = [
  'packages/franken-governor/docs/RAMP_UP.md',
  'packages/franken-critique/docs/RAMP_UP.md',
] as const;

describe('issue #949 package ramp-up status docs', () => {
  it('keeps governor and critique package docs aligned with the consolidated root status', () => {
    const rootRampUp = readText('docs/RAMP_UP.md');

    expect(rootRampUp).toContain('does **not** synthesize permissive passthrough success deps');
    expect(rootRampUp).toContain('FRANKENBEAST_ALLOW_MISSING_SAFETY_MODULES=1');

    for (const docPath of PACKAGE_RAMP_UP_DOCS) {
      const rampUp = readText(docPath);

      expect(rampUp, `${docPath} should link the canonical root ramp-up guide`).toContain('../../../docs/RAMP_UP.md');
      expect(rampUp, `${docPath} should describe the enabled-module integration path`).toMatch(
        /when the (governor|critique) module is enabled/u,
      );
      expect(rampUp, `${docPath} should mention fail-closed unsafe opt-out semantics`).toContain(
        'FRANKENBEAST_ALLOW_MISSING_SAFETY_MODULES=1',
      );
      expect(rampUp, `${docPath} should not claim the package is globally ghosted`).not.toMatch(
        /Status\*\*: \*\*GHOST\*\*/u,
      );
      expect(rampUp, `${docPath} should not claim the package is globally unwired`).not.toContain(
        'currently **unwired**',
      );
    }
  });

  it('phrases remaining governor and critique gaps as narrow current limitations', () => {
    const governorRampUp = readText('packages/franken-governor/docs/RAMP_UP.md');
    const critiqueRampUp = readText('packages/franken-critique/docs/RAMP_UP.md');

    expect(governorRampUp).toContain('## Narrow Integration Notes');
    expect(governorRampUp).toContain('callers remain responsible for supplying live context sources');
    expect(governorRampUp).not.toContain('auto-approves all tasks and budget increases because it uses a no-op governor stub');

    expect(critiqueRampUp).toContain('## Narrow Integration Notes');
    expect(critiqueRampUp).toContain('depends on caller-provided ports');
    expect(critiqueRampUp).not.toContain('skips the reflection phase by using a stub that returns a perfect score');
  });
});
