import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath: string) => readFileSync(resolve(ROOT, relativePath), 'utf8');

describe('issue #2139 run-cli-beast CLI flags docs', () => {
  it('documents the supported frankenbeast flag groups surfaced by the parser', () => {
    const guide = read('docs/guides/run-cli-beast.md');
    const argsSource = read('packages/franken-orchestrator/src/cli/args.ts');

    for (const flag of [
      '--base-dir',
      '--base-branch',
      '--budget',
      '--provider',
      '--providers',
      '--trust-provider-command-overrides',
      '--design-doc',
      '--plan-dir',
      '--plan-name',
      '--output-dir',
      '--goal',
      '--output',
      '--config',
      '--host',
      '--port',
      '--allow-origin',
      '--no-pr',
      '--verbose',
      '--reset',
      '--resume',
      '--cleanup',
      '--verify',
      '--repair',
      '--non-interactive',
      '--backend',
      '--repo',
      '--target-upstream',
      '--label',
      '--milestone',
      '--search',
      '--assignee',
      '--limit',
      '--dry-run',
      '--mode',
      '--set',
      '--detached',
      '--no-firewall',
      '--no-skills',
      '--no-memory',
      '--no-planner',
      '--no-critique',
      '--no-governor',
      '--no-heartbeat',
    ]) {
      expect(argsSource).toContain(flag.replace(/^--/, ''));
      expect(guide).toContain(flag);
    }

    expect(guide).toContain('process');
    expect(guide).toContain('container');
    expect(guide).toContain('chat-server` defaults to port `3737`');
    expect(guide).toContain('beasts-daemon` defaults to port `4050`');
    expect(guide).toContain('`--repo` and `--target-upstream` are mutually exclusive');
  });
});
