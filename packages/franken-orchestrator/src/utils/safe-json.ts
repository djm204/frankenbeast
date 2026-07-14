export interface SafeJsonLimits {
  readonly maxBytes?: number;
  readonly maxDepth?: number;
  readonly maxContainers?: number;
  readonly maxObjectKeys?: number;
  readonly maxArrayItems?: number;
}

export interface SafeJsonParseOptions extends SafeJsonLimits {
  readonly context?: string;
}

export class SafeJsonParseError extends Error {
  public readonly code = 'SAFE_JSON_PARSE_LIMIT_EXCEEDED';

  constructor(
    public readonly limit: keyof SafeJsonLimits,
    public readonly actual: number,
    public readonly maximum: number,
    context: string,
  ) {
    super(`${context} exceeds ${limit}: ${actual} > ${maximum}`);
    this.name = 'SafeJsonParseError';
  }
}

export const DEFAULT_SAFE_JSON_LIMITS = {
  maxBytes: 1_048_576,
  maxDepth: 64,
  maxContainers: 10_000,
  maxObjectKeys: 20_000,
  maxArrayItems: 50_000,
} as const satisfies Required<SafeJsonLimits>;

interface StackFrame {
  readonly value: unknown;
  readonly depth: number;
}

function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function throwLimit(
  limit: keyof SafeJsonLimits,
  actual: number,
  maximum: number,
  context: string,
): never {
  throw new SafeJsonParseError(limit, actual, maximum, context);
}

function mergedLimits(options: SafeJsonParseOptions): Required<SafeJsonLimits> {
  return {
    maxBytes: options.maxBytes ?? DEFAULT_SAFE_JSON_LIMITS.maxBytes,
    maxDepth: options.maxDepth ?? DEFAULT_SAFE_JSON_LIMITS.maxDepth,
    maxContainers: options.maxContainers ?? DEFAULT_SAFE_JSON_LIMITS.maxContainers,
    maxObjectKeys: options.maxObjectKeys ?? DEFAULT_SAFE_JSON_LIMITS.maxObjectKeys,
    maxArrayItems: options.maxArrayItems ?? DEFAULT_SAFE_JSON_LIMITS.maxArrayItems,
  };
}

export function assertSafeJsonText(text: string, options: SafeJsonParseOptions = {}): void {
  const limits = mergedLimits(options);
  const context = options.context ?? 'JSON document';
  const bytes = utf8ByteLength(text);
  if (bytes > limits.maxBytes) {
    throwLimit('maxBytes', bytes, limits.maxBytes, context);
  }
}

export function assertSafeJsonValue(value: unknown, options: SafeJsonParseOptions = {}): void {
  const limits = mergedLimits(options);
  const context = options.context ?? 'JSON document';
  const stack: StackFrame[] = [{ value, depth: 1 }];
  let containers = 0;
  let objectKeys = 0;
  let arrayItems = 0;

  while (stack.length > 0) {
    const frame = stack.pop()!;
    const current = frame.value;
    if (current === null || typeof current !== 'object') {
      continue;
    }

    if (frame.depth > limits.maxDepth) {
      throwLimit('maxDepth', frame.depth, limits.maxDepth, context);
    }

    containers += 1;
    if (containers > limits.maxContainers) {
      throwLimit('maxContainers', containers, limits.maxContainers, context);
    }

    if (Array.isArray(current)) {
      arrayItems += current.length;
      if (arrayItems > limits.maxArrayItems) {
        throwLimit('maxArrayItems', arrayItems, limits.maxArrayItems, context);
      }
      for (const child of current) {
        stack.push({ value: child, depth: frame.depth + 1 });
      }
      continue;
    }

    const values = Object.values(current as Record<string, unknown>);
    objectKeys += values.length;
    if (objectKeys > limits.maxObjectKeys) {
      throwLimit('maxObjectKeys', objectKeys, limits.maxObjectKeys, context);
    }
    for (const child of values) {
      stack.push({ value: child, depth: frame.depth + 1 });
    }
  }
}

export function parseSafeJson(text: string, options: SafeJsonParseOptions = {}): unknown {
  assertSafeJsonText(text, options);
  const parsed = JSON.parse(text) as unknown;
  assertSafeJsonValue(parsed, options);
  return parsed;
}
