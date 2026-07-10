import { createSeededRandom } from './seededRandom.js';

function byteToHex(byte: number): string {
  return byte.toString(16).padStart(2, '0');
}

export function deterministicUuid(seed: string, counter: number): string {
  if (!Number.isSafeInteger(counter) || counter < 0) {
    throw new RangeError('counter must be a non-negative safe integer');
  }

  const random = createSeededRandom(`${seed}:${counter}`);
  const bytes = Array.from({ length: 16 }, () => Math.floor(random() * 256));

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.map(byteToHex);
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}
