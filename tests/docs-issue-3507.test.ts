import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const guide = readFileSync(resolve(ROOT, 'docs/guides/run-dashboard-chat.md'), 'utf8');

describe('issue #3507 dashboard chat provider override guidance', () => {
  it('documents current provider selection, model, and command trust behavior', () => {
    expect(guide).toContain('`.fbeast/config.json` by default');
    expect(guide).toContain('`--provider <name>` wins over `providers.default`');
    expect(guide).toContain('`--providers <comma-separated-list>` wins over `providers.fallbackChain`');
    expect(guide).toContain('`providers.overrides.<selected-provider>.model` has the highest model precedence');
    expect(guide).toContain('`chat.model` overrides the provider\'s built-in chat model');
    expect(guide).toContain('`--trust-provider-command-overrides`');
    expect(guide).toContain('explicit operator-owned config outside the repository');
    expect(guide).toContain('trust fields in `.fbeast/config.json` are stripped');
  });

  it('keeps copyable examples aligned with the current config schema', () => {
    expect(guide).toContain('"extraArgs": ["--verbose"]');
    expect(guide).toContain('"trustCommandOverride": true');
    expect(guide).toContain('"trustedCommandPaths": ["/opt/frankenbeast/bin"]');
    expect(guide).toContain('--config "$HOME/.config/frankenbeast/dashboard-chat.json"');
  });
});
