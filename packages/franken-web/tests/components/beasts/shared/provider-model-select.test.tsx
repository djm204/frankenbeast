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

  it('populates model select when provider is selected', () => {
    render(<ProviderModelSelect providers={providers} value={{ provider: 'anthropic', model: '' }} onChange={vi.fn()} />);
    const modelSelect = screen.getByLabelText(/model/i);
    expect(modelSelect).toBeTruthy();
    // Should have anthropic models available
    const options = modelSelect.querySelectorAll('option');
    expect(options.length).toBeGreaterThan(1); // includes placeholder
  });

  it('calls onChange when provider changes', () => {
    const onChange = vi.fn();
    render(<ProviderModelSelect providers={providers} value={{ provider: '', model: '' }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: 'anthropic' } });
    expect(onChange).toHaveBeenCalledWith({ provider: 'anthropic', model: '' });
  });

  it('shows "Use default" checkbox when showUseDefault is true', () => {
    render(<ProviderModelSelect providers={providers} value={{ provider: '', model: '' }} onChange={vi.fn()} showUseDefault useDefault={true} onUseDefaultChange={vi.fn()} />);
    expect(screen.getByLabelText(/use default/i)).toBeTruthy();
  });

  it('hides selects when "Use default" is checked', () => {
    render(<ProviderModelSelect providers={providers} value={{ provider: '', model: '' }} onChange={vi.fn()} showUseDefault useDefault={true} onUseDefaultChange={vi.fn()} />);
    expect(screen.queryByLabelText(/provider/i)).toBeNull();
  });
});
