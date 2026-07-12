// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrackedAgentDetail } from '../../lib/beast-api';
import { useBeastStore } from '../../stores/beast-store';
import { AgentDetailPanel } from './agent-detail-panel';

const baseDetail: TrackedAgentDetail = {
  agent: {
    id: 'agent-1',
    name: 'Current Agent',
    definitionId: 'agent-definition',
    status: 'stopped',
    source: 'dashboard',
    createdByUser: 'operator',
    initAction: { kind: 'design-interview', command: 'fbeast run agent', config: {} },
    initConfig: {
      identity: {
        name: 'Config Agent',
        description: 'Current description',
      },
    },
    moduleConfig: {
      firewall: true,
      planner: false,
    },
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:00:00.000Z',
  },
  events: [],
};

function renderPanel(overrides: Partial<ComponentProps<typeof AgentDetailPanel>> = {}) {
  const onSaveConfig = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();

  render(
    <AgentDetailPanel
      isOpen
      detail={baseDetail}
      logs={[]}
      onClose={onClose}
      onStart={vi.fn()}
      onStop={vi.fn()}
      onRestart={vi.fn()}
      onResume={vi.fn()}
      onDelete={vi.fn()}
      onKill={vi.fn()}
      onSaveConfig={onSaveConfig}
      {...overrides}
    />,
  );

  return { onSaveConfig, onClose };
}

describe('AgentDetailPanel edit mode', () => {
  afterEach(() => {
    cleanup();
    useBeastStore.getState().resetEdit();
  });

  it('seeds selected agent values and enables save after a field changes', async () => {
    const { onSaveConfig } = renderPanel();

    fireEvent.click(screen.getByRole('radio', { name: 'Edit' }));

    const nameInput = await screen.findByDisplayValue('Current Agent');
    expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe('Current description');
    expect((screen.getByLabelText('planner') as HTMLInputElement).checked).toBe(false);

    const saveButton = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);

    fireEvent.change(nameInput, { target: { value: 'Updated Agent' } });
    expect(saveButton.disabled).toBe(false);

    fireEvent.click(saveButton);

    await waitFor(() => expect(onSaveConfig).toHaveBeenCalledTimes(1));
    expect(onSaveConfig).toHaveBeenCalledWith({
      name: 'Updated Agent',
      description: 'Current description',
      moduleConfig: {
        firewall: true,
        planner: false,
      },
    });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save' })).toBeNull());
  });

  it('keeps edit mode open and shows an error when save fails', async () => {
    const onSaveConfig = vi.fn().mockRejectedValue(new Error('PATCH failed'));
    renderPanel({ onSaveConfig });

    fireEvent.click(screen.getByRole('radio', { name: 'Edit' }));
    fireEvent.change(await screen.findByDisplayValue('Current Agent'), { target: { value: 'Broken Agent' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect((await screen.findByRole('alert')).textContent).toContain('PATCH failed');
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(onSaveConfig).toHaveBeenCalledWith(expect.objectContaining({ name: 'Broken Agent' }));
  });

  it('resets the edit store when the panel is closed from edit mode', async () => {
    const { onClose } = renderPanel();

    fireEvent.click(screen.getByRole('radio', { name: 'Edit' }));
    fireEvent.change(await screen.findByDisplayValue('Current Agent'), { target: { value: 'Unsaved Agent' } });
    expect(useBeastStore.getState().isEditDirty).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useBeastStore.getState().editValues).toBeNull();
    expect(useBeastStore.getState().isEditDirty).toBe(false);
  });
});
