import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardPage } from './dashboard-page';
import type { DashboardApiClient, DashboardSnapshot } from '../lib/dashboard-api';
import { useDashboardStore } from '../stores/dashboard-store';

const snapshot: DashboardSnapshot = {
  skills: [
    { name: 'shell', enabled: false, hasContext: false, mcpServerCount: 0 },
  ],
  security: {
    profile: 'standard',
    injectionDetection: true,
    piiMasking: true,
    outputValidation: true,
  },
  providers: [
    { name: 'openai', type: 'llm', available: true, failoverOrder: 1 },
  ],
};

function mockClient(overrides: Partial<DashboardApiClient> = {}): DashboardApiClient {
  return {
    fetchSnapshot: vi.fn().mockResolvedValue(snapshot),
    toggleSkill: vi.fn().mockResolvedValue(undefined),
    updateSecurityProfile: vi.fn().mockResolvedValue(undefined),
    subscribeToDashboard: vi.fn().mockReturnValue(() => undefined),
    ...overrides,
  } as unknown as DashboardApiClient;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

describe('DashboardPage', () => {
  afterEach(() => {
    cleanup();
    useDashboardStore.getState().reset();
  });

  it('shows a load failure with a retry action instead of hiding it in the console', async () => {
    const client = mockClient({
      fetchSnapshot: vi.fn()
        .mockRejectedValueOnce(new Error('HTTP 503'))
        .mockResolvedValueOnce(snapshot),
    });

    render(<DashboardPage client={client} />);

    expect((await screen.findByRole('alert')).textContent).toContain('Unable to load dashboard. HTTP 503');
    expect(screen.getByRole('button', { name: 'Retry loading dashboard' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Retry loading dashboard' }));

    expect(await screen.findByRole('switch', { name: 'Enable shell' })).toBeTruthy();
    expect(screen.queryByText(/Unable to load dashboard/)).toBeNull();
    expect(client.fetchSnapshot).toHaveBeenCalledTimes(2);
  });

  it('rolls back a failed skill toggle and offers a retry', async () => {
    const client = mockClient({
      toggleSkill: vi.fn()
        .mockRejectedValueOnce(new Error('HTTP 500'))
        .mockResolvedValueOnce(undefined),
    });

    render(<DashboardPage client={client} />);
    const toggle = await screen.findByRole('switch', { name: 'Enable shell' });
    fireEvent.click(toggle);

    expect((await screen.findByRole('alert')).textContent).toContain('Could not enable shell; the switch was restored to the latest confirmed dashboard state. HTTP 500');
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Enable shell' }).getAttribute('aria-checked')).toBe('false');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Retry enabling shell' }));

    await waitFor(() => {
      expect(client.toggleSkill).toHaveBeenLastCalledWith('shell', true);
      expect(screen.getByRole('switch', { name: 'Disable shell' }).getAttribute('aria-checked')).toBe('true');
    });
    expect(screen.queryByText(/Could not enable shell/)).toBeNull();
  });

  it('rolls back a failed security profile save and offers a retry', async () => {
    const client = mockClient({
      updateSecurityProfile: vi.fn()
        .mockRejectedValueOnce(new Error('HTTP 409'))
        .mockResolvedValueOnce(undefined),
    });

    render(<DashboardPage client={client} />);
    fireEvent.change(await screen.findByLabelText('Profile:'), { target: { value: 'strict' } });

    expect((await screen.findByRole('alert')).textContent).toContain('Could not save security profile strict; the profile was restored to the latest confirmed dashboard state. HTTP 409');
    await waitFor(() => {
      expect((screen.getByLabelText('Profile:') as HTMLSelectElement).value).toBe('standard');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Retry saving strict' }));

    await waitFor(() => {
      expect(client.updateSecurityProfile).toHaveBeenLastCalledWith('strict');
      expect((screen.getByLabelText('Profile:') as HTMLSelectElement).value).toBe('strict');
    });
    expect(screen.queryByText(/Could not save security profile/)).toBeNull();
  });

  it('does not roll back a newer skill toggle when an older request fails late', async () => {
    const firstToggle = deferred<void>();
    const client = mockClient({
      toggleSkill: vi.fn()
        .mockReturnValueOnce(firstToggle.promise)
        .mockResolvedValueOnce(undefined),
    });

    render(<DashboardPage client={client} />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Enable shell' }));
    fireEvent.click(await screen.findByRole('switch', { name: 'Disable shell' }));

    firstToggle.reject(new Error('HTTP 500'));

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Enable shell' }).getAttribute('aria-checked')).toBe('false');
    });
    expect(screen.queryByText(/Could not enable shell/)).toBeNull();
  });

  it('does not restore an older security profile after a newer save starts', async () => {
    const firstSave = deferred<void>();
    const client = mockClient({
      updateSecurityProfile: vi.fn()
        .mockReturnValueOnce(firstSave.promise)
        .mockResolvedValueOnce(undefined),
    });

    render(<DashboardPage client={client} />);
    fireEvent.change(await screen.findByLabelText('Profile:'), { target: { value: 'strict' } });
    fireEvent.change(screen.getByLabelText('Profile:'), { target: { value: 'permissive' } });

    firstSave.reject(new Error('HTTP 409'));

    await waitFor(() => {
      expect((screen.getByLabelText('Profile:') as HTMLSelectElement).value).toBe('permissive');
    });
    expect(screen.queryByText(/Could not save security profile strict/)).toBeNull();
  });

  it('keeps an SSE snapshot authoritative when the initial fetch fails late', async () => {
    const initialFetch = deferred<DashboardSnapshot>();
    const client = mockClient({
      fetchSnapshot: vi.fn().mockReturnValue(initialFetch.promise),
      subscribeToDashboard: vi.fn((onSnapshot: (snapshot: DashboardSnapshot) => void) => {
        onSnapshot(snapshot);
        return () => undefined;
      }),
    });

    render(<DashboardPage client={client} />);
    expect(await screen.findByRole('switch', { name: 'Enable shell' })).toBeTruthy();

    initialFetch.reject(new Error('HTTP 503'));

    await waitFor(() => {
      expect(screen.queryByText(/Unable to load dashboard/)).toBeNull();
      expect(screen.getByRole('switch', { name: 'Enable shell' })).toBeTruthy();
    });
  });

  it('restores the last confirmed skill baseline when overlapping toggles both fail', async () => {
    const firstToggle = deferred<void>();
    const secondToggle = deferred<void>();
    const client = mockClient({
      toggleSkill: vi.fn()
        .mockReturnValueOnce(firstToggle.promise)
        .mockReturnValueOnce(secondToggle.promise),
    });

    render(<DashboardPage client={client} />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Enable shell' }));
    fireEvent.click(await screen.findByRole('switch', { name: 'Disable shell' }));

    secondToggle.reject(new Error('HTTP 500'));
    firstToggle.reject(new Error('HTTP 500'));

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Enable shell' }).getAttribute('aria-checked')).toBe('false');
    });
  });

  it('restores the last confirmed security profile when overlapping saves both fail', async () => {
    const firstSave = deferred<void>();
    const secondSave = deferred<void>();
    const client = mockClient({
      updateSecurityProfile: vi.fn()
        .mockReturnValueOnce(firstSave.promise)
        .mockReturnValueOnce(secondSave.promise),
    });

    render(<DashboardPage client={client} />);
    fireEvent.change(await screen.findByLabelText('Profile:'), { target: { value: 'strict' } });
    fireEvent.change(screen.getByLabelText('Profile:'), { target: { value: 'permissive' } });

    secondSave.reject(new Error('HTTP 409'));
    firstSave.reject(new Error('HTTP 409'));

    await waitFor(() => {
      expect((screen.getByLabelText('Profile:') as HTMLSelectElement).value).toBe('standard');
    });
  });
});
