import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readText = (relativePath: string) => readFileSync(resolve(ROOT, relativePath), 'utf8');

describe('issue #2099 governor ramp-up wiring status docs', () => {
  it('documents current governor wiring instead of stale ghost/stub-only status', () => {
    const rampUp = readText('packages/franken-governor/docs/RAMP_UP.md');

    expect(rampUp).toContain('**Status**: **Integrated safety module**');
    expect(rampUp).toContain('loads `@franken/governor` when the governor module is enabled');
    expect(rampUp).toContain('falls back to the local passthrough governor only when the module is explicitly disabled');
    expect(rampUp).toContain('`GovernorPortAdapter`');
    expect(rampUp).toContain('`CliChannel`');
    expect(rampUp).toContain('Non-TTY CLI runs reject approvals by default');
    expect(rampUp).toContain('`FRANKENBEAST_ALLOW_NONINTERACTIVE_APPROVAL=1`');
    expect(rampUp).toContain('`FRANKENBEAST_ALLOW_MISSING_SAFETY_MODULES=1`');

    expect(rampUp).not.toMatch(/\bGHOST\b/u);
    expect(rampUp).not.toContain('currently **unwired**');
    expect(rampUp).not.toContain('auto-approves all tasks and budget increases because it uses a no-op governor stub');
  });
});
