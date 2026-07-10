import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { AgentDetailPanel } from '../../../src/components/beasts/agent-detail-panel';
import { useBeastStore } from '../../../src/stores/beast-store';

afterEach(cleanup);

const detail = {
  agent: {
    id: 'agent-1',
    definitionId: 'design-interview',
    status: 'running',
    source: 'dashboard',
    createdByUser: 'pfk',
    initAction: { kind: 'design-interview' as const, command: '/interview', config: {} },
    initConfig: {},
    createdAt: '2026-03-15T10:00:00Z',
    updatedAt: '2026-03-15T10:05:00Z',
  },
  events: [],
};

const handlers = {
  onStart: vi.fn(),
  onStop: vi.fn(),
  onRestart: vi.fn(),
  onResume: vi.fn(),
  onDelete: vi.fn(),
  onKill: vi.fn(),
  onClose: vi.fn(),
  onSaveConfig: vi.fn(),
};

describe('AgentDetailPanel', () => {
  beforeEach(() => {
    useBeastStore.getState().resetEdit();
    vi.resetAllMocks();
  });

  it('renders readonly view by default', () => {
    render(<AgentDetailPanel isOpen={true} detail={detail} logs={[]} {...handlers} />);
    expect(screen.getByText('Overview')).toBeTruthy();
  });

  it('shows agent id in header', () => {
    render(<AgentDetailPanel isOpen={true} detail={detail} logs={[]} {...handlers} />);
    expect(screen.getByText('agent-1')).toBeTruthy();
  });

  it('has mode toggle', () => {
    render(<AgentDetailPanel isOpen={true} detail={detail} logs={[]} {...handlers} />);
    expect(screen.getByText('Readonly')).toBeTruthy();
    expect(screen.getByText('Edit')).toBeTruthy();
  });

  it('shows action bar with status-appropriate buttons', () => {
    render(<AgentDetailPanel isOpen={true} detail={detail} logs={[]} {...handlers} />);
    expect(screen.getByText('Stop')).toBeTruthy();
  });

  it('shows edit form when Edit mode is selected', () => {
    render(<AgentDetailPanel isOpen={true} detail={detail} logs={[]} {...handlers} />);
    fireEvent.click(screen.getByText('Edit'));
    // Should show Identity section from edit form
    expect(screen.getByText('Identity')).toBeTruthy();
  });

  it('calls onClose when close button clicked', () => {
    render(<AgentDetailPanel isOpen={true} detail={detail} logs={[]} {...handlers} />);
    fireEvent.click(screen.getByLabelText('Close panel'));
    expect(handlers.onClose).toHaveBeenCalled();
  });

  it('persists edits through onSaveConfig and returns to readonly mode', async () => {
    handlers.onSaveConfig.mockResolvedValueOnce(undefined);
    render(<AgentDetailPanel isOpen={true} detail={detail} logs={[]} {...handlers} />);

    fireEvent.click(screen.getByText('Edit'));
    fireEvent.change(screen.getAllByDisplayValue('')[0]!, { target: { value: 'Updated agent' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(handlers.onSaveConfig).toHaveBeenCalledWith(expect.objectContaining({ name: 'Updated agent' })));
    await waitFor(() => expect(screen.getByText('Overview')).toBeTruthy());
  });

  it('initializes identity edits from initConfig.identity without adding absent moduleConfig', async () => {
    handlers.onSaveConfig.mockResolvedValueOnce(undefined);
    render(<AgentDetailPanel
      isOpen={true}
      detail={{
        ...detail,
        agent: {
          ...detail.agent,
          initConfig: { identity: { name: 'Wizard agent', description: 'Wizard description' } },
        },
      }}
      logs={[]}
      {...handlers}
    />);

    fireEvent.click(screen.getByText('Edit'));

    expect(screen.getByDisplayValue('Wizard agent')).toBeTruthy();
    expect(screen.getByDisplayValue('Wizard description')).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue('Wizard description'), { target: { value: 'Updated description' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(handlers.onSaveConfig).toHaveBeenCalled());
    const savedValues = handlers.onSaveConfig.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(savedValues).toMatchObject({ name: 'Wizard agent', description: 'Updated description' });
    expect(savedValues).not.toHaveProperty('moduleConfig');
  });

  it('resets stale edit values when the selected agent changes', () => {
    const { rerender } = render(<AgentDetailPanel isOpen={true} detail={detail} logs={[]} {...handlers} />);

    fireEvent.click(screen.getByText('Edit'));
    fireEvent.change(screen.getAllByDisplayValue('')[0]!, { target: { value: 'Unsaved old agent' } });

    rerender(<AgentDetailPanel
      isOpen={true}
      detail={{
        ...detail,
        agent: {
          ...detail.agent,
          id: 'agent-2',
          initConfig: { identity: { name: 'Second agent', description: 'Second description' } },
        },
      }}
      logs={[]}
      {...handlers}
    />);

    expect(screen.getByDisplayValue('Second agent')).toBeTruthy();
    expect(screen.queryByDisplayValue('Unsaved old agent')).toBeNull();
  });

  it('keeps edit mode open and surfaces save errors', async () => {
    handlers.onSaveConfig.mockRejectedValueOnce(new Error('HTTP 500'));
    render(<AgentDetailPanel isOpen={true} detail={detail} logs={[]} {...handlers} />);

    fireEvent.click(screen.getByText('Edit'));
    fireEvent.change(screen.getAllByDisplayValue('')[0]!, { target: { value: 'Updated agent' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('HTTP 500'));
    expect(screen.getByText('Identity')).toBeTruthy();
  });

  it('keeps edit mode visible while save is pending', async () => {
    let rejectSave: ((error: Error) => void) | undefined;
    handlers.onSaveConfig.mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectSave = reject;
    }));
    render(<AgentDetailPanel isOpen={true} detail={detail} logs={[]} {...handlers} />);

    fireEvent.click(screen.getByText('Edit'));
    fireEvent.change(screen.getAllByDisplayValue('')[0]!, { target: { value: 'Slow save' } });
    fireEvent.click(screen.getByText('Save'));
    fireEvent.click(screen.getByText('Readonly'));

    expect(screen.getByText('Identity')).toBeTruthy();
    rejectSave?.(new Error('HTTP 500'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('HTTP 500'));
  });

  it('keeps delete confirmation actions from closing the detail panel as outside clicks', () => {
    render(<AgentDetailPanel
      isOpen={true}
      detail={{
        ...detail,
        agent: {
          ...detail.agent,
          status: 'stopped',
          name: 'Review Agent',
        },
      }}
      logs={[]}
      {...handlers}
    />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const confirm = screen.getByRole('button', { name: 'Delete agent' });

    fireEvent.mouseDown(confirm);
    expect(handlers.onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handlers.onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const overlay = document.querySelector('[data-beast-panel-portal="true"].fixed.inset-0');
    if (!overlay) throw new Error('Expected delete confirmation overlay');
    fireEvent.mouseDown(overlay);
    expect(handlers.onClose).not.toHaveBeenCalled();
  });

  it('uses the agent id in delete confirmation when the agent name is blank', () => {
    render(<AgentDetailPanel
      isOpen={true}
      detail={{
        ...detail,
        agent: {
          ...detail.agent,
          id: 'agent-blank-name',
          status: 'completed',
          name: '   ',
        },
      }}
      logs={[]}
      {...handlers}
    />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.getByText(/agent-blank-name/)).toBeTruthy();
  });
});
