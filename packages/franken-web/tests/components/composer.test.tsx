import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { Composer } from '../../src/components/composer.js';

afterEach(cleanup);

describe('Composer', () => {
  it('calls onSend with input value on submit', () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} disabled={false} connectionStatus="connected" status="idle" />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.submit(input.closest('form')!);

    expect(onSend).toHaveBeenCalledWith('hello');
  });

  it('clears input after submit', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<Composer onSend={onSend} disabled={false} connectionStatus="connected" status="idle" />);

    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(input.value).toBe('');
    });
  });

  it('disables submit button when disabled prop is true', () => {
    render(<Composer onSend={vi.fn()} disabled={true} connectionStatus="connected" status="sending" />);
    const button = screen.getByRole('button');
    expect(button).toHaveProperty('disabled', true);
  });

  it('explains why dispatch is disabled and marks the textarea for assistive tech', () => {
    render(<Composer onSend={vi.fn()} disabled={true} connectionStatus="connected" status="streaming" />);

    const input = screen.getByRole('textbox');
    expect(input.getAttribute('aria-disabled')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toContain('composer-help');
    expect(screen.getByText('Dispatch is disabled while Frankenbeast is responding.')).toBeTruthy();
  });

  it('announces connection and session states in a live status region', () => {
    render(<Composer onSend={vi.fn()} disabled={false} connectionStatus="reconnecting" status="idle" />);

    const liveRegion = screen.getByRole('status');
    expect(liveRegion.getAttribute('aria-live')).toBe('polite');
    expect(liveRegion.textContent).toContain('Reconnecting to chat');
    expect(liveRegion.textContent).toContain('Ready to dispatch');
  });

  it('shows a reconnect affordance when the chat is disconnected', () => {
    const onReconnect = vi.fn();
    render(<Composer onSend={vi.fn()} onReconnect={onReconnect} disabled={false} connectionStatus="disconnected" status="idle" />);

    fireEvent.click(screen.getByRole('button', { name: 'Try reconnecting' }));

    expect(onReconnect).toHaveBeenCalledOnce();
    expect(screen.getByText('Live chat is disconnected. Try reconnecting before sending time-sensitive work.')).toBeTruthy();
  });

  it('does not call onSend with empty input', () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} disabled={false} connectionStatus="connected" status="idle" />);

    fireEvent.submit(screen.getByRole('textbox').closest('form')!);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('clicking Dispatch sends the message', () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} disabled={false} connectionStatus="connected" status="idle" />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'click test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dispatch' }));

    expect(onSend).toHaveBeenCalledWith('click test');
  });

  it('handles Enter key submission via form', () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} disabled={false} connectionStatus="connected" status="idle" />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'enter test' } });
    fireEvent.submit(input.closest('form')!);

    expect(onSend).toHaveBeenCalledWith('enter test');
  });

  it('sends on Ctrl+Enter from the textarea', () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} disabled={false} connectionStatus="connected" status="idle" />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'keyboard send' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', ctrlKey: true });

    expect(onSend).toHaveBeenCalledWith('keyboard send');
  });

  it('does not send on Ctrl+Enter while dispatch is disabled', () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} disabled={true} connectionStatus="connected" status="sending" />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'blocked keyboard send' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', ctrlKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not submit the form while dispatch is disabled', () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} disabled={true} connectionStatus="connected" status="sending" />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'blocked form send' } });
    fireEvent.submit(input.closest('form')!);

    expect(onSend).not.toHaveBeenCalled();
  });

  it('submit button has a label', () => {
    render(<Composer onSend={vi.fn()} disabled={false} connectionStatus="connected" status="idle" />);
    const button = screen.getByRole('button');
    expect(button.textContent).toBeTruthy();
  });
});
