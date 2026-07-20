export const DEFAULT_OUTBOUND_FETCH_TIMEOUT_MS = 15_000;

export class OutboundFetchTimeoutError extends Error {
  readonly code = 'OUTBOUND_COMMS_TIMEOUT';

  constructor(channel: string, timeoutMs: number) {
    super(`${channel} outbound request timed out after ${timeoutMs}ms`);
    this.name = 'OutboundFetchTimeoutError';
  }
}

export interface BoundedFetchOptions {
  channel: string;
  timeoutMs?: number | undefined;
}

/**
 * Wrap a fetch implementation with a hard deadline.
 *
 * The timeout races the fetch promise as well as aborting its signal so injected
 * or non-standard fetch implementations cannot hang delivery by ignoring aborts.
 */
export function createBoundedFetch(
  fetchImpl: typeof fetch,
  options: BoundedFetchOptions,
): typeof fetch {
  const timeoutMs = options.timeoutMs ?? DEFAULT_OUTBOUND_FETCH_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError(`Outbound fetch timeoutMs must be a positive finite number; received ${timeoutMs}`);
  }

  return async (input, init) => {
    const controller = new AbortController();
    const callerSignal = init?.signal;
    const forwardCallerAbort = (): void => controller.abort(callerSignal?.reason);

    if (callerSignal?.aborted) {
      forwardCallerAbort();
    } else {
      callerSignal?.addEventListener('abort', forwardCallerAbort, { once: true });
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        const error = new OutboundFetchTimeoutError(options.channel, timeoutMs);
        reject(error);
        controller.abort(error);
      }, timeoutMs);
    });

    try {
      const fetchPromise = fetchImpl(input, { ...init, signal: controller.signal });
      return await Promise.race([fetchPromise, timeoutPromise]);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      callerSignal?.removeEventListener('abort', forwardCallerAbort);
    }
  };
}
