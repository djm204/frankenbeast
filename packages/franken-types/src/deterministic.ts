const DEFAULT_EPOCH_MS = Date.UTC(2026, 0, 1, 0, 0, 0);
const MODULUS = 0x100000000;
const DEFAULT_SEED = 'frankenbeast';

function activeSeed(): string | undefined {
  return process.env['FRANKENBEAST_SEED'];
}

export function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export interface SeededRandom {
  random(): number;
}

export function createSeededRandom(seed = activeSeed() ?? DEFAULT_SEED): SeededRandom {
  let state = hashSeed(seed) || 0x6d2b79f5;

  return {
    random(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / MODULUS;
    },
  };
}

const randomBySeed = new Map<string, SeededRandom>();

function randomForSeed(seed: string): SeededRandom {
  let random = randomBySeed.get(seed);
  if (!random) {
    random = createSeededRandom(seed);
    randomBySeed.set(seed, random);
  }
  return random;
}

export const seededRandom: SeededRandom = {
  random(): number {
    const seed = activeSeed();
    return seed ? randomForSeed(seed).random() : Math.random();
  },
};

const nowStateBySeed = new Map<string, { offset: number; tick: number }>();

function nowState(seed: string): { offset: number; tick: number } {
  let state = nowStateBySeed.get(seed);
  if (!state) {
    state = {
      offset: Math.floor(createSeededRandom(`clock:${seed}`).random() * 86_400_000),
      tick: 0,
    };
    nowStateBySeed.set(seed, state);
  }
  return state;
}

export function now(): number {
  const seed = activeSeed();
  if (!seed) {
    return Date.now();
  }
  const state = nowState(seed);
  return DEFAULT_EPOCH_MS + state.offset + state.tick++;
}

export function isoNow(): string {
  return new Date(now()).toISOString();
}

const uuidCounters = new Map<string, number>();

function randomByte(random: SeededRandom): number {
  return Math.floor(random.random() * 256) & 0xff;
}

function randomUuidFromRuntime(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const random = createSeededRandom(`${DEFAULT_SEED}:fallback:${Date.now()}:${Math.random()}`);
  const bytes = Array.from({ length: 16 }, () => randomByte(random));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

export function deterministicUuid(namespace = 'default'): string {
  const seed = activeSeed();
  if (!seed) {
    return randomUuidFromRuntime();
  }

  const key = `${seed}:${namespace}`;
  const counter = uuidCounters.get(key) ?? 0;
  uuidCounters.set(key, counter + 1);

  const random = createSeededRandom(`uuid:${seed}:${namespace}:${counter}`);
  const bytes = Array.from({ length: 16 }, () => randomByte(random));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}
