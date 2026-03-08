/**
 * Result monad for operations that can fail.
 * Used by heartbeat's ILlmClient and other fallible operations.
 */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };
