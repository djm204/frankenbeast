import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BeastCatalogEntry, TrackedAgentSummary } from '../../src/lib/beast-api';
import { BeastDispatchPage } from '../../src/pages/beast-dispatch-page';

function agent(overrides: Partial<TrackedAgentSummary>): TrackedAgentSummary {
  return {
    id: 'agent-1',
    definitionId: 'reviewer',
    status: 'running',
    source: 'catalog',
    createdByUser: 'operator',
    initAction: { kind: 'design-interview', command: 'fbeast run reviewer', config: {} },
    initConfig: {},
    createdAt: '2026-07-05T00:00:00.000Z',
    updatedAt: '2026-07-05T00:00:00.000Z',
    ...overrides,
  };
}

const catalog: BeastCatalogEntry[] = [
  {
    id: 'design-interview',
    label: 'Design Interview',
    description: 'Collects design details',
    executionModeDefault: 'process',
    interviewPrompts: [
      {
        key: 'designFile',
        prompt: 'Design file path',
        kind: 'file',
        required: true,
      },
      {
        key: 'audience',
        prompt: 'Target audience',
        kind: 'string',
        required: true,
        options: ['Developers', 'Designers'],
      },
    ],
  },
];

function renderDispatchPage(overrides: Partial<React.ComponentProps<typeof BeastDispatchPage>> = {}) {
  return render(
    <BeastDispatchPage
      agentDetail={null}
      agents={[]}
      catalog={catalog}
      disabled={false}
      error={null}
      onDelete={vi.fn()}
      onDispatch={vi.fn()}
      onKill={vi.fn()}
      onRefresh={vi.fn()}
      onRestart={vi.fn()}
      onResume={vi.fn()}
      onSelectAgent={vi.fn()}
      onStart={vi.fn()}
      onStop={vi.fn()}
      selectedAgentId={null}
      {...overrides}
    />,
  );
}

afterEach(cleanup);

describe('BeastDispatchPage', () => {
  it('labels dispatch prompt controls with prompt text and connects validation errors to the invalid fields', () => {
    const onDispatch = vi.fn();
    renderDispatchPage({ onDispatch });

    const designFileInput = screen.getByLabelText('Design file path');
    const audienceSelect = screen.getByLabelText('Target audience');

    fireEvent.click(screen.getByRole('button', { name: 'Launch Design Interview' }));

    expect(onDispatch).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(designFileInput);
    expect(designFileInput.getAttribute('aria-invalid')).toBe('true');
    expect(audienceSelect.getAttribute('aria-invalid')).toBe('true');

    const designFileErrorId = designFileInput.getAttribute('aria-describedby');
    const audienceErrorId = audienceSelect.getAttribute('aria-describedby');

    expect(designFileErrorId).toBeTruthy();
    expect(audienceErrorId).toBeTruthy();
    expect(document.getElementById(designFileErrorId ?? '')?.textContent).toBe('This field is required.');
    expect(document.getElementById(audienceErrorId ?? '')?.textContent).toBe('This field is required.');
  });

  it('requires confirmation with consequence copy before stopping an agent', () => {
    const onStop = vi.fn();
    renderDispatchPage({ agents: [agent({ id: 'agent-stop', status: 'running' })], catalog: [], onStop });

    fireEvent.click(screen.getByRole('button', { name: 'Stop agent-stop with confirmation' }));

    expect(onStop).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog', { name: 'Stop agent-stop' })).toBeTruthy();
    expect(screen.getByText(/may leave its current work incomplete/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Stop agent-stop' }));

    expect(onStop).toHaveBeenCalledWith('agent-stop');
  });

  it('requires confirmation with consequence copy before deleting a stopped agent', () => {
    const onDelete = vi.fn();
    renderDispatchPage({ agents: [agent({ id: 'agent-delete', status: 'stopped' })], catalog: [], onDelete });

    fireEvent.click(screen.getByRole('button', { name: 'Delete agent-delete with confirmation' }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog', { name: 'Delete agent-delete' })).toBeTruthy();
    expect(screen.getByText(/removes agent-delete from tracked agents/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Delete agent-delete' }));

    expect(onDelete).toHaveBeenCalledWith('agent-delete');
  });

  it('requires confirmation with consequence copy before killing a linked run', () => {
    const onKill = vi.fn();
    renderDispatchPage({ agents: [agent({ id: 'agent-kill', status: 'running', dispatchRunId: 'run-123' })], catalog: [], onKill });

    fireEvent.click(screen.getByRole('button', { name: 'Kill run-123 with confirmation' }));

    expect(onKill).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog', { name: 'Kill run run-123' })).toBeTruthy();
    expect(screen.getByText(/logs or in-progress output may be lost/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Kill run run-123' }));

    expect(onKill).toHaveBeenCalledWith('run-123');
  });
});
