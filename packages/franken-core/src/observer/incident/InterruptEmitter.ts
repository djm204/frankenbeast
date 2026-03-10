export interface InterruptSignal {
  traceId: string
  detectedPattern: string[]
  repetitions: number
  timestamp: number
}

type InterruptHandler = (signal: InterruptSignal) => void

/**
 * Async-safe interrupt signal bus. Delivers signals to all registered
 * handlers. Handler errors are caught and isolated — the emitter never
 * throws and always delivers to remaining handlers.
 */
export class InterruptEmitter {
  private readonly handlers = new Set<InterruptHandler>()

  emit(signal: InterruptSignal): void {
    for (const handler of this.handlers) {
      try {
        handler(signal)
      } catch {
        // Isolate handler failures; other handlers still receive the signal.
      }
    }
  }

  on(event: 'interrupt', handler: InterruptHandler): void {
    this.handlers.add(handler)
  }

  off(event: 'interrupt', handler: InterruptHandler): void {
    this.handlers.delete(handler)
  }
}
