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

export type BeastEventReplaySnapshot = readonly BeastSseEvent[];

function reportDefaultListenerError({ event, error }: BeastEventBusListenerError): void {
  console.error('[BeastEventBus] Listener failed', {
    eventId: event.id,
    eventType: event.type,
    error,
  });
}

function cloneJsonCompatibleValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => cloneJsonCompatibleValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        cloneJsonCompatibleValue(nestedValue),
      ]),
    );
  }

  return value;
}

function cloneValue(value: unknown): unknown {
  try {
    return structuredClone(value);
  } catch {
    return cloneJsonCompatibleValue(value);
  }
}

function cloneEvent(event: BeastSseEvent): BeastSseEvent {
  return {
    ...event,
    data: cloneValue(event.data) as Record<string, unknown>,
  };
}

function isRecordPayload(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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

  static fromReplaySnapshot(
    snapshot: BeastEventReplaySnapshot,
    maxBufferSizeOrOptions?: number | BeastEventBusOptions,
  ): BeastEventBus {
    const options = maxBufferSizeOrOptions ?? { maxBufferSize: Math.max(1000, snapshot.length) };
    const resolvedMaxBufferSize = typeof options === 'number' ? options : (options.maxBufferSize ?? 1000);
    if (resolvedMaxBufferSize < snapshot.length) {
      throw new Error('Replay snapshot length exceeds configured maxBufferSize');
    }

    const bus = new BeastEventBus(options);
    bus.loadReplaySnapshot(snapshot);
    return bus;
  }

  publish(event: Omit<BeastSseEvent, 'id'>): void {
    this.sequence += 1;
    const stamped: BeastSseEvent = cloneEvent({ ...event, id: this.sequence });

    this.buffer.push(stamped);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }

    for (const listener of this.listeners) {
      const listenerEvent = cloneEvent(stamped);
      try {
        const result = listener(listenerEvent);
        if (result && typeof result.catch === 'function') {
          result.catch((error: unknown) => this.reportListenerError(listenerEvent, error, listener));
        }
      } catch (error) {
        this.reportListenerError(listenerEvent, error, listener);
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
    return this.buffer.filter((e) => e.id !== undefined && e.id > lastEventId).map((event) => cloneEvent(event));
  }

  exportReplaySnapshot(): BeastEventReplaySnapshot {
    return this.buffer.map((event) => cloneEvent(event));
  }

  private loadReplaySnapshot(snapshot: BeastEventReplaySnapshot): void {
    let previousId = 0;
    for (const event of snapshot) {
      const eventId = event.id;
      if (eventId === undefined || !Number.isSafeInteger(eventId) || eventId <= previousId) {
        throw new Error('Replay snapshot event ids must be strictly increasing safe integers');
      }
      if (!event.type) {
        throw new Error('Replay snapshot events must include a non-empty type');
      }
      if (!isRecordPayload(event.data)) {
        throw new Error('Replay snapshot events must include an object data payload');
      }
      const cloned = cloneEvent(event);
      this.buffer.push(cloned);
      if (this.buffer.length > this.maxBufferSize) {
        this.buffer.shift();
      }
      previousId = eventId;
    }
    this.sequence = previousId;
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
