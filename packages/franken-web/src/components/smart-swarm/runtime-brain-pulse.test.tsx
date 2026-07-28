import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  RuntimeEvent,
  RuntimeProvider,
  RuntimeSnapshot,
} from '../../lib/smart-swarm-api';
import { RuntimeBrainPulse } from './runtime-brain-pulse';

const provider: RuntimeProvider = {
  id: 'hermes',
  runtime: 'hermes',
  displayName: 'Hermes',
  health: { state: 'connected', checkedAt: '2026-07-28T00:00:00.000Z' },
  capabilities: {
    snapshot: { status: 'supported' },
    streaming: { status: 'supported' },
    logs: { status: 'supported' },
    blockers: { status: 'supported' },
    approvals: { status: 'supported' },
    pause: { status: 'unsupported', reason: 'Unavailable.' },
    resume: { status: 'unsupported', reason: 'Unavailable.' },
    cancellation: { status: 'unsupported', reason: 'Unavailable.' },
    policyActions: { status: 'unsupported', reason: 'Unavailable.' },
  },
};

const snapshot: RuntimeSnapshot = {
  providerId: 'hermes',
  state: 'ready',
  capturedAt: '2026-07-28T00:00:00.000Z',
  workspaces: { status: 'available', data: [] },
  agents: { status: 'available', data: [] },
  tasks: { status: 'available', data: [] },
  runs: { status: 'available', data: [] },
  events: { status: 'available', data: [] },
  blockers: { status: 'available', data: [] },
  approvals: { status: 'available', data: [] },
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('RuntimeBrainPulse', () => {
  it('prunes pulses when their source timestamp leaves the one-minute window', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-07-28T00:01:00.000Z');
    vi.setSystemTime(now);
    const event: RuntimeEvent = {
      id: 'event-expiring',
      cursor: 'cursor-expiring',
      workspaceId: 'board-main',
      taskId: 'task-1',
      runId: 'run-1',
      type: 'comment',
      occurredAt: new Date(now.getTime() - 59_000).toISOString(),
      summary: 'Review requested',
    };
    render(
      <RuntimeBrainPulse
        connection="connected"
        events={[event]}
        onOpenTask={() => undefined}
        provider={provider}
        snapshot={snapshot}
      />,
    );
    expect(screen.getByRole('region', { name: 'Runtime brain pulse' }).getAttribute('data-pulse-state')).toBe('active');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(screen.getByRole('region', { name: 'Runtime brain pulse' }).getAttribute('data-pulse-state')).toBe('idle');
    expect(screen.queryByText('Review requested')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('No activity');
  });

  it('deduplicates replayed normalized events by provider and event identity', () => {
    const event: RuntimeEvent = {
      id: 'event-1',
      cursor: 'cursor-1',
      workspaceId: 'board-main',
      taskId: 'task-1',
      runId: 'run-1',
      type: 'lifecycle',
      occurredAt: new Date().toISOString(),
      summary: 'Task started',
    };
    render(
      <RuntimeBrainPulse
        connection="connected"
        events={[event, { ...event }]}
        onOpenTask={() => undefined}
        provider={provider}
        snapshot={snapshot}
      />,
    );

    const pulse = screen.getByRole('region', { name: 'Runtime brain pulse' });
    expect(pulse.textContent).toContain('1 event in the last minute');
    expect(pulse.getAttribute('data-pulse-state')).toBe('active');
    expect(pulse.textContent)
      .toContain('Task started');
    expect(screen.getAllByRole('button', { name: 'Open source task task-1 for event event-1' })).toHaveLength(1);
  });

  it('announces no activity only while the supported stream is connected', () => {
    render(
      <RuntimeBrainPulse
        connection="connected"
        events={[]}
        onOpenTask={() => undefined}
        provider={provider}
        snapshot={snapshot}
      />,
    );

    const status = screen.getByRole('status');
    expect(status.textContent).toContain('No activity');
    expect(status.textContent).toContain('Connected');
  });

  it('announces a disconnected stream without presenting stale activity as live', () => {
    render(
      <RuntimeBrainPulse
        connection="reconnecting"
        events={[]}
        onOpenTask={() => undefined}
        provider={provider}
        snapshot={snapshot}
      />,
    );

    const status = screen.getByRole('alert');
    expect(status.textContent).toContain('Disconnected');
    expect(status.textContent).toContain('Reconnecting');
    expect(status.textContent).not.toContain('No activity');
  });

  it('labels retained recent evidence as stale instead of an active pulse while disconnected', () => {
    const event: RuntimeEvent = {
      id: 'event-stale',
      cursor: 'cursor-stale',
      workspaceId: 'board-main',
      taskId: 'task-1',
      runId: 'run-1',
      type: 'log',
      occurredAt: new Date().toISOString(),
      summary: 'Previously received evidence',
    };
    render(
      <RuntimeBrainPulse
        connection="reconnecting"
        events={[event]}
        onOpenTask={() => undefined}
        provider={provider}
        snapshot={snapshot}
      />,
    );

    const pulse = screen.getByRole('region', { name: 'Runtime brain pulse' });
    expect(pulse.getAttribute('data-pulse-state')).toBe('stale');
    expect(pulse.textContent).toContain('1 retained event · not live');
    expect(pulse.textContent).toContain('Previously received evidence');
    expect(pulse.textContent).not.toContain('1 event in the last minute');
  });

  it('announces degraded normalized evidence separately from connection loss', () => {
    render(
      <RuntimeBrainPulse
        connection="connected"
        events={[]}
        onOpenTask={() => undefined}
        provider={provider}
        snapshot={{ ...snapshot, state: 'degraded', message: 'One Hermes database is temporarily locked.' }}
      />,
    );

    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Degraded');
    expect(status.textContent).toContain('One Hermes database is temporarily locked.');
    expect(status.textContent).not.toContain('No activity');
    expect(status.textContent).not.toContain('Disconnected');
  });

  it('politely announces arriving event count changes without an alert', () => {
    const { rerender } = render(
      <RuntimeBrainPulse
        connection="connected"
        events={[]}
        onOpenTask={() => undefined}
        provider={provider}
        snapshot={snapshot}
      />,
    );
    const event: RuntimeEvent = {
      id: 'event-announced',
      cursor: 'cursor-announced',
      workspaceId: 'board-main',
      taskId: null,
      runId: null,
      type: 'comment',
      occurredAt: new Date().toISOString(),
      summary: 'A new review comment arrived',
    };

    rerender(
      <RuntimeBrainPulse
        connection="connected"
        events={[event]}
        onOpenTask={() => undefined}
        provider={provider}
        snapshot={snapshot}
      />,
    );

    const announcement = document.querySelector('[aria-live="polite"]');
    expect(announcement?.textContent).toBe('1 event in the last minute');
    expect(announcement?.getAttribute('aria-live')).toBe('polite');
    expect(announcement?.getAttribute('aria-atomic')).toBe('true');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders unsupported as a semantic state instead of no activity', () => {
    render(
      <RuntimeBrainPulse
        connection="unavailable"
        events={[]}
        onOpenTask={() => undefined}
        provider={{
          ...provider,
          capabilities: {
            ...provider.capabilities,
            streaming: { status: 'unsupported', reason: 'This runtime has no event stream.' },
          },
        }}
        snapshot={{
          ...snapshot,
          events: { status: 'unsupported', reason: 'This runtime has no event history.' },
        }}
      />,
    );

    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Unsupported');
    expect(status.textContent).toContain('This runtime has no event stream.');
    expect(status.textContent).not.toContain('No activity');
  });

  it('keeps a supported live stream available when event history is unsupported', () => {
    render(
      <RuntimeBrainPulse
        connection="connected"
        events={[]}
        onOpenTask={() => undefined}
        provider={provider}
        snapshot={{
          ...snapshot,
          events: { status: 'unsupported', reason: 'This runtime has no event history.' },
        }}
      />,
    );

    const status = screen.getByRole('status');
    expect(status.textContent).toContain('No activity');
    expect(status.textContent).not.toContain('Unsupported');
    expect(status.textContent).not.toContain('event history');
  });

  it.each([
    {
      label: 'snapshot unavailable',
      expectedReason: 'Snapshot source unavailable.',
      ignoredReason: 'The runtime provider is healthy.',
      testProvider: provider,
      testSnapshot: { ...snapshot, state: 'unavailable' as const, message: 'Snapshot source unavailable.' },
    },
    {
      label: 'provider schema incompatible',
      expectedReason: 'Provider schema incompatible.',
      ignoredReason: 'Snapshot data is stale but readable.',
      testProvider: {
        ...provider,
        health: { ...provider.health, state: 'schema-incompatible' as const, message: 'Provider schema incompatible.' },
      },
      testSnapshot: { ...snapshot, message: 'Snapshot data is stale but readable.' },
    },
  ])('preserves $label while the event transport is connected', ({
    expectedReason,
    ignoredReason,
    testProvider,
    testSnapshot,
  }) => {
    render(
      <RuntimeBrainPulse
        connection="connected"
        events={[]}
        onOpenTask={() => undefined}
        provider={testProvider}
        snapshot={testSnapshot}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Unavailable');
    expect(alert.textContent).toContain(expectedReason);
    expect(alert.textContent).not.toContain(ignoredReason);
    expect(alert.textContent).not.toContain('Connected');
    expect(alert.textContent).not.toContain('No activity');
  });

  it('prioritizes a known runtime failure while the event transport reconnects', () => {
    render(
      <RuntimeBrainPulse
        connection="reconnecting"
        events={[]}
        onOpenTask={() => undefined}
        provider={provider}
        snapshot={{ ...snapshot, state: 'schema-incompatible', message: 'Hermes schema version is incompatible.' }}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Unavailable');
    expect(alert.textContent).toContain('Hermes schema version is incompatible.');
    expect(alert.textContent).not.toContain('Disconnected');
    expect(alert.textContent).not.toContain('Reconnecting');
  });

  it('discloses when the displayed event count reaches its retention limit', () => {
    const now = new Date();
    const events = Array.from({ length: 100 }, (_, index): RuntimeEvent => ({
      id: `event-${index}`,
      cursor: `cursor-${index}`,
      workspaceId: 'board-main',
      taskId: null,
      runId: null,
      type: 'log',
      occurredAt: now.toISOString(),
      summary: `Event ${index}`,
    }));

    render(
      <RuntimeBrainPulse
        connection="connected"
        eventLimit={100}
        events={events}
        onOpenTask={() => undefined}
        provider={provider}
        snapshot={snapshot}
      />,
    );

    expect(document.querySelector('[aria-live="polite"]')?.textContent)
      .toBe('Latest 100 retained events from the last minute');
  });
});
