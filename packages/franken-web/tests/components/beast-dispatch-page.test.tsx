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
        onResume={vi.fn()}
        onRefresh={vi.fn()}
        onSelectAgent={vi.fn()}
        onStop={vi.fn()}
        agentDetail={{
          agent: {
            id: 'agent-1',
            definitionId: 'chunk-plan',
            status: 'running',
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
            status: 'running',
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
    expect(screen.getByLabelText('Design Doc -> Chunk Creation designDocPath')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Choose file for Design Doc -> Chunk Creation designDocPath' })).toBeNull();
    expect(screen.getByText('started from chat')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Pause run-1' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Kill run-1' })).toBeDefined();
    expect(screen.getByText('sent planning command')).toBeDefined();
  });

  it('validates file and directory path fields before launch and submits tracked-agent config', () => {
    const onDispatch = vi.fn();
    const onSelectAgent = vi.fn();
    const onStop = vi.fn();
    const onKill = vi.fn();
    const onResume = vi.fn();

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
        onResume={onResume}
        onRefresh={vi.fn()}
        onSelectAgent={onSelectAgent}
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
    fireEvent.click(screen.getByRole('button', { name: 'Pause run-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kill run-1' }));

    expect(onDispatch).toHaveBeenCalledWith('martin-loop', {
      provider: 'claude',
      objective: 'Ship monitoring',
      chunkDirectory: 'docs/chunks',
    });
    expect((screen.getByLabelText('Design Doc -> Chunk Creation designDocPath') as HTMLInputElement).value).toBe('docs/plans/design.md');
    expect(onSelectAgent).toHaveBeenCalledWith('agent-1');
    expect(onStop).toHaveBeenCalledWith('run-1');
    expect(onKill).toHaveBeenCalledWith('run-1');
  });

  it('rejects browser fake file paths for design-doc dispatch', () => {
    const onDispatch = vi.fn();

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
        onDispatch={onDispatch}
        onKill={vi.fn()}
        onResume={vi.fn()}
        onRefresh={vi.fn()}
        onSelectAgent={vi.fn()}
        onStop={vi.fn()}
        agentDetail={null}
        agents={[]}
        selectedAgentId={null}
      />,
    );

    fireEvent.change(screen.getByLabelText('Design Doc -> Chunk Creation designDocPath'), {
      target: { value: 'C:\\fakepath\\2026-03-08-productivity-integrations-implementation-plan.md' },
    });
    fireEvent.change(screen.getByLabelText('Design Doc -> Chunk Creation outputDir'), {
      target: { value: 'docs/chunks' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Launch Design Doc -> Chunk Creation' }));

    expect(screen.getByText('Browser file pickers cannot provide a server path. Enter a repo path manually.')).toBeDefined();
    expect(onDispatch).not.toHaveBeenCalled();
  });

  it('shows resume for stopped tracked agents', () => {
    const onResume = vi.fn();

    render(
      <BeastDispatchPage
        catalog={[]}
        disabled={false}
        error={null}
        onDispatch={vi.fn()}
        onKill={vi.fn()}
        onResume={onResume}
        onRefresh={vi.fn()}
        onSelectAgent={vi.fn()}
        onStop={vi.fn()}
        agentDetail={null}
        agents={[
          {
            id: 'agent-stopped',
            definitionId: 'martin-loop',
            status: 'stopped',
            source: 'dashboard',
            createdByUser: 'operator',
            initAction: {
              kind: 'martin-loop',
              command: 'martin-loop',
              config: {
                provider: 'claude',
                objective: 'Resume work',
                chunkDirectory: 'docs/chunks',
              },
            },
            initConfig: {
              provider: 'claude',
              objective: 'Resume work',
              chunkDirectory: 'docs/chunks',
            },
            dispatchRunId: 'run-stopped',
            createdAt: '2026-03-10T00:00:00.000Z',
            updatedAt: '2026-03-10T00:00:02.000Z',
          },
        ]}
        selectedAgentId={null}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Resume agent-stopped' }));

    expect(onResume).toHaveBeenCalledWith('agent-stopped');
    expect(screen.queryByRole('button', { name: 'Pause run-stopped' })).toBeNull();
  });
});
