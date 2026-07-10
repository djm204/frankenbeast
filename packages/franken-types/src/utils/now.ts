import { createSeededRandom } from './seededRandom.js';

const DEFAULT_EPOCH_MS = Date.UTC(2026, 0, 1, 0, 0, 0);
const DAY_MS = 86_400_000;

function currentSeed(): string | undefined {
  const maybeProcess = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return maybeProcess.process?.env?.['FRANKENBEAST_SEED'];
}

let activeSeed: string | undefined;
let activeNow: number | undefined;

export function now(): number {
  const seed = currentSeed();
  if (!seed) {
    return Date.now();
  }

  if (activeSeed !== seed || activeNow === undefined) {
    activeSeed = seed;
    activeNow = DEFAULT_EPOCH_MS + Math.floor(createSeededRandom(`now:${seed}`)() * DAY_MS);
  }

  return activeNow;
}
