import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createDeterministicClock, seededRandom } from '../scripts/vitest-deterministic-mode.js';

const ROOT = resolve(import.meta.dirname, '..');
const DETERMINISTIC_SETUP = 'vitest-deterministic-setup.ts';
const VITEST_CONFIGS = [
  'vitest.config.ts',
  'packages/franken-brain/vitest.config.ts',
  'packages/franken-brain/vitest.integration.config.ts',
  'packages/franken-critique/vitest.config.ts',
  'packages/franken-critique/vitest.integration.config.ts',
  'packages/franken-governor/vitest.config.ts',
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

  it('wires the deterministic setup file into every Vitest suite config', () => {
    for (const configPath of VITEST_CONFIGS) {
      const source = readFileSync(resolve(ROOT, configPath), 'utf8');
      expect(source, configPath).toContain('setupFiles');
      expect(source, configPath).toContain(DETERMINISTIC_SETUP);
    }
  });
});
