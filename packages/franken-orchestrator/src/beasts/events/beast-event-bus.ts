export interface BeastSseEvent {
  id?: number;
  type: string;
  data: Record<string, unknown>;
}

type EventListener = (event: BeastSseEvent) => void | Promise<void>;

export class BeastEventBus {
  private sequence = 0;
  private readonly listeners = new Set<EventListener>();
  private readonly buffer: BeastSseEvent[] = [];
  private readonly maxBufferSize: number;

  constructor(maxBufferSize = 1000) {
    this.maxBufferSize = maxBufferSize;
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
          result.catch(() => {});
        }
      } catch {
        // Don't let a failing sync listener break others
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
}
