import { describe, it, expect, vi, afterEach } from 'vitest';
import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { SlideInPanel } from '../../../src/components/beasts/slide-in-panel';

afterEach(cleanup);

describe('SlideInPanel', () => {
  it('renders children when open', () => {
    render(
      <SlideInPanel isOpen={true} onClose={vi.fn()}>
        <div>Panel content</div>
      </SlideInPanel>
    );
    expect(screen.getByText('Panel content')).toBeTruthy();
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <SlideInPanel isOpen={false} onClose={vi.fn()}>
        <div>Hidden</div>
      </SlideInPanel>
    );
    expect(container.querySelector('aside')).toBeNull();
    expect(screen.queryByText('Hidden')).toBeNull();
  });

  it('exposes a non-modal dialog and moves focus into it', async () => {
    render(
      <SlideInPanel isOpen={true} onClose={vi.fn()}>
        <button type="button">Panel action</button>
      </SlideInPanel>
    );

    const drawer = screen.getByRole('dialog');
    expect(drawer.getAttribute('aria-modal')).not.toBe('true');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Panel action' })));
  });

  it('returns focus to the opener after closing', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open details';
    document.body.append(opener);
    opener.focus();

    const { rerender } = render(
      <SlideInPanel isOpen={true} onClose={vi.fn()}>
        <button type="button">Panel action</button>
      </SlideInPanel>
    );
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Panel action' })));

    rerender(
      <SlideInPanel isOpen={false} onClose={vi.fn()}>
        <button type="button">Panel action</button>
      </SlideInPanel>
    );

    await waitFor(() => expect(document.activeElement).toBe(opener));
    opener.remove();
  });

  it('captures the opener before child layout autofocus runs', async () => {
    function LayoutAutofocusButton() {
      const buttonRef = useRef<HTMLButtonElement>(null);
      useLayoutEffect(() => buttonRef.current?.focus(), []);
      return <button ref={buttonRef} type="button">Panel action</button>;
    }

    const opener = document.createElement('button');
    opener.textContent = 'Open details';
    document.body.append(opener);
    opener.focus();

    const { rerender } = render(
      <SlideInPanel isOpen={true} onClose={vi.fn()}>
        <LayoutAutofocusButton />
      </SlideInPanel>
    );
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Panel action' })));

    rerender(
      <SlideInPanel isOpen={false} onClose={vi.fn()}>
        <LayoutAutofocusButton />
      </SlideInPanel>
    );

    await waitFor(() => expect(document.activeElement).toBe(opener));
    opener.remove();
  });

  it('keeps the drawer open when keyboard focus moves outside it', async () => {
    const onClose = vi.fn();
    const outsideControl = document.createElement('button');
    outsideControl.textContent = 'Outside control';
    document.body.append(outsideControl);

    render(
      <SlideInPanel isOpen={true} onClose={onClose}>
        <button type="button">Panel action</button>
      </SlideInPanel>
    );
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Panel action' })));

    outsideControl.focus();

    expect(onClose).not.toHaveBeenCalled();
    outsideControl.remove();
  });

  it('does not steal focus back after an outside interaction closes it', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open details';
    document.body.append(opener);
    opener.focus();
    const onClose = vi.fn();

    const { rerender } = render(
      <SlideInPanel isOpen={true} onClose={onClose}>
        <button type="button">Panel action</button>
      </SlideInPanel>
    );
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Panel action' })));

    rerender(
      <SlideInPanel isOpen={true} onClose={onClose}>
        <button type="button">Panel action</button>
        {createPortal(<button type="button" autoFocus>Outside control</button>, document.body)}
      </SlideInPanel>
    );
    const outsideControl = screen.getByRole('button', { name: 'Outside control' });
    outsideControl.focus();
    rerender(
      <SlideInPanel isOpen={false} onClose={onClose}>
        {createPortal(<button type="button" autoFocus>Outside control</button>, document.body)}
      </SlideInPanel>
    );

    await waitFor(() => expect(document.activeElement).not.toBe(opener));
    opener.remove();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <SlideInPanel isOpen={true} onClose={onClose}>
        <div>Content</div>
      </SlideInPanel>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
