import { createSeededRandom } from './seededRandom.js';

const DEFAULT_EPOCH_MS = Date.UTC(2026, 0, 1, 0, 0, 0);
const DAY_MS = 86_400_000;

function dateNowIsMocked(): boolean {
  const dateConstructor = Date as DateConstructor & { __frankenOriginalDate?: DateConstructor };
  if (dateConstructor.__frankenOriginalDate) return false;
  return !Function.prototype.toString.call(Date.now).includes('[native code]');
}

function currentSeed(): string | undefined {
  const maybeProcess = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  const env = maybeProcess.process?.env;
  const seed = env?.['FRANKENBEAST_SEED'];
  if (!seed) return undefined;
  const workerId = env?.['VITEST_POOL_ID']
    ?? env?.['VITEST_WORKER_ID']
    ?? env?.['VITEST_WORKER_POOL_ID']
    ?? env?.['JEST_WORKER_ID'];
  return workerId ? `${seed}:worker:${workerId}` : seed;
}

let activeSeed: string | undefined;
let activeNow: number | undefined;

export function now(): number {
  const seed = currentSeed();
  if (!seed || dateNowIsMocked()) {
    return Date.now();
  }

  if (activeSeed !== seed || activeNow === undefined) {
    activeSeed = seed;
    activeNow = DEFAULT_EPOCH_MS + Math.floor(createSeededRandom(`now:${seed}`)() * DAY_MS);
  }

  return activeNow;
}
