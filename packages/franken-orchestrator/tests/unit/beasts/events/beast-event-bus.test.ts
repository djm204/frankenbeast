import { describe, it, expect, vi } from 'vitest';
import {
  BeastEventBus,
  type BeastEventBusListenerError,
  type BeastSseEvent,
} from '../../../../src/beasts/events/beast-event-bus.js';

describe('BeastEventBus', () => {
  it('delivers events to subscribers', () => {
    const bus = new BeastEventBus();
    const received: BeastSseEvent[] = [];
    bus.subscribe((event) => received.push(event));

    bus.publish({
      type: 'agent.status',
      data: { agentId: 'agent_1', status: 'running', updatedAt: '2026-03-16T00:00:00Z' },
    });

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('agent.status');
  });

  it('assigns monotonic sequence IDs', () => {
    const bus = new BeastEventBus();
    const received: BeastSseEvent[] = [];
    bus.subscribe((event) => received.push(event));

    bus.publish({ type: 'agent.status', data: { agentId: 'a1', status: 'running', updatedAt: '' } });
    bus.publish({ type: 'agent.status', data: { agentId: 'a2', status: 'failed', updatedAt: '' } });

    expect(received[0].id).toBe(1);
    expect(received[1].id).toBe(2);
  });

  it('supports unsubscribe', () => {
    const bus = new BeastEventBus();
    const received: BeastSseEvent[] = [];
    const unsub = bus.subscribe((event) => received.push(event));

    bus.publish({ type: 'agent.status', data: { agentId: 'a1', status: 'running', updatedAt: '' } });
    unsub();
    bus.publish({ type: 'agent.status', data: { agentId: 'a2', status: 'running', updatedAt: '' } });

    expect(received).toHaveLength(1);
  });

  it('reports sync listener errors without stopping later listeners', () => {
    const errors: BeastEventBusListenerError[] = [];
    const bus = new BeastEventBus({ onListenerError: (failure) => errors.push(failure) });
    const received: BeastSseEvent[] = [];
    const thrown = new Error('listener exploded');
    const failingListener = () => {
      throw thrown;
    };

    bus.subscribe(failingListener);
    bus.subscribe((event) => received.push(event));

    bus.publish({ type: 'agent.status', data: { agentId: 'a1', status: 'running', updatedAt: '' } });

    expect(received).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ event: received[0], error: thrown, listener: failingListener });
  });

  it('reports async listener rejections without stopping later listeners', async () => {
    const errors: BeastEventBusListenerError[] = [];
    const bus = new BeastEventBus({ onListenerError: (failure) => errors.push(failure) });
    const received: BeastSseEvent[] = [];
    const rejected = new Error('stream write failed');
    const failingListener = async () => {
      throw rejected;
    };

    bus.subscribe(failingListener);
    bus.subscribe((event) => received.push(event));

    bus.publish({ type: 'run.log', data: { runId: 'r1', line: 'hello' } });
    await Promise.resolve();

    expect(received).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ event: received[0], error: rejected, listener: failingListener });
  });

  it('handles async listener error reporter rejections', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const listenerError = new Error('listener failed');
    const reporterError = new Error('reporter failed');
    const bus = new BeastEventBus({
      onListenerError: async () => {
        throw reporterError;
      },
    });

    try {
      bus.subscribe(async () => {
        throw listenerError;
      });

      bus.publish({ type: 'run.log', data: { runId: 'r1', line: 'hello' } });
      await Promise.resolve();
      await Promise.resolve();

      expect(consoleError).toHaveBeenCalledWith('[BeastEventBus] Listener failed', {
        eventId: 1,
        eventType: 'run.log',
        error: reporterError,
      });
    } finally {
      consoleError.mockRestore();
    }
  });

  it('replays events from a given sequence ID', () => {
    const bus = new BeastEventBus();

    bus.publish({ type: 'agent.status', data: { agentId: 'a1', status: 'running', updatedAt: '' } });
    bus.publish({ type: 'agent.status', data: { agentId: 'a2', status: 'failed', updatedAt: '' } });
    bus.publish({ type: 'run.log', data: { runId: 'r1', line: 'hello' } });

    const missed = bus.replaySince(1); // events after ID 1
    expect(missed).toHaveLength(2);
    expect(missed[0].id).toBe(2);
    expect(missed[1].id).toBe(3);
  });

  it('hydrates a deterministic replay snapshot for worker event stream fixtures', () => {
    const source = new BeastEventBus();
    source.publish({ type: 'worker.started', data: { workerId: 'w1', attempt: 1 } });
    source.publish({ type: 'worker.output', data: { workerId: 'w1', line: 'ready' } });

    const snapshot = source.exportReplaySnapshot();
    const replayed = BeastEventBus.fromReplaySnapshot(snapshot);

    expect(replayed.replaySince(0)).toEqual([
      { id: 1, type: 'worker.started', data: { workerId: 'w1', attempt: 1 } },
      { id: 2, type: 'worker.output', data: { workerId: 'w1', line: 'ready' } },
    ]);

    replayed.publish({ type: 'worker.finished', data: { workerId: 'w1', status: 'done' } });

    expect(replayed.replaySince(2)).toEqual([
      { id: 3, type: 'worker.finished', data: { workerId: 'w1', status: 'done' } },
    ]);
  });

  it('rejects malformed deterministic replay snapshots before stream replay', () => {
    expect(() => BeastEventBus.fromReplaySnapshot([
      { id: 1, type: 'worker.started', data: { workerId: 'w1' } },
      { id: 1, type: 'worker.output', data: { workerId: 'w1', line: 'duplicate' } },
    ])).toThrow('Replay snapshot event ids must be strictly increasing safe integers');
  });

  it('isolates listener mutations from later listeners and replay state', () => {
    const bus = new BeastEventBus();
    const received: BeastSseEvent[] = [];

    bus.subscribe((event) => {
      event.id = 999;
      event.type = 'corrupted';
      event.data.status = 'debug';
      event.data.extra = 'listener-only';
    });
    bus.subscribe((event) => received.push(event));

    bus.publish({
      type: 'agent.status',
      data: { agentId: 'a1', status: 'running', nested: { phase: 'boot' } },
    });

    expect(received).toEqual([
      {
        id: 1,
        type: 'agent.status',
        data: { agentId: 'a1', status: 'running', nested: { phase: 'boot' } },
      },
    ]);
    expect(bus.replaySince(0)).toEqual([
      {
        id: 1,
        type: 'agent.status',
        data: { agentId: 'a1', status: 'running', nested: { phase: 'boot' } },
      },
    ]);
  });

  it('returns replay copies so callers cannot mutate retained buffered events', () => {
    const bus = new BeastEventBus();

    bus.publish({ type: 'run.log', data: { runId: 'r1', line: 'original', meta: { level: 'info' } } });

    const firstReplay = bus.replaySince(0);
    firstReplay[0].id = 42;
    firstReplay[0].type = 'corrupted';
    firstReplay[0].data.line = 'mutated';
    (firstReplay[0].data.meta as Record<string, unknown>).level = 'debug';

    expect(bus.replaySince(0)).toEqual([
      { id: 1, type: 'run.log', data: { runId: 'r1', line: 'original', meta: { level: 'info' } } },
    ]);
  });

  it('preserves structured-cloneable payload values while isolating mutations', () => {
    const bus = new BeastEventBus();
    const observed: BeastSseEvent[] = [];
    const startedAt = new Date('2026-03-17T00:00:00.000Z');

    bus.subscribe((event) => observed.push(event));
    bus.publish({ type: 'agent.status', data: { agentId: 'a1', startedAt } });

    expect(observed[0].data.startedAt).toEqual(startedAt);
    expect(observed[0].data.startedAt).not.toBe(startedAt);
    expect(bus.replaySince(0)[0].data.startedAt).toEqual(startedAt);
  });

  it('evicts oldest events when buffer exceeds maxBufferSize', () => {
    const bus = new BeastEventBus(3); // buffer limited to 3
    bus.publish({ type: 'e', data: { n: 1 } });
    bus.publish({ type: 'e', data: { n: 2 } });
    bus.publish({ type: 'e', data: { n: 3 } });
    bus.publish({ type: 'e', data: { n: 4 } }); // evicts event 1

    const replay = bus.replaySince(0);
    expect(replay).toHaveLength(3);
    expect(replay[0].id).toBe(2);
    expect(replay[0].data).toEqual({ n: 2 });
    expect(replay[2].id).toBe(4);
    expect(replay[2].data).toEqual({ n: 4 });
  });

  it('returns empty array if no events to replay', () => {
    const bus = new BeastEventBus();

    bus.publish({ type: 'agent.status', data: { agentId: 'a1', status: 'running', updatedAt: '' } });

    const missed = bus.replaySince(1);
    expect(missed).toHaveLength(0);
  });
});
