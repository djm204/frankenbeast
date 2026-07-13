import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { handleStartupFailure } from './shutdown.js';

const serverEntrypoints = [
  'planner.ts',
  'memory.ts',
  'proxy.ts',
  'critique.ts',
  'skills.ts',
  'firewall.ts',
  'governor.ts',
  'observer.ts',
] as const;

describe('server shutdown handling', () => {
  it('reports startup failures without forcing process.exit', () => {
    const write = vi.fn();
    const runtime = {
      stderr: { write },
      process: { exitCode: undefined as number | undefined },
    };

    handleStartupFailure('fbeast-planner', new Error('bind failed'), runtime);

    expect(runtime.process.exitCode).toBe(1);
    expect(write).toHaveBeenCalledWith('fbeast-planner failed to start: bind failed\n');
  });

  it('removes direct process.exit calls from standalone server entrypoints', () => {
    for (const file of serverEntrypoints) {
      const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'servers', file), 'utf8');
      expect(source, `${file} should use shared shutdown helper instead of process.exit`).not.toMatch(/\bprocess\.exit\s*\(/);
    }
  });
});
