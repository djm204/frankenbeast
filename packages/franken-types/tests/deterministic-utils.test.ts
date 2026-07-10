import { afterEach, describe, expect, it } from 'vitest';

import { deterministicUuid, now, random } from '../src/index.js';
import { deterministicUuid as deterministicUuidFromSubpath } from '@franken/types/utils';
import { createSeededRandom } from '../src/utils/seededRandom.js';

const originalSeed = process.env['FRANKENBEAST_SEED'];

function setSeed(seed: string | undefined): void {
  if (seed === undefined) {
    delete process.env['FRANKENBEAST_SEED'];
    return;
  }

  process.env['FRANKENBEAST_SEED'] = seed;
}

afterEach(() => {
  setSeed(originalSeed);
});

describe('deterministic utilities', () => {
  it('creates repeatable seeded random streams', () => {
    const first = createSeededRandom('issue-1415');
    const second = createSeededRandom('issue-1415');
    const different = createSeededRandom('other-seed');

    expect([first(), first(), first()]).toEqual([second(), second(), second()]);
    expect(first()).not.toBe(different());
  });

  it('uses FRANKENBEAST_SEED for module-level random values', () => {
    setSeed('stable-env-seed');
    const first = random();
    const second = random();

    setSeed('different-env-seed');
    random();

    setSeed('stable-env-seed');
    expect(random()).toBe(first);
    expect(random()).toBe(second);
  });

  it('restarts the seeded random stream after an unseeded section', () => {
    setSeed('restore-env-seed');
    const first = random();
    const second = random();

    setSeed(undefined);
    random();

    setSeed('restore-env-seed');
    expect(random()).toBe(first);
    expect(random()).toBe(second);
  });

  it('creates deterministic UUIDs from a seed and counter', () => {
    const uuid = deterministicUuid('issue-1415', 7);

    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    expect(deterministicUuid('issue-1415', 7)).toBe(uuid);
    expect(deterministicUuidFromSubpath('issue-1415', 7)).toBe(uuid);
    expect(deterministicUuid('issue-1415', 8)).not.toBe(uuid);
    expect(deterministicUuid('other-seed', 7)).not.toBe(uuid);
  });

  it('returns a fixed timestamp only when FRANKENBEAST_SEED is set', async () => {
    setSeed('clock-seed');
    const seededNow = now();
    expect(now()).toBe(seededNow);

    setSeed(undefined);
    const before = Date.now();
    const unseededNow = now();
    const after = Date.now();

    expect(unseededNow).toBeGreaterThanOrEqual(before);
    expect(unseededNow).toBeLessThanOrEqual(after);
  });
});
