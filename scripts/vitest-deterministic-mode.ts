const DEFAULT_EPOCH_MS = Date.UTC(2026, 0, 1, 0, 0, 0);
const MODULUS = 0x100000000;

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededRandom(seed = process.env['FRANKENBEAST_SEED'] ?? 'frankenbeast'): () => number {
  let state = hashSeed(seed) || 0x6d2b79f5;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / MODULUS;
  };
}

export function createDeterministicClock(seed = process.env['FRANKENBEAST_SEED'] ?? 'frankenbeast'): () => number {
  let tick = 0;
  const offset = Math.floor(seededRandom(`clock:${seed}`)() * 86_400_000);

  return () => DEFAULT_EPOCH_MS + offset + tick++;
}

export function now(): number {
  return deterministicClock();
}

const deterministicClock = createDeterministicClock();

type DateConstructorWithOriginal = DateConstructor & { __frankenOriginalDate?: DateConstructor };
type DateConstructorArguments = [] | ConstructorParameters<DateConstructor>;

export function installDeterministicMode(seed = process.env['FRANKENBEAST_SEED']): void {
  if (!seed) {
    return;
  }

  const globalObject = globalThis as typeof globalThis & {
    __frankenDeterministicModeInstalled?: string;
  };
  const workerId = process.env['VITEST_POOL_ID']
    ?? process.env['VITEST_WORKER_ID']
    ?? process.env['VITEST_WORKER_POOL_ID']
    ?? process.env['JEST_WORKER_ID']
    ?? 'main';
  const installedSeed = `${seed}:worker:${workerId}`;
  if (globalObject.__frankenDeterministicModeInstalled === installedSeed) {
    return;
  }

  const rng = seededRandom(installedSeed);
  const OriginalDate = Date as DateConstructorWithOriginal;
  const realStart = OriginalDate.now();
  const clock = (): number => realStart + Math.max(OriginalDate.now() - realStart, 0);

  Math.random = rng;

  const DeterministicDate = function deterministicDate(
    this: Date,
    ...args: DateConstructorArguments
  ): Date | string {
    if (!new.target) {
      return new OriginalDate(clock()).toString();
    }

    if (args.length === 0) {
      return new OriginalDate(clock());
    }

    return new OriginalDate(...args);
  } as DateConstructorWithOriginal;

  Object.setPrototypeOf(DeterministicDate, OriginalDate);
  Object.defineProperty(DeterministicDate, 'prototype', {
    value: OriginalDate.prototype,
  });
  Object.defineProperty(DeterministicDate, 'now', {
    configurable: true,
    value: () => clock(),
    writable: true,
  });

  Object.defineProperty(DeterministicDate, '__frankenOriginalDate', {
    value: OriginalDate.__frankenOriginalDate ?? OriginalDate,
  });

  globalThis.Date = DeterministicDate as DateConstructor;
  globalObject.__frankenDeterministicModeInstalled = installedSeed;
}
