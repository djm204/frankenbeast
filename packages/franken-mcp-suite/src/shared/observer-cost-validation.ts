export interface ObserverCostNumbers {
  promptTokens: number;
  completionTokens: number;
  costUsd?: number;
}

export interface ParsedObserverCostArgs extends ObserverCostNumbers {
  sessionId: string;
  model: string;
}

type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

function parseNonNegativeIntegerArg(name: string, value: unknown): ParseResult<number> {
  if (typeof value !== 'number' && typeof value !== 'string') {
    return { ok: false, message: `${name} must be a finite safe non-negative integer` };
  }
  const raw = typeof value === 'string' ? value.trim() : String(value);
  if (raw.length === 0) {
    return { ok: false, message: `${name} must be a finite safe non-negative integer` };
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isSafeInteger(parsed) || parsed < 0) {
    return { ok: false, message: `${name} must be a finite safe non-negative integer` };
  }
  return { ok: true, value: parsed };
}

function parseOptionalNonNegativeNumberArg(name: string, value: unknown): ParseResult<number | undefined> {
  if (value == null) {
    return { ok: true, value: undefined };
  }
  if (typeof value !== 'number' && typeof value !== 'string') {
    return { ok: false, message: `${name} must be a finite non-negative number` };
  }
  const raw = typeof value === 'string' ? value.trim() : String(value);
  if (raw.length === 0) {
    return { ok: false, message: `${name} must be a finite non-negative number` };
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { ok: false, message: `${name} must be a finite non-negative number` };
  }
  return { ok: true, value: parsed };
}

export function validateObserverCostNumbers(input: ObserverCostNumbers): void {
  if (!Number.isFinite(input.promptTokens) || !Number.isSafeInteger(input.promptTokens) || input.promptTokens < 0) {
    throw new Error('promptTokens must be a finite safe non-negative integer');
  }
  if (!Number.isFinite(input.completionTokens) || !Number.isSafeInteger(input.completionTokens) || input.completionTokens < 0) {
    throw new Error('completionTokens must be a finite safe non-negative integer');
  }
  if (input.costUsd !== undefined && (!Number.isFinite(input.costUsd) || input.costUsd < 0)) {
    throw new Error('costUsd must be a finite non-negative number');
  }
}

export function parseObserverCostArgs(args: Record<string, unknown>): ParseResult<ParsedObserverCostArgs> {
  const promptTokensArg = parseNonNegativeIntegerArg('promptTokens', args['promptTokens']);
  if (!promptTokensArg.ok) {
    return promptTokensArg;
  }
  const completionTokensArg = parseNonNegativeIntegerArg('completionTokens', args['completionTokens']);
  if (!completionTokensArg.ok) {
    return completionTokensArg;
  }
  const costUsdArg = parseOptionalNonNegativeNumberArg('costUsd', args['costUsd']);
  if (!costUsdArg.ok) {
    return costUsdArg;
  }

  const parsed = {
    sessionId: String(args['sessionId']),
    model: String(args['model']),
    promptTokens: promptTokensArg.value,
    completionTokens: completionTokensArg.value,
    ...(costUsdArg.value !== undefined ? { costUsd: costUsdArg.value } : {}),
  };
  validateObserverCostNumbers(parsed);
  return { ok: true, value: parsed };
}
