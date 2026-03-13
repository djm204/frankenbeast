export type CommandFailureKind = 'rate_limit' | 'timeout' | 'spawn_error' | 'command_failed';

export interface CommandFailure {
  readonly kind: CommandFailureKind;
  readonly tool: string;
  readonly command: string;
  readonly provider?: string | undefined;
  readonly exitCode?: number | undefined;
  readonly timedOut: boolean;
  readonly retryable: boolean;
  readonly rateLimited: boolean;
  readonly retryAfterMs?: number | undefined;
  readonly stdout: string;
  readonly stderr: string;
  readonly summary: string;
  readonly details?: Record<string, unknown> | undefined;
}

export interface ClassifyCommandFailureOptions {
  readonly tool: string;
  readonly command: string;
  readonly provider?: string | undefined;
  readonly exitCode: number;
  readonly timedOut?: boolean | undefined;
  readonly stdout?: string | undefined;
  readonly stderr?: string | undefined;
  readonly normalizedOutput?: string | undefined;
  readonly detectRateLimit?: ((text: string) => boolean) | undefined;
  readonly parseRetryAfterMs?: ((text: string) => number | undefined) | undefined;
  readonly details?: Record<string, unknown> | undefined;
}

export interface CommandFailureFromExecErrorOptions {
  readonly tool: string;
  readonly command: string;
  readonly error: unknown;
  readonly provider?: string | undefined;
  readonly normalizedOutput?: string | undefined;
  readonly detectRateLimit?: ((text: string) => boolean) | undefined;
  readonly parseRetryAfterMs?: ((text: string) => number | undefined) | undefined;
  readonly details?: Record<string, unknown> | undefined;
}

