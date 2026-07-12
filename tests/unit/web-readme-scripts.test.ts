import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..');
const README = readFileSync(resolve(ROOT, 'packages/franken-web/README.md'), 'utf8');
const WEB_PACKAGE = JSON.parse(
  readFileSync(resolve(ROOT, 'packages/franken-web/package.json'), 'utf8'),
) as { scripts?: Record<string, string> };

const userFacingScripts = ['dev', 'dev:chat', 'dev:network', 'build', 'preview', 'test', 'typecheck'];

function quickStartCommandLines(): string[] {
  const quickStart = README.slice(
    README.indexOf('## Quick Start'),
    README.indexOf('## Run with MCP Mode'),
  );
  const commandBlock = quickStart.match(/```bash\n(?<body>[\s\S]*?)\n```/)?.groups?.body;
  expect(commandBlock, 'Quick Start must include a bash command block').toBeDefined();

  return commandBlock!.split('\n').map((line) => line.trim());
}

describe('@franken/web README scripts', () => {
  it('documents each user-facing package script in Quick Start', () => {
    const commandLines = quickStartCommandLines();

    for (const script of userFacingScripts) {
      expect(WEB_PACKAGE.scripts?.[script], `package script ${script} must exist`).toBeDefined();
      const command = script === 'test' ? 'npm test' : `npm run ${script}`;
      expect(commandLines.some((line) => line.startsWith(`${command} `)), `Quick Start must document ${command}`).toBe(true);
    }
  });

  it('explains network dev mode and web package typechecking', () => {
    expect(README).toContain('Use `npm run dev:network` when working on the Network tab');
    expect(README).toContain('set `VITE_API_PROXY_TARGET` when `/v1/network/*`');
    expect(README).toContain('VITE_BEAST_API_PROXY_TARGET');
    expect(README).toContain('npm --workspace @franken/web run typecheck');
    expect(README).toContain('tsc --noEmit');
  });
});
