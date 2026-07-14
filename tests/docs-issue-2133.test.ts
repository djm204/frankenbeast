import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readDoc = (relativePath: string) => readFileSync(resolve(ROOT, relativePath), 'utf8');

const customPortProxyCommand = 'VITE_API_PROXY_TARGET=http://127.0.0.1:4242';
const staleDirectUrlCommand = 'VITE_API_URL=http://127.0.0.1:4242';

describe('issue #2133 dashboard custom-port docs', () => {
  it('keeps the local dashboard chat guide on the Vite proxy custom-port path', () => {
    const guide = readDoc('docs/guides/run-dashboard-chat.md');

    expect(guide).toContain(customPortProxyCommand);
    expect(guide).toContain('leave `VITE_API_URL` unset');
    expect(guide).toContain('do not try to fix local Vite-dev REST failures by setting `VITE_API_URL`');
    expect(guide).not.toContain(staleDirectUrlCommand);
    expect(guide).not.toContain('set `VITE_API_URL` explicitly');
  });

  it('keeps the web package README aligned with proxy-first local Vite development', () => {
    const readme = readDoc('packages/franken-web/README.md');

    expect(readme).toContain(customPortProxyCommand);
    expect(readme).toContain('keep `VITE_API_URL` unset and set `VITE_API_PROXY_TARGET`');
    expect(readme).toContain('`VITE_BEAST_API_PROXY_TARGET`');
    expect(readme).toContain('Do not use it to select a custom local backend port.');
    expect(readme).not.toContain(staleDirectUrlCommand);
    expect(readme).not.toContain('set `VITE_API_URL` explicitly');
  });
});
