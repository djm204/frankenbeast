import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createDeterministicClock, installDeterministicMode, seededRandom } from '../scripts/vitest-deterministic-mode.js';

const ROOT = resolve(import.meta.dirname, '..');
const DETERMINISTIC_SETUP = 'vitest-deterministic-setup.ts';
const VITEST_CONFIGS = [
  'vitest.config.ts',
  'packages/franken-brain/vitest.config.ts',
  'packages/franken-brain/vitest.integration.config.ts',
  'packages/franken-critique/vitest.config.ts',
  'packages/franken-critique/vitest.integration.config.ts',
  'packages/franken-governor/vitest.config.ts',
  'packages/live-bench/vitest.config.ts',
  'packages/franken-mcp-suite/vitest.config.ts',
  'packages/franken-observer/vitest.config.ts',
  'packages/franken-orchestrator/vitest.config.ts',
  'packages/franken-planner/vitest.config.ts',
  'packages/franken-types/vitest.config.ts',
  'packages/franken-web/vitest.config.ts',
];

describe('deterministic Vitest mode', () => {
  it('derives repeatable random sequences from the same seed', () => {
    const first = seededRandom('ci-seed');
    const second = seededRandom('ci-seed');
    const different = seededRandom('other-seed');

    expect([first(), first(), first()]).toEqual([second(), second(), second()]);
    expect(first()).not.toBe(different());
  });

  it('derives a monotonic repeatable clock from the seed', () => {
    const first = createDeterministicClock('ci-seed');
    const second = createDeterministicClock('ci-seed');
    const values = [first(), first(), first()];

    expect(values).toEqual([second(), second(), second()]);
    expect(values[1]).toBe(values[0] + 1);
    expect(values[2]).toBe(values[1] + 1);
  });

  it('preserves Date constructor and callable behavior when deterministic mode is installed', () => {
    const originalDate = globalThis.Date;
    const originalRandom = Math.random;
    const globalObject = globalThis as typeof globalThis & {
      __frankenDeterministicModeInstalled?: string;
    };
    const originalInstallMarker = globalObject.__frankenDeterministicModeInstalled;

    try {
      delete globalObject.__frankenDeterministicModeInstalled;
      globalThis.Date = originalDate;
      Math.random = originalRandom;

      installDeterministicMode('callable-date-test');

      expect(() => Date()).not.toThrow();
      expect(typeof Date()).toBe('string');
      expect(new Date()).toBeInstanceOf(originalDate);
      expect(Date.parse('2026-01-01T00:00:00.000Z')).toBe(originalDate.parse('2026-01-01T00:00:00.000Z'));
      expect(Date.UTC(2026, 0, 1)).toBe(originalDate.UTC(2026, 0, 1));
      const nowDescriptor = Object.getOwnPropertyDescriptor(Date, 'now');
      expect(nowDescriptor?.configurable).toBe(true);
      expect(nowDescriptor?.writable).toBe(true);
    } finally {
      globalThis.Date = originalDate;
      Math.random = originalRandom;
      if (originalInstallMarker === undefined) {
        delete globalObject.__frankenDeterministicModeInstalled;
      } else {
        globalObject.__frankenDeterministicModeInstalled = originalInstallMarker;
      }
    }
  });

  it('wires the deterministic setup file into every Vitest suite config', () => {
    for (const configPath of VITEST_CONFIGS) {
      const source = readFileSync(resolve(ROOT, configPath), 'utf8');
      expect(source, configPath).toContain('setupFiles');
      expect(source, configPath).toContain(DETERMINISTIC_SETUP);
      expect(source, configPath).toContain('fileURLToPath');
      expect(source, configPath).not.toContain('.pathname');
    }
  });

  it('declares the deterministic seed as a Turbo global env input for package tests', () => {
    const turboJson = JSON.parse(readFileSync(resolve(ROOT, 'turbo.json'), 'utf8')) as { globalEnv?: string[] };

    expect(turboJson.globalEnv).toContain('FRANKENBEAST_SEED');
  });
});
