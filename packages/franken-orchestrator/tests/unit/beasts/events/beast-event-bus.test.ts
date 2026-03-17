import { describe, it, expect } from 'vitest';
import { BeastEventBus, type BeastSseEvent } from '../../../../src/beasts/events/beast-event-bus.js';

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

  it('returns empty array if no events to replay', () => {
    const bus = new BeastEventBus();

    bus.publish({ type: 'agent.status', data: { agentId: 'a1', status: 'running', updatedAt: '' } });

    const missed = bus.replaySince(1);
    expect(missed).toHaveLength(0);
  });
});
