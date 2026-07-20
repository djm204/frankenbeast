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

export interface BoundedFetch {
  (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response>;
  <T>(
    input: Parameters<typeof fetch>[0],
    init: Parameters<typeof fetch>[1],
    consume: (response: Response) => Promise<T> | T,
  ): Promise<T>;
}

/**
 * Wrap a fetch implementation with a hard deadline.
 *
 * The optional consumer runs inside the same deadline as the request, keeping
 * response-body reads bounded as well as the wait for response headers.
 */
export function createBoundedFetch(
  fetchImpl: typeof fetch,
  options: BoundedFetchOptions,
): BoundedFetch {
  const timeoutMs = options.timeoutMs ?? DEFAULT_OUTBOUND_FETCH_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError(`Outbound fetch timeoutMs must be a positive finite number; received ${timeoutMs}`);
  }

  const boundedFetch = async <T = Response>(
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
    consume?: (response: Response) => Promise<T> | T,
  ): Promise<T> => {
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
      const operationPromise = fetchImpl(input, { ...init, signal: controller.signal })
        .then(response => consume ? consume(response) : response as T);
      return await Promise.race([operationPromise, timeoutPromise]);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      callerSignal?.removeEventListener('abort', forwardCallerAbort);
    }
  };

  return boundedFetch as BoundedFetch;
}
