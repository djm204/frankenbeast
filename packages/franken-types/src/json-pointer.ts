const UNSAFE_JSON_POINTER_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const DEFAULT_MAX_SEGMENTS = 128;
const DEFAULT_MAX_SEGMENT_LENGTH = 512;
const DEFAULT_MAX_ARRAY_INDEX = 10_000;

type JsonContainer = Record<string, unknown> | unknown[];

export class UnsafeJsonPointerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeJsonPointerError';
  }
}

export interface JsonPointerOptions {
  /**
   * Allows prototype-related path segments as ordinary data keys. Keep false
   * for untrusted input; enabling this is an explicit operator/developer
   * override for trusted migration or compatibility paths.
   */
  readonly allowUnsafePrototypeSegments?: boolean;
  readonly maxSegments?: number;
  readonly maxSegmentLength?: number;
  readonly maxArrayIndex?: number;
}

export interface SetJsonPointerOptions extends JsonPointerOptions {
  /**
   * Create missing intermediate objects/arrays while writing. Defaults to true.
   */
  readonly createMissing?: boolean;
}

export function parseJsonPointer(pointer: string, options: JsonPointerOptions = {}): readonly string[] {
  if (pointer === '') {
    return [];
  }
  if (!pointer.startsWith('/')) {
    throw new UnsafeJsonPointerError('JSON Pointer must be empty or start with `/`.');
  }

  const maxSegments = options.maxSegments ?? DEFAULT_MAX_SEGMENTS;
  if (!Number.isSafeInteger(maxSegments) || maxSegments < 0) {
    throw new UnsafeJsonPointerError('JSON Pointer maxSegments must be a non-negative safe integer.');
  }
  if (countJsonPointerSegments(pointer, maxSegments) > maxSegments) {
    throw new UnsafeJsonPointerError(`JSON Pointer contains too many path segments; limit is ${maxSegments}.`);
  }

  const rawSegments = pointer.slice(1).split('/');
  if (rawSegments.length > maxSegments) {
    throw new UnsafeJsonPointerError(`JSON Pointer contains too many path segments; limit is ${maxSegments}.`);
  }

  const segments = rawSegments.map((segment) => decodeJsonPointerSegment(segment));
  for (const segment of segments) {
    assertSafeJsonPointerSegment(segment, options);
  }
  return Object.freeze(segments);
}

export function assertSafeJsonPointer(pointer: string, options: JsonPointerOptions = {}): void {
  parseJsonPointer(pointer, options);
}

