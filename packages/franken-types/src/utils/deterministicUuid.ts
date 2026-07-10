function byteToHex(byte: number): string {
  return byte.toString(16).padStart(2, '0');
}

function hash128(input: string): number[] {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  let h3 = 0xc0decafe;
  let h4 = 0x9e3779b9;

  for (const char of input) {
    const code = char.codePointAt(0) ?? 0;
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
    h3 = Math.imul(h3 ^ code, 2246822507);
    h4 = Math.imul(h4 ^ code, 3266489909);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h3 ^ (h3 >>> 13), 3266489909);
  h3 = Math.imul(h3 ^ (h3 >>> 16), 2246822507) ^ Math.imul(h4 ^ (h4 >>> 13), 3266489909);
  h4 = Math.imul(h4 ^ (h4 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

function hashBytes(seed: string, counter: number): number[] {
  const bytes: number[] = [];
  for (const word of hash128(`${seed}:${counter}`)) {
    bytes.push(
      (word >>> 24) & 0xff,
      (word >>> 16) & 0xff,
      (word >>> 8) & 0xff,
      word & 0xff,
    );
  }
  return bytes;
}

export function deterministicUuid(seed: string, counter: number): string {
  if (!Number.isSafeInteger(counter) || counter < 0) {
    throw new RangeError('counter must be a non-negative safe integer');
  }

  const bytes = hashBytes(seed, counter);

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.map(byteToHex);
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}
