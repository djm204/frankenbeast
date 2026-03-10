import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BeastDispatchPage } from '../../src/pages/beast-dispatch-page';

afterEach(cleanup);

describe('BeastDispatchPage', () => {
  it('renders dispatch forms, active runs, and run detail logs', () => {
    render(
      <BeastDispatchPage
        catalog={[
          {
            id: 'martin-loop',
            label: 'Martin Loop',
            description: 'Run Martin loop',
            executionModeDefault: 'process',
            interviewPrompts: [
              { key: 'provider', prompt: 'Provider', kind: 'string', options: ['claude', 'codex'] },
              { key: 'objective', prompt: 'Objective', kind: 'string' },
            ],
          },
        ]}
        disabled={false}
        error={null}
        onDispatch={vi.fn()}
        onKill={vi.fn()}
        onRefresh={vi.fn()}
        onRestart={vi.fn()}
        onSelectRun={vi.fn()}
        onStart={vi.fn()}
        onStop={vi.fn()}
        runDetail={{
          run: {
            id: 'run-1',
            definitionId: 'martin-loop',
            status: 'running',
            dispatchedBy: 'chat',
            dispatchedByUser: 'chat-session:1',
            attemptCount: 1,
            createdAt: '2026-03-10T00:00:00.000Z',
          },
          attempts: [],
          events: [{ id: 'event-1', runId: 'run-1', sequence: 1, type: 'attempt.started', payload: {}, createdAt: '2026-03-10T00:00:01.000Z' }],
          logs: ['started from chat'],
        }}
        runs={[
          {
            id: 'run-1',
            definitionId: 'martin-loop',
            status: 'running',
            dispatchedBy: 'chat',
            dispatchedByUser: 'chat-session:1',
            attemptCount: 1,
            createdAt: '2026-03-10T00:00:00.000Z',
          },
        ]}
        selectedRunId="run-1"
      />,
    );

    expect(screen.getByText('Dispatch Station')).toBeDefined();
    expect(screen.getByText('Martin Loop')).toBeDefined();
    expect(screen.getByText('started from chat')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Stop run-1' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Kill run-1' })).toBeDefined();
  });

  it('submits Beast config and run controls through callbacks', () => {
    const onDispatch = vi.fn();
    const onSelectRun = vi.fn();
    const onStart = vi.fn();
    const onStop = vi.fn();
    const onKill = vi.fn();
    const onRestart = vi.fn();

    render(
      <BeastDispatchPage
        catalog={[
          {
            id: 'martin-loop',
            label: 'Martin Loop',
            description: 'Run Martin loop',
            executionModeDefault: 'process',
            interviewPrompts: [
              { key: 'provider', prompt: 'Provider', kind: 'string', options: ['claude', 'codex'] },
              { key: 'objective', prompt: 'Objective', kind: 'string' },
            ],
          },
        ]}
        disabled={false}
        error={null}
        onDispatch={onDispatch}
        onKill={onKill}
        onRefresh={vi.fn()}
        onRestart={onRestart}
        onSelectRun={onSelectRun}
        onStart={onStart}
        onStop={onStop}
        runDetail={null}
        runs={[
          {
            id: 'run-1',
            definitionId: 'martin-loop',
            status: 'stopped',
            dispatchedBy: 'dashboard',
            dispatchedByUser: 'operator',
            attemptCount: 2,
            createdAt: '2026-03-10T00:00:00.000Z',
          },
        ]}
        selectedRunId={null}
      />,
    );

    fireEvent.change(screen.getByLabelText('Martin Loop provider'), { target: { value: 'claude' } });
    fireEvent.change(screen.getByLabelText('Martin Loop objective'), { target: { value: 'Ship monitoring' } });
    fireEvent.click(screen.getByRole('button', { name: 'Launch Martin Loop' }));
    fireEvent.click(screen.getByRole('button', { name: 'Inspect run-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start run-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restart run-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop run-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kill run-1' }));

    expect(onDispatch).toHaveBeenCalledWith('martin-loop', {
      provider: 'claude',
      objective: 'Ship monitoring',
    });
    expect(onSelectRun).toHaveBeenCalledWith('run-1');
    expect(onStart).toHaveBeenCalledWith('run-1');
    expect(onRestart).toHaveBeenCalledWith('run-1');
    expect(onStop).toHaveBeenCalledWith('run-1');
    expect(onKill).toHaveBeenCalledWith('run-1');
  });
});
