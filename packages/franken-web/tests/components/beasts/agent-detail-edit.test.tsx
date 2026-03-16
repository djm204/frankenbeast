import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AgentDetailEdit } from '../../../src/components/beasts/agent-detail-edit';
import { useBeastStore } from '../../../src/stores/beast-store';

afterEach(cleanup);

describe('AgentDetailEdit', () => {
  beforeEach(() => {
    useBeastStore.getState().resetEdit();
  });

  it('renders editable form fields for agent name', () => {
    useBeastStore.getState().setEditSnapshot({ name: 'Agent1' });
    useBeastStore.getState().setEditValues({ name: 'Agent1' });
    render(<AgentDetailEdit onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByDisplayValue('Agent1')).toBeTruthy();
  });

  it('save button is disabled when not dirty', () => {
    useBeastStore.getState().setEditSnapshot({ name: 'Agent1' });
    useBeastStore.getState().setEditValues({ name: 'Agent1' });
    render(<AgentDetailEdit onSave={vi.fn()} onCancel={vi.fn()} />);
    const saveBtn = screen.getByText('Save').closest('button')!;
    expect(saveBtn.disabled).toBe(true);
  });

  it('save button enables when dirty, calls onSave with values', () => {
    const onSave = vi.fn();
    useBeastStore.getState().setEditSnapshot({ name: 'Agent1' });
    useBeastStore.getState().setEditValues({ name: 'Agent1-modified' });
    render(<AgentDetailEdit onSave={onSave} onCancel={vi.fn()} />);
    const saveBtn = screen.getByText('Save').closest('button')!;
    expect(saveBtn.disabled).toBe(false);
    fireEvent.click(saveBtn);
    expect(onSave).toHaveBeenCalledWith({ name: 'Agent1-modified' });
  });

  it('renders Modules section header', () => {
    useBeastStore.getState().setEditSnapshot({ name: 'A' });
    useBeastStore.getState().setEditValues({ name: 'A' });
    render(<AgentDetailEdit onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Modules')).toBeTruthy();
  });

  it('calls onCancel when cancel button clicked', () => {
    const onCancel = vi.fn();
    useBeastStore.getState().setEditSnapshot({ name: 'A' });
    useBeastStore.getState().setEditValues({ name: 'A' });
    render(<AgentDetailEdit onSave={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });
});