export function getJsonPointerValue(target: unknown, pointer: string, options: JsonPointerOptions = {}): unknown {
  const segments = parseJsonPointer(pointer, options);
  let current = target;
  for (const segment of segments) {
    if (!isObjectLike(current)) {
      return undefined;
    }
    if (Array.isArray(current)) {
      const index = parseArrayIndex(segment, options);
      if (index === undefined || index >= current.length || !Object.prototype.hasOwnProperty.call(current, index)) {
        return undefined;
      }
      current = current[index];
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function setJsonPointerValue<T extends JsonContainer>(
  target: T,
  pointer: string,
  value: unknown,
  options: SetJsonPointerOptions = {},
): T {
  const segments = parseJsonPointer(pointer, options);
  if (segments.length === 0) {
    throw new UnsafeJsonPointerError('Refusing to replace the JSON Pointer root object in-place.');
  }

  let current: JsonContainer = target;
  assertWritableJsonContainer(current);
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const nextSegment = segments[index + 1];
    const existing = readOwnContainerValue(current, segment, options);
    if (existing !== undefined) {
      if (!isJsonContainer(existing)) {
        throw new UnsafeJsonPointerError(`JSON Pointer segment '${segment}' does not resolve to an object or array.`);
      }
      assertWritableJsonContainer(existing);
      current = existing;
      continue;
    }

    if (options.createMissing === false) {
      throw new UnsafeJsonPointerError(`JSON Pointer segment '${segment}' does not exist.`);
    }

    const nextContainer = shouldCreateArrayForSegment(nextSegment, options) ? [] : Object.create(null) as Record<string, unknown>;
    writeOwnContainerValue(current, segment, nextContainer, options);
    current = nextContainer;
  }

  writeOwnContainerValue(current, segments.at(-1) as string, value, options);
  return target;
}

function countJsonPointerSegments(pointer: string, maxSegments: number): number {
  let segments = 0;
  for (const char of pointer) {
    if (char !== '/') continue;
    segments += 1;
    if (segments > maxSegments) return segments;
  }
  return segments;
}

function decodeJsonPointerSegment(segment: string): string {
  const invalidEscape = /~(?![01])/u;
  if (invalidEscape.test(segment)) {
    throw new UnsafeJsonPointerError('JSON Pointer contains an invalid escape sequence. Use `~0` for `~` and `~1` for `/`.');
  }
  return segment.replaceAll('~1', '/').replaceAll('~0', '~');
}

function assertSafeJsonPointerSegment(segment: string, options: JsonPointerOptions): void {
  const maxSegmentLength = options.maxSegmentLength ?? DEFAULT_MAX_SEGMENT_LENGTH;
  if (!Number.isSafeInteger(maxSegmentLength) || maxSegmentLength < 0) {
    throw new UnsafeJsonPointerError('JSON Pointer maxSegmentLength must be a non-negative safe integer.');
  }
  if (segment.length > maxSegmentLength) {
    throw new UnsafeJsonPointerError(`JSON Pointer segment exceeds ${maxSegmentLength} characters.`);
  }
  if (!options.allowUnsafePrototypeSegments && UNSAFE_JSON_POINTER_SEGMENTS.has(segment)) {
    throw new UnsafeJsonPointerError(`JSON Pointer segment '${segment}' is blocked because it can mutate object prototypes.`);
  }
}

function isObjectLike(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

function isJsonContainer(value: unknown): value is JsonContainer {
  return isObjectLike(value) && (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function assertWritableJsonContainer(value: JsonContainer): void {
  if (value === Object.prototype || value === Array.prototype) {
    throw new UnsafeJsonPointerError('Refusing to mutate a built-in prototype object through a JSON Pointer.');
  }
}

function parseArrayIndex(segment: string, options: JsonPointerOptions): number | undefined {
  if (!/^(0|[1-9]\d*)$/u.test(segment)) {
    return undefined;
  }
  const maxArrayIndex = options.maxArrayIndex ?? DEFAULT_MAX_ARRAY_INDEX;
  if (!Number.isSafeInteger(maxArrayIndex) || maxArrayIndex < 0) {
    throw new UnsafeJsonPointerError('JSON Pointer maxArrayIndex must be a non-negative safe integer.');
  }
  const index = Number(segment);
  if (!Number.isSafeInteger(index) || index > maxArrayIndex) {
    throw new UnsafeJsonPointerError(`JSON Pointer segment '${segment}' exceeds the maximum allowed array index of ${maxArrayIndex}.`);
  }
  return index;
}

function shouldCreateArrayForSegment(segment: string, options: JsonPointerOptions): boolean {
  return parseArrayIndex(segment, options) !== undefined;
}

function readOwnContainerValue(container: JsonContainer, segment: string, options: JsonPointerOptions): unknown {
  if (Array.isArray(container)) {
    const index = parseArrayIndex(segment, options);
    return index === undefined || !Object.prototype.hasOwnProperty.call(container, index) ? undefined : container[index];
  }
  return Object.prototype.hasOwnProperty.call(container, segment) ? container[segment] : undefined;
}

function writeOwnContainerValue(container: JsonContainer, segment: string, value: unknown, options: JsonPointerOptions): void {
  if (Array.isArray(container)) {
    const index = parseArrayIndex(segment, options);
    if (index === undefined) {
      throw new UnsafeJsonPointerError(`JSON Pointer segment '${segment}' is not a valid array index.`);
    }
    Object.defineProperty(container, index, {
      configurable: true,
      enumerable: true,
      writable: true,
      value,
    });
    return;
  }

  Object.defineProperty(container, segment, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}
