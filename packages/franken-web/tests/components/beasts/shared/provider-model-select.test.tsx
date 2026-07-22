import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ProviderModelSelect } from '../../../../src/components/beasts/shared/provider-model-select';

afterEach(cleanup);

const providers = [
  { id: 'anthropic', name: 'Anthropic', models: [
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
  ]},
  { id: 'openai', name: 'OpenAI', models: [
    { id: 'gpt-4o', name: 'GPT-4o' },
  ]},
];

describe('ProviderModelSelect', () => {
  it('renders provider select with options', () => {
    render(<ProviderModelSelect providers={providers} value={{ provider: '', model: '' }} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/provider/i)).toBeTruthy();
  });

  it('opens the accessible model listbox with the selected provider models', () => {
    render(<ProviderModelSelect providers={providers} value={{ provider: 'anthropic', model: '' }} onChange={vi.fn()} />);

    fireEvent.click(screen.getByLabelText(/model/i));

    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Claude Sonnet 4.6' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Claude Opus 4.6' })).toBeTruthy();
  });

  it('uses Radix select triggers instead of native selects', () => {
    const { container } = render(<ProviderModelSelect providers={providers} value={{ provider: '', model: '' }} onChange={vi.fn()} />);

    expect(container.querySelector('select')).toBeNull();
    expect(screen.getByLabelText(/provider/i).getAttribute('role')).toBe('combobox');
  });

  it('explains how to enable the disabled model select', () => {
    render(<ProviderModelSelect providers={providers} value={{ provider: '', model: '' }} onChange={vi.fn()} />);

    const modelSelect = screen.getByLabelText(/model/i);
    const guidance = screen.getByText('Select a provider to choose a model.');

    expect(modelSelect.hasAttribute('disabled')).toBe(true);
    expect(modelSelect.getAttribute('aria-describedby')).toBe(guidance.id);
  });

  it('calls onChange when provider changes', () => {
    const onChange = vi.fn();
    render(<ProviderModelSelect providers={providers} value={{ provider: '', model: '' }} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/provider/i));
    fireEvent.click(screen.getByRole('option', { name: 'Anthropic' }));
    expect(onChange).toHaveBeenCalledWith({ provider: 'anthropic', model: '' });
  });

  it('allows selected provider and model overrides to be cleared', () => {
    const onChange = vi.fn();
    render(<ProviderModelSelect providers={providers} value={{ provider: 'anthropic', model: 'claude-sonnet-4-6' }} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText(/provider/i));
    fireEvent.click(screen.getByRole('option', { name: 'Select provider...' }));
    expect(onChange).toHaveBeenCalledWith({ provider: '', model: '' });

    fireEvent.click(screen.getByLabelText(/model/i));
    fireEvent.click(screen.getByRole('option', { name: 'Select model...' }));
    expect(onChange).toHaveBeenCalledWith({ provider: 'anthropic', model: '' });
  });

  it('shows "Use default" checkbox when showUseDefault is true', () => {
    const onUseDefaultChange = vi.fn();
    render(<ProviderModelSelect providers={providers} value={{ provider: '', model: '' }} onChange={vi.fn()} showUseDefault useDefault={true} onUseDefaultChange={onUseDefaultChange} />);
    const toggle = screen.getByLabelText(/use default/i);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.tagName).toBe('BUTTON');
    fireEvent.click(toggle);
    expect(onUseDefaultChange).toHaveBeenCalledWith(false);
  });

  it('hides selects when "Use default" is checked', () => {
    render(<ProviderModelSelect providers={providers} value={{ provider: '', model: '' }} onChange={vi.fn()} showUseDefault useDefault={true} onUseDefaultChange={vi.fn()} />);
    expect(screen.queryByLabelText(/provider/i)).toBeNull();
  });
});
