export interface BeastSseEvent {
  id?: number;
  type: string;
  data: Record<string, unknown>;
}

type EventListener = (event: BeastSseEvent) => void | Promise<void>;

export interface BeastEventBusListenerError {
  event: BeastSseEvent;
  error: unknown;
  listener: EventListener;
}

export interface BeastEventBusOptions {
  maxBufferSize?: number;
  onListenerError?: (failure: BeastEventBusListenerError) => void | Promise<void>;
}

function reportDefaultListenerError({ event, error }: BeastEventBusListenerError): void {
  console.error('[BeastEventBus] Listener failed', {
    eventId: event.id,
    eventType: event.type,
    error,
  });
}

export class BeastEventBus {
  private sequence = 0;
  private readonly listeners = new Set<EventListener>();
  private readonly buffer: BeastSseEvent[] = [];
  private readonly maxBufferSize: number;
  private readonly onListenerError: (failure: BeastEventBusListenerError) => void | Promise<void>;

  constructor(maxBufferSizeOrOptions: number | BeastEventBusOptions = 1000) {
    const options = typeof maxBufferSizeOrOptions === 'number'
      ? { maxBufferSize: maxBufferSizeOrOptions }
      : maxBufferSizeOrOptions;

    this.maxBufferSize = options.maxBufferSize ?? 1000;
    this.onListenerError = options.onListenerError ?? reportDefaultListenerError;
  }

  publish(event: Omit<BeastSseEvent, 'id'>): void {
    this.sequence += 1;
    const stamped: BeastSseEvent = { ...event, id: this.sequence };

    this.buffer.push(stamped);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }

    for (const listener of this.listeners) {
      try {
        const result = listener(stamped);
        if (result && typeof result.catch === 'function') {
          result.catch((error: unknown) => this.reportListenerError(stamped, error, listener));
        }
      } catch (error) {
        this.reportListenerError(stamped, error, listener);
      }
    }
  }

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  replaySince(lastEventId: number): BeastSseEvent[] {
    return this.buffer.filter((e) => e.id !== undefined && e.id > lastEventId);
  }

  private reportListenerError(event: BeastSseEvent, error: unknown, listener: EventListener): void {
    try {
      const result = this.onListenerError({ event, error, listener });
      if (result && typeof result.catch === 'function') {
        result.catch((handlerError: unknown) => {
          reportDefaultListenerError({ event, error: handlerError, listener });
        });
      }
    } catch (handlerError) {
      reportDefaultListenerError({ event, error: handlerError, listener });
    }
  }
}
