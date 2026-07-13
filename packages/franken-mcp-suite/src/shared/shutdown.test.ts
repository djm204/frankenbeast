import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { handleStartupFailure } from './shutdown.js';

const entrypointPaths = [
  ['servers', 'planner.ts'],
  ['servers', 'memory.ts'],
  ['servers', 'proxy.ts'],
  ['servers', 'critique.ts'],
  ['servers', 'skills.ts'],
  ['servers', 'firewall.ts'],
  ['servers', 'governor.ts'],
  ['servers', 'observer.ts'],
  ['beast.ts'],
] as const;

describe('server shutdown handling', () => {
  it('reports startup failures without forcing process.exit', () => {
    const write = vi.fn();
    const runtime = {
      stderr: { write },
      process: { exitCode: undefined as number | undefined },
    };

    const error = new Error('bind failed');
    handleStartupFailure('fbeast-planner', error, runtime);

    expect(runtime.process.exitCode).toBe(1);
    expect(write).toHaveBeenCalledWith(expect.stringContaining('fbeast-planner failed to start: Error: bind failed'));
    expect(write).toHaveBeenCalledWith(expect.stringContaining('at '));
  });

  it('removes direct process.exit calls from MCP server entrypoints', () => {
    for (const pathParts of entrypointPaths) {
      const filePath = join(dirname(fileURLToPath(import.meta.url)), '..', ...pathParts);
      const source = readFileSync(filePath, 'utf8');
      expect(source, `${pathParts.join('/')} should use shared shutdown helper instead of process.exit`).not.toMatch(/\bprocess\.exit\s*\(/);
    }
  });
});
