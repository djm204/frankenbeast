import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Composer } from '../../src/components/composer.js';

afterEach(cleanup);

describe('Composer', () => {
  it('calls onSend with input value on submit', () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} disabled={false} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.submit(input.closest('form')!);

    expect(onSend).toHaveBeenCalledWith('hello');
  });

  it('clears input after submit', () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} disabled={false} />);

    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.submit(input.closest('form')!);

    expect(input.value).toBe('');
  });

  it('disables submit button when disabled prop is true', () => {
    render(<Composer onSend={vi.fn()} disabled={true} />);
    const button = screen.getByRole('button');
    expect(button).toHaveProperty('disabled', true);
  });

  it('does not call onSend with empty input', () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} disabled={false} />);

    fireEvent.submit(screen.getByRole('textbox').closest('form')!);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('handles Enter key submission via form', () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} disabled={false} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'enter test' } });
    fireEvent.submit(input.closest('form')!);

    expect(onSend).toHaveBeenCalledWith('enter test');
  });

  it('submit button has a label', () => {
    render(<Composer onSend={vi.fn()} disabled={false} />);
    const button = screen.getByRole('button');
    expect(button.textContent).toBeTruthy();
  });
});