export function parseResetTimeText(text: string): { sleepSeconds: number; source: string } {
  const retryAfterHeaderMatch = text.match(/retry.?after:?\s*(\d+)\s*s?/i);
  if (retryAfterHeaderMatch?.[1]) {
    return { sleepSeconds: parseInt(retryAfterHeaderMatch[1], 10), source: 'retry-after header' };
  }

  const retryAfterPatternMatch = text.match(/retry.?after\s+(\d+)\s*s?/i);
  if (retryAfterPatternMatch?.[1]) {
    return { sleepSeconds: parseInt(retryAfterPatternMatch[1], 10), source: 'retry-after header' };
  }

  const minutesMatch = text.match(/try again in (\d+) minute/i);
  if (minutesMatch?.[1]) return { sleepSeconds: parseInt(minutesMatch[1], 10) * 60, source: 'minutes pattern' };

  const secondsMatch = text.match(/try again in (\d+) second/i);
  if (secondsMatch?.[1]) return { sleepSeconds: parseInt(secondsMatch[1], 10), source: 'seconds pattern' };

  const isoMatch = text.match(/resets?\s+(?:at\s+)?(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/i);
  if (isoMatch?.[1]) {
    const resetAt = new Date(isoMatch[1]).getTime();
    const now = Date.now();
    if (resetAt > now) return { sleepSeconds: Math.ceil((resetAt - now) / 1000), source: 'reset-at timestamp' };
  }

  const epochMatch = text.match(/x-ratelimit-reset:\s*(\d{10,13})/i);
  if (epochMatch?.[1]) {
    const epoch = parseInt(epochMatch[1], 10);
    const resetMs = epoch > 1e12 ? epoch : epoch * 1000;
    const now = Date.now();
    if (resetMs > now) return { sleepSeconds: Math.ceil((resetMs - now) / 1000), source: 'x-ratelimit-reset epoch' };
  }

  const resetsInMatch = text.match(/resets?\s+in\s+(\d+)\s*s/i);
  if (resetsInMatch?.[1]) return { sleepSeconds: parseInt(resetsInMatch[1], 10), source: 'resets-in pattern' };

  return { sleepSeconds: -1, source: 'unknown' };
}

export function classifyCommandFailure(options: ClassifyCommandFailureOptions): CommandFailure {
  const stdout = options.stdout ?? '';
  const stderr = options.stderr ?? '';
  const timedOut = options.timedOut ?? false;
  const combined = normalizedFailureText(stderr, stdout, options.normalizedOutput);
  const rateLimited = !timedOut && (options.detectRateLimit?.(combined) ?? false);
  const retryAfterMs = rateLimited ? options.parseRetryAfterMs?.(combined) : undefined;
  const kind: CommandFailureKind = timedOut ? 'timeout' : rateLimited ? 'rate_limit' : 'command_failed';

  return {
    kind,
    tool: options.tool,
    command: options.command,
    ...(options.provider ? { provider: options.provider } : {}),
    exitCode: options.exitCode,
    timedOut,
    retryable: kind === 'rate_limit',
    rateLimited,
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
    stdout,
    stderr,
    summary: buildSummary({
      kind,
      tool: options.tool,
      command: options.command,
      provider: options.provider,
      exitCode: options.exitCode,
      stderr,
    }),
    ...(options.details ? { details: options.details } : {}),
  };
}

export function commandFailureFromExecError(options: CommandFailureFromExecErrorOptions): CommandFailure {
  const stdout = readExecText((options.error as { stdout?: unknown }).stdout);
  const message = errorMessage(options.error);
  const stderr = readExecText((options.error as { stderr?: unknown }).stderr) || message;
  const exitCode = readExecExitCode(options.error);
  const code = readExecCode(options.error);

  if (exitCode === undefined && code) {
    return {
      kind: 'spawn_error',
      tool: options.tool,
      command: options.command,
      ...(options.provider ? { provider: options.provider } : {}),
      timedOut: false,
      retryable: false,
      rateLimited: false,
      stdout,
      stderr,
      summary: `${options.tool} spawn failed: ${options.command} (${code})`,
      details: {
        ...(options.details ?? {}),
        code,
        message,
      },
    };
  }

  return classifyCommandFailure({
    tool: options.tool,
    command: options.command,
    ...(options.provider ? { provider: options.provider } : {}),
    exitCode: exitCode ?? 1,
    stdout,
    stderr,
    normalizedOutput: options.normalizedOutput,
    detectRateLimit: options.detectRateLimit,
    parseRetryAfterMs: options.parseRetryAfterMs,
    details: options.details,
  });
}

export function isCommandFailure(value: unknown): value is CommandFailure {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<CommandFailure>;
  return (
    typeof candidate.kind === 'string' &&
    typeof candidate.tool === 'string' &&
    typeof candidate.command === 'string' &&
    typeof candidate.summary === 'string' &&
    typeof candidate.timedOut === 'boolean' &&
    typeof candidate.retryable === 'boolean' &&
    typeof candidate.rateLimited === 'boolean'
  );
}

function normalizedFailureText(stderr: string, stdout: string, normalizedOutput?: string): string {
  const parts = [stderr, stdout, normalizedOutput ?? '']
    .map((part) => part.trim())
    .filter((part, index, arr) => part.length > 0 && arr.indexOf(part) === index);
  return parts.join('\n');
}

function buildSummary(input: {
  kind: CommandFailureKind;
  tool: string;
  command: string;
  provider?: string | undefined;
  exitCode?: number | undefined;
  stderr: string;
}): string {
  const subject = input.provider ?? input.tool;
  const suffix = buildStderrSuffix(input.stderr);
  if (input.kind === 'rate_limit') {
    return `${subject} rate limited while running ${input.command}${suffix}`;
  }
  if (input.kind === 'timeout') {
    return `${subject} timed out while running ${input.command}${suffix}`;
  }
  return `${input.tool} command failed: ${input.command}${input.exitCode !== undefined ? ` (exit ${input.exitCode})` : ''}${suffix}`;
}

function buildStderrSuffix(stderr: string): string {
  const excerpt = stderr.trim().split('\n').filter(Boolean)[0];
  return excerpt ? `: ${excerpt}` : '';
}

function readExecText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString('utf-8');
  return '';
}

function readExecExitCode(error: unknown): number | undefined {
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

function readExecCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
