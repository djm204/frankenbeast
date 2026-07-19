import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf8');

describe('issue #3363 external-agent docs index', () => {
  it('advertises only the currently supported integration modes', () => {
    const docsIndex = readme.slice(readme.indexOf('## Documentation'));
    const externalAgentEntry = docsIndex
      .split('\n')
      .find((line) => line.includes('[Wrap an External Agent]'));

    expect(externalAgentEntry).toBe(
      '- [Wrap an External Agent](docs/guides/wrap-external-agent.md) — MCP tool governance, orchestrator runtime, or BeastLoop dependency integration',
    );
    expect(externalAgentEntry).not.toContain('firewall-as-proxy');
  });
});
