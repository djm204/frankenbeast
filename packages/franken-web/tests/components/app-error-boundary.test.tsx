import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { AppErrorBoundary } from '../../src/components/app-error-boundary';

function BrokenDashboard(): ReactElement {
  throw new Error('Boom while rendering dashboard');
}

function ThrowsNull(): ReactElement {
  throw null;
}

function ThrowsBigInt(): ReactElement {
  throw 1n;
}

describe('AppErrorBoundary', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows a recoverable shell instead of leaving the root blank when the app crashes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <AppErrorBoundary version="0.1.0-test">
        <BrokenDashboard />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Control plane recovery')).toBeTruthy();
    expect(screen.getByText('The dashboard hit a rendering problem.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /reload dashboard/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /copy diagnostics/i })).toBeTruthy();
    expect(screen.getByText('Boom while rendering dashboard')).toBeTruthy();
    expect(document.body.textContent).toContain('Recoverable app-shell error');
  });

  it('copies diagnostics for support without hiding the recovery UI', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(
      <AppErrorBoundary version="0.1.0-test">
        <BrokenDashboard />
      </AppErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: /copy diagnostics/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0]?.[0]).toContain('Boom while rendering dashboard');
    expect(writeText.mock.calls[0]?.[0]).toContain('0.1.0-test');
    expect(await screen.findByRole('button', { name: /diagnostics copied/i })).toBeTruthy();
  });

  it('prompts for manual diagnostics when the clipboard API is unavailable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });

    render(
      <AppErrorBoundary version="0.1.0-test">
        <BrokenDashboard />
      </AppErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: /copy diagnostics/i }));

    expect(await screen.findByRole('button', { name: /copy manually below/i })).toBeTruthy();
    expect(screen.getByText(/view diagnostics/i).closest('details')?.hasAttribute('open')).toBe(true);
  });

  it('shows the recovery shell even when the thrown value is falsy', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <AppErrorBoundary version="0.1.0-test">
        <ThrowsNull />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Unknown app-shell error')).toBeTruthy();
  });

  it('keeps diagnostics renderable when the thrown value is not JSON-serializable by default', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <AppErrorBoundary version="0.1.0-test">
        <ThrowsBigInt />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/"thrownValue": "1n"/)).toBeTruthy();
  });
});
