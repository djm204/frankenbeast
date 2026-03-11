import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BeastDispatchPage } from '../../src/pages/beast-dispatch-page';

afterEach(cleanup);

describe('BeastDispatchPage', () => {
  it('renders typed dispatch forms, tracked agents, and startup logs', () => {
    render(
      <BeastDispatchPage
        catalog={[
          {
            id: 'chunk-plan',
            label: 'Design Doc -> Chunk Creation',
            description: 'Build chunks from a design doc',
            executionModeDefault: 'process',
            interviewPrompts: [
              { key: 'designDocPath', prompt: 'Design doc', kind: 'file', required: true },
              { key: 'outputDir', prompt: 'Output directory', kind: 'string', required: true },
            ],
          },
        ]}
        disabled={false}
        error={null}
        onDispatch={vi.fn()}
        onKill={vi.fn()}
        onRefresh={vi.fn()}
        onRestart={vi.fn()}
        onSelectAgent={vi.fn()}
        onStart={vi.fn()}
        onStop={vi.fn()}
        agentDetail={{
          agent: {
            id: 'agent-1',
            definitionId: 'chunk-plan',
            status: 'dispatching',
            source: 'chat',
            createdByUser: 'chat-session:1',
            initAction: {
              kind: 'chunk-plan',
              command: '/plan --design-doc docs/plans/design.md',
              config: { designDocPath: 'docs/plans/design.md' },
              chatSessionId: 'chat-session:1',
            },
            initConfig: { designDocPath: 'docs/plans/design.md' },
            dispatchRunId: 'run-1',
            chatSessionId: 'chat-session:1',
            createdAt: '2026-03-10T00:00:00.000Z',
            updatedAt: '2026-03-10T00:00:02.000Z',
          },
          events: [{ id: 'event-1', agentId: 'agent-1', sequence: 1, level: 'info', type: 'agent.command.sent', message: 'sent planning command', payload: {}, createdAt: '2026-03-10T00:00:01.000Z' }],
          run: {
            run: {
              id: 'run-1',
              definitionId: 'chunk-plan',
              status: 'running',
              dispatchedBy: 'chat',
              dispatchedByUser: 'chat-session:1',
              attemptCount: 1,
              createdAt: '2026-03-10T00:00:00.000Z',
            },
            attempts: [],
            events: [],
            logs: ['started from chat'],
          },
        }}
        agents={[
          {
            id: 'agent-1',
            definitionId: 'chunk-plan',
            status: 'dispatching',
            source: 'chat',
            createdByUser: 'chat-session:1',
            initAction: {
              kind: 'chunk-plan',
              command: '/plan --design-doc docs/plans/design.md',
              config: { designDocPath: 'docs/plans/design.md' },
              chatSessionId: 'chat-session:1',
            },
            initConfig: { designDocPath: 'docs/plans/design.md' },
            dispatchRunId: 'run-1',
            chatSessionId: 'chat-session:1',
            createdAt: '2026-03-10T00:00:00.000Z',
            updatedAt: '2026-03-10T00:00:02.000Z',
          },
        ]}
        selectedAgentId="agent-1"
      />,
    );

    expect(screen.getByText('Dispatch Station')).toBeDefined();
    expect(screen.getByText('Design Doc -> Chunk Creation')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Choose file for Design Doc -> Chunk Creation designDocPath' })).toBeDefined();
    expect(screen.getByText('started from chat')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Stop run-1' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Kill run-1' })).toBeDefined();
    expect(screen.getByText('sent planning command')).toBeDefined();
  });

  it('validates file and directory path fields before launch and submits tracked-agent config', () => {
    const onDispatch = vi.fn();
    const onSelectAgent = vi.fn();
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
              { key: 'chunkDirectory', prompt: 'Chunk directory', kind: 'directory', required: true },
            ],
          },
          {
            id: 'chunk-plan',
            label: 'Design Doc -> Chunk Creation',
            description: 'Build chunks from a design doc',
            executionModeDefault: 'process',
            interviewPrompts: [
              { key: 'designDocPath', prompt: 'Design doc', kind: 'file', required: true },
              { key: 'outputDir', prompt: 'Output directory', kind: 'string', required: true },
            ],
          },
        ]}
        disabled={false}
        error={null}
        onDispatch={onDispatch}
        onKill={onKill}
        onRefresh={vi.fn()}
        onRestart={onRestart}
        onSelectAgent={onSelectAgent}
        onStart={onStart}
        onStop={onStop}
        agentDetail={null}
        agents={[
          {
            id: 'agent-1',
            definitionId: 'martin-loop',
            status: 'running',
            source: 'dashboard',
            createdByUser: 'operator',
            initAction: {
              kind: 'martin-loop',
              command: 'martin-loop',
              config: {},
            },
            initConfig: {},
            dispatchRunId: 'run-1',
            createdAt: '2026-03-10T00:00:00.000Z',
            updatedAt: '2026-03-10T00:00:02.000Z',
          },
        ]}
        selectedAgentId={null}
      />,
    );

    fireEvent.change(screen.getByLabelText('Design Doc -> Chunk Creation designDocPath'), { target: { value: 'docs/chunks/' } });
    fireEvent.change(screen.getByLabelText('Design Doc -> Chunk Creation outputDir'), { target: { value: 'docs/chunks' } });
    fireEvent.click(screen.getByRole('button', { name: 'Launch Design Doc -> Chunk Creation' }));

    expect(screen.getByText('Enter a file path, not a directory path.')).toBeDefined();
    expect(onDispatch).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Martin Loop provider'), { target: { value: 'claude' } });
    fireEvent.change(screen.getByLabelText('Martin Loop objective'), { target: { value: 'Ship monitoring' } });
    fireEvent.change(screen.getByLabelText('Martin Loop chunkDirectory'), { target: { value: 'docs/chunks' } });
    fireEvent.change(screen.getByLabelText('Design Doc -> Chunk Creation designDocPath'), { target: { value: 'docs/plans/design.md' } });
    fireEvent.click(screen.getByRole('button', { name: 'Choose directory for Martin Loop chunkDirectory' }));
    fireEvent.click(screen.getByRole('button', { name: 'Launch Martin Loop' }));
    fireEvent.click(screen.getByRole('button', { name: 'Inspect agent-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start run-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restart run-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop run-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kill run-1' }));

    expect(onDispatch).toHaveBeenCalledWith('martin-loop', {
      provider: 'claude',
      objective: 'Ship monitoring',
      chunkDirectory: 'docs/chunks',
    });
    expect((screen.getByLabelText('Design Doc -> Chunk Creation designDocPath') as HTMLInputElement).value).toBe('docs/plans/design.md');
    expect(onSelectAgent).toHaveBeenCalledWith('agent-1');
    expect(onStart).toHaveBeenCalledWith('run-1');
    expect(onRestart).toHaveBeenCalledWith('run-1');
    expect(onStop).toHaveBeenCalledWith('run-1');
    expect(onKill).toHaveBeenCalledWith('run-1');
  });
});
