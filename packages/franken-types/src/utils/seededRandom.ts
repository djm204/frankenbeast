const MODULUS = 0x100000000;
const DEFAULT_SEED = 'frankenbeast';

function currentSeed(): string | undefined {
  const maybeProcess = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return maybeProcess.process?.env?.['FRANKENBEAST_SEED'];
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export type RandomGenerator = () => number;

export function createSeededRandom(seed: string = currentSeed() ?? DEFAULT_SEED): RandomGenerator {
  let state = hashSeed(seed) || 0x6d2b79f5;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / MODULUS;
  };
}

let activeSeed: string | undefined;
let activeRandom: RandomGenerator | undefined;

export function random(): number {
  const seed = currentSeed();
  if (!seed) {
    return Math.random();
  }

  if (activeSeed !== seed || activeRandom === undefined) {
    activeSeed = seed;
    activeRandom = createSeededRandom(seed);
  }

  return activeRandom();
}
