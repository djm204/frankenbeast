import { describe, expect, it } from 'vitest';
import { createSeededRandom, deterministicUuid, isoNow, now, seededRandom } from '../src/deterministic.js';

function withSeed<T>(seed: string | undefined, fn: () => T): T {
  const previous = process.env['FRANKENBEAST_SEED'];
  if (seed === undefined) {
    delete process.env['FRANKENBEAST_SEED'];
  } else {
    process.env['FRANKENBEAST_SEED'] = seed;
  }
  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete process.env['FRANKENBEAST_SEED'];
    } else {
      process.env['FRANKENBEAST_SEED'] = previous;
    }
  }
}

describe('deterministic helpers', () => {
  it('creates reproducible pseudo-random sequences from the same seed', () => {
    const first = createSeededRandom('seed-a');
    const second = createSeededRandom('seed-a');

    expect([first.random(), first.random(), first.random()]).toEqual([
      second.random(),
      second.random(),
      second.random(),
    ]);
  });

  it('switches seededRandom to deterministic mode when FRANKENBEAST_SEED is set', () => {
    const values = withSeed('seeded-random-test', () => [seededRandom.random(), seededRandom.random()]);

    expect(values).toHaveLength(2);
    expect(values[0]).toBeGreaterThanOrEqual(0);
    expect(values[0]).toBeLessThan(1);
    expect(values[1]).toBeGreaterThanOrEqual(0);
    expect(values[1]).toBeLessThan(1);
    expect(values[0]).not.toBe(values[1]);
  });

  it('uses deterministic timestamps and UUID-shaped IDs with a seed', () => {
    const values = withSeed('clock-and-id-test', () => ({
      firstNow: now(),
      secondNow: now(),
      iso: isoNow(),
      firstId: deterministicUuid('unit'),
      secondId: deterministicUuid('unit'),
    }));

    expect(values.secondNow).toBe(values.firstNow);
    expect(values.iso).toMatch(/^2026-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(values.firstId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(values.secondId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(values.firstId).not.toBe(values.secondId);
  });
});
