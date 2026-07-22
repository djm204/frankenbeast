import { useEffect, useRef } from 'react';

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 10_000;
const JITTER_RATIO = 0.25;
const FAILURE_LIMIT = 2;
const SETUP_FAILURE_LIMIT = 8;

function isAuthenticationClose(event?: CloseEvent): boolean {
  return event?.code === 4401
    || event?.code === 4403
    || (event?.code === 1008 && /auth|credential|forbidden|unauthor/i.test(event.reason));
}

interface ReconnectCycle {
  dispose(): void;
  isRefreshInFlight(): boolean;
  onClose(event?: CloseEvent): boolean;
  onReady(): void;
  refreshNow(): void;
  schedule(): void;
}

type ReconnectRefreshResult = 'complete' | 'retry';

export function useChatReconnect(
  refreshSession: () => ReconnectRefreshResult | Promise<ReconnectRefreshResult> | void,
) {
  const attemptRef = useRef(0);
  const authFailureRef = useRef(0);
  const setupFailureRef = useRef(0);
  const activeCycleRef = useRef<ReconnectCycle | null>(null);

  function resetCounters() {
    attemptRef.current = 0;
    authFailureRef.current = 0;
    setupFailureRef.current = 0;
  }

  function cancelActiveCycle() {
    activeCycleRef.current?.dispose();
    activeCycleRef.current = null;
  }

  function reset() {
    cancelActiveCycle();
    resetCounters();
  }

  function manualReconnect() {
    if (activeCycleRef.current?.isRefreshInFlight()) return;
    reset();
    beginCycle().refreshNow();
  }

  function beginCycle(): ReconnectCycle {
    let disposed = false;
    let ready = false;
    let refreshInFlight = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cycle: ReconnectCycle = {
      dispose() {
        if (disposed) return;
        disposed = true;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        if (activeCycleRef.current === cycle) {
          activeCycleRef.current = null;
        }
      },
      isRefreshInFlight() {
        return refreshInFlight;
      },
      onClose(event?: CloseEvent) {
        if (disposed || ready) return false;

        if (isAuthenticationClose(event)) {
          authFailureRef.current += 1;
        } else if (!event || event.code === 1005 || event.code === 1006) {
          // Browsers collapse accepted-but-aborted sockets, rejected upgrades,
          // and transient setup failures into no-status/1006 signals. Allow a
          // generous retry window before requiring operator intervention.
          setupFailureRef.current += 1;
        }

        const shouldStop = authFailureRef.current >= FAILURE_LIMIT
          || setupFailureRef.current >= SETUP_FAILURE_LIMIT;
        if (shouldStop && timer) {
          clearTimeout(timer);
          timer = null;
        }
        return shouldStop;
      },
      onReady() {
        ready = true;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        resetCounters();
      },
      refreshNow() {
        if (disposed || refreshInFlight) return;
        refreshInFlight = true;
        void Promise.resolve(refreshSession())
          .then((result) => {
            refreshInFlight = false;
            if (!disposed && result === 'retry') cycle.schedule();
          })
          .catch(() => {
            refreshInFlight = false;
            if (!disposed) cycle.schedule();
          });
      },
      schedule() {
        if (disposed || refreshInFlight || timer) return;
        const baseDelay = Math.min(BASE_DELAY_MS * (2 ** attemptRef.current), MAX_DELAY_MS);
        attemptRef.current += 1;
        const jitter = Math.floor(baseDelay * JITTER_RATIO * Math.random());
        const delay = Math.min(baseDelay + jitter, MAX_DELAY_MS);
        timer = setTimeout(() => {
          timer = null;
          cycle.refreshNow();
        }, delay);
      },
    };

    activeCycleRef.current = cycle;
    return cycle;
  }

  useEffect(() => () => {
    activeCycleRef.current?.dispose();
    activeCycleRef.current = null;
  }, []);

  return { beginCycle, manualReconnect, reset };
}
