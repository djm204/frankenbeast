import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NetworkServiceList } from '../../src/components/network-service-list';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const runningService = {
  id: 'chat-gateway',
  status: 'running',
};

function renderServiceList(overrides: Partial<ComponentProps<typeof NetworkServiceList>> = {}) {
  const handlers = {
    onSelectLogs: vi.fn(),
    onStart: vi.fn(),
    onStop: vi.fn(),
    onRestart: vi.fn(),
  };

  render(
    <NetworkServiceList
      services={[runningService]}
      {...handlers}
      {...overrides}
    />,
  );

  return handlers;
}

describe('NetworkServiceList destructive action confirmations', () => {
  it('requires a second explicit action before stopping a service', () => {
    const handlers = renderServiceList();

    fireEvent.click(screen.getByRole('button', { name: 'Stop chat-gateway' }));

    expect(handlers.onStop).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText('Stop chat-gateway?')).toBeTruthy();
    expect(screen.getByText(/interrupt active sessions/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(handlers.onStop).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Stop chat-gateway' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm stop chat-gateway' }));

    expect(handlers.onStop).toHaveBeenCalledTimes(1);
    expect(handlers.onStop).toHaveBeenCalledWith('chat-gateway');
  });

  it('supports keyboard cancellation and confirmation before restarting a service', () => {
    const handlers = renderServiceList();

    fireEvent.click(screen.getByRole('button', { name: 'Restart chat-gateway' }));

    expect(handlers.onRestart).not.toHaveBeenCalled();
    expect(screen.getByText('Restart chat-gateway?')).toBeTruthy();
    expect(screen.getByText(/interrupt active sessions/i)).toBeTruthy();

    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(handlers.onRestart).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Restart chat-gateway' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm restart chat-gateway' }));

    expect(handlers.onRestart).toHaveBeenCalledTimes(1);
    expect(handlers.onRestart).toHaveBeenCalledWith('chat-gateway');
  });
});
