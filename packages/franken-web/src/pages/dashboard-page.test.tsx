import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('preserves a successful skill toggle as the confirmed rollback baseline', async () => {
    const failedDisable = deferred<void>();
    const client = mockClient({
      toggleSkill: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockReturnValueOnce(failedDisable.promise),
    });

    render(<DashboardPage client={client} />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Enable shell' }));

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Disable shell' }).getAttribute('aria-checked')).toBe('true');
    });

    fireEvent.click(screen.getByRole('switch', { name: 'Disable shell' }));
    failedDisable.reject(new Error('HTTP 500'));

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Disable shell' }).getAttribute('aria-checked')).toBe('true');
    });
  });

  it('preserves a successful profile save as the confirmed rollback baseline', async () => {
    const failedPermissiveSave = deferred<void>();
    const client = mockClient({
      updateSecurityProfile: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockReturnValueOnce(failedPermissiveSave.promise),
    });

    render(<DashboardPage client={client} />);
    fireEvent.change(await screen.findByLabelText('Profile:'), { target: { value: 'strict' } });

    await waitFor(() => {
      expect((screen.getByLabelText('Profile:') as HTMLSelectElement).value).toBe('strict');
    });

    fireEvent.change(screen.getByLabelText('Profile:'), { target: { value: 'permissive' } });
    failedPermissiveSave.reject(new Error('HTTP 409'));

    await waitFor(() => {
      expect((screen.getByLabelText('Profile:') as HTMLSelectElement).value).toBe('strict');
    });
  });

  it('leaves the populated dashboard usable when a refresh fails after confirmed data exists', async () => {
    const initialClient = mockClient();
    const refreshedClient = mockClient({ fetchSnapshot: vi.fn().mockRejectedValue(new Error('HTTP 503')) });
    const { rerender } = render(<DashboardPage client={initialClient} />);

    expect(await screen.findByRole('switch', { name: 'Enable shell' })).toBeTruthy();

    rerender(<DashboardPage client={refreshedClient} />);

    await waitFor(() => {
      expect(screen.queryByText('Loading dashboard...')).toBeNull();
      expect(screen.getByRole('switch', { name: 'Enable shell' })).toBeTruthy();
    });
    expect(screen.queryByText(/Unable to load dashboard/)).toBeNull();
  });

  it('preserves an earlier successful skill toggle when a newer overlapping toggle fails', async () => {
    const successfulEnable = deferred<void>();
    const failedDisable = deferred<void>();
    const client = mockClient({
      toggleSkill: vi.fn()
        .mockReturnValueOnce(successfulEnable.promise)
        .mockReturnValueOnce(failedDisable.promise),
    });

    render(<DashboardPage client={client} />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Enable shell' }));
    fireEvent.click(await screen.findByRole('switch', { name: 'Disable shell' }));

    successfulEnable.resolve(undefined);

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Enable shell' }).getAttribute('aria-checked')).toBe('false');
    });

    failedDisable.reject(new Error('HTTP 500'));

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Disable shell' }).getAttribute('aria-checked')).toBe('true');
    });
  });

  it('preserves an earlier successful profile save when a newer overlapping save fails', async () => {
    const successfulStrictSave = deferred<void>();
    const failedPermissiveSave = deferred<void>();
    const client = mockClient({
      updateSecurityProfile: vi.fn()
        .mockReturnValueOnce(successfulStrictSave.promise)
        .mockReturnValueOnce(failedPermissiveSave.promise),
    });

    render(<DashboardPage client={client} />);
    fireEvent.change(await screen.findByLabelText('Profile:'), { target: { value: 'strict' } });
    fireEvent.change(screen.getByLabelText('Profile:'), { target: { value: 'permissive' } });

    successfulStrictSave.resolve(undefined);
    failedPermissiveSave.reject(new Error('HTTP 409'));

    await waitFor(() => {
      expect((screen.getByLabelText('Profile:') as HTMLSelectElement).value).toBe('strict');
    });
  });

  it('does not overwrite a newer SSE skill snapshot when an older toggle succeeds late', async () => {
    const successfulEnable = deferred<void>();
    let pushSnapshot!: (snapshot: DashboardSnapshot) => void;
    const client = mockClient({
      toggleSkill: vi.fn().mockReturnValue(successfulEnable.promise),
      subscribeToDashboard: vi.fn((onSnapshot: (snapshot: DashboardSnapshot) => void) => {
        pushSnapshot = onSnapshot;
        return () => undefined;
      }),
    });

    render(<DashboardPage client={client} />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Enable shell' }));
    pushSnapshot(snapshot);
    successfulEnable.resolve(undefined);

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Enable shell' }).getAttribute('aria-checked')).toBe('false');
    });
  });

  it('does not overwrite a newer SSE profile snapshot when an older save succeeds late', async () => {
    const successfulStrictSave = deferred<void>();
    let pushSnapshot!: (snapshot: DashboardSnapshot) => void;
    const client = mockClient({
      updateSecurityProfile: vi.fn().mockReturnValue(successfulStrictSave.promise),
      subscribeToDashboard: vi.fn((onSnapshot: (snapshot: DashboardSnapshot) => void) => {
        pushSnapshot = onSnapshot;
        return () => undefined;
      }),
    });

    render(<DashboardPage client={client} />);
    fireEvent.change(await screen.findByLabelText('Profile:'), { target: { value: 'strict' } });
    pushSnapshot({ ...snapshot, security: { ...snapshot.security, profile: 'permissive' } });
    successfulStrictSave.resolve(undefined);

    await waitFor(() => {
      expect((screen.getByLabelText('Profile:') as HTMLSelectElement).value).toBe('permissive');
    });
  });

  it('uses a cached dashboard as the rollback baseline when refresh fails on remount', async () => {
    useDashboardStore.getState().setSnapshot(snapshot);
    const client = mockClient({
      fetchSnapshot: vi.fn().mockRejectedValue(new Error('HTTP 503')),
      toggleSkill: vi.fn().mockRejectedValue(new Error('HTTP 500')),
    });

    render(<DashboardPage client={client} />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Enable shell' }));

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Enable shell' }).getAttribute('aria-checked')).toBe('false');
    });
  });

  it('retries a failed skill mutation toward the requested state without flipping current server state', async () => {
    const client = mockClient({
      toggleSkill: vi.fn()
        .mockRejectedValueOnce(new Error('HTTP 500'))
        .mockResolvedValueOnce(undefined),
    });

    render(<DashboardPage client={client} />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Enable shell' }));
    expect(await screen.findByRole('button', { name: 'Retry enabling shell' })).toBeTruthy();

    act(() => {
      useDashboardStore.getState().setSkillEnabled('shell', true);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Retry enabling shell' }));

    await waitFor(() => {
      expect(client.toggleSkill).toHaveBeenLastCalledWith('shell', true);
      expect(screen.getByRole('switch', { name: 'Disable shell' }).getAttribute('aria-checked')).toBe('true');
    });
  });

  it('ignores stale mutation failures from a previous dashboard client', async () => {
    const staleToggle = deferred<void>();
    const firstClient = mockClient({
      toggleSkill: vi.fn().mockReturnValue(staleToggle.promise),
    });
    const nextClient = mockClient();
    const { rerender } = render(<DashboardPage client={firstClient} />);

    fireEvent.click(await screen.findByRole('switch', { name: 'Enable shell' }));
    rerender(<DashboardPage client={nextClient} />);
    await screen.findByRole('switch', { name: 'Enable shell' });

    staleToggle.reject(new Error('HTTP 500'));

    await waitFor(() => {
      expect(screen.queryByText(/Could not enable shell/)).toBeNull();
      expect(screen.getByRole('switch', { name: 'Enable shell' }).getAttribute('aria-checked')).toBe('false');
    });
  });

  it('preserves newer snapshot fields when rolling back one failed skill mutation', async () => {
    const failedShellToggle = deferred<void>();
    let pushSnapshot!: (snapshot: DashboardSnapshot) => void;
    const multiSkillSnapshot: DashboardSnapshot = {
      ...snapshot,
      skills: [
        { name: 'shell', enabled: false, hasContext: false, mcpServerCount: 0 },
        { name: 'github', enabled: false, hasContext: false, mcpServerCount: 0 },
      ],
    };
    const client = mockClient({
      fetchSnapshot: vi.fn().mockResolvedValue(multiSkillSnapshot),
      toggleSkill: vi.fn().mockReturnValue(failedShellToggle.promise),
      subscribeToDashboard: vi.fn((onSnapshot: (nextSnapshot: DashboardSnapshot) => void) => {
        pushSnapshot = onSnapshot;
        return () => undefined;
      }),
    });

    render(<DashboardPage client={client} />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Enable shell' }));
    pushSnapshot({
      ...multiSkillSnapshot,
      skills: [
        { name: 'shell', enabled: false, hasContext: false, mcpServerCount: 0 },
        { name: 'github', enabled: true, hasContext: false, mcpServerCount: 0 },
      ],
    });

    failedShellToggle.reject(new Error('HTTP 500'));

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Enable shell' }).getAttribute('aria-checked')).toBe('false');
      expect(screen.getByRole('switch', { name: 'Disable github' }).getAttribute('aria-checked')).toBe('true');
    });
  });

  it('applies an earlier successful skill toggle after a newer overlapping toggle fails first', async () => {
    const successfulEnable = deferred<void>();
    const failedDisable = deferred<void>();
    const client = mockClient({
      toggleSkill: vi.fn()
        .mockReturnValueOnce(successfulEnable.promise)
        .mockReturnValueOnce(failedDisable.promise),
    });

    render(<DashboardPage client={client} />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Enable shell' }));
    fireEvent.click(await screen.findByRole('switch', { name: 'Disable shell' }));

    failedDisable.reject(new Error('HTTP 500'));
    successfulEnable.resolve(undefined);

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Disable shell' }).getAttribute('aria-checked')).toBe('true');
    });
  });

  it('applies an earlier successful security profile save after a newer overlapping save fails first', async () => {
    const successfulStrictSave = deferred<void>();
    const failedPermissiveSave = deferred<void>();
    const client = mockClient({
      updateSecurityProfile: vi.fn()
        .mockReturnValueOnce(successfulStrictSave.promise)
        .mockReturnValueOnce(failedPermissiveSave.promise),
    });

    render(<DashboardPage client={client} />);
    fireEvent.change(await screen.findByLabelText('Profile:'), { target: { value: 'strict' } });
    fireEvent.change(screen.getByLabelText('Profile:'), { target: { value: 'permissive' } });

    failedPermissiveSave.reject(new Error('HTTP 409'));
    successfulStrictSave.resolve(undefined);

    await waitFor(() => {
      expect((screen.getByLabelText('Profile:') as HTMLSelectElement).value).toBe('strict');
    });
  });

  it('does not show a failed skill mutation alert after a snapshot confirms the requested state', async () => {
    const failedEnable = deferred<void>();
    let pushSnapshot!: (snapshot: DashboardSnapshot) => void;
    const client = mockClient({
      toggleSkill: vi.fn().mockReturnValue(failedEnable.promise),
      subscribeToDashboard: vi.fn((onSnapshot: (nextSnapshot: DashboardSnapshot) => void) => {
        pushSnapshot = onSnapshot;
        return () => undefined;
      }),
    });

    render(<DashboardPage client={client} />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Enable shell' }));
    pushSnapshot({
      ...snapshot,
      skills: [{ name: 'shell', enabled: true, hasContext: false, mcpServerCount: 0 }],
    });
    failedEnable.reject(new Error('HTTP 500'));

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Disable shell' }).getAttribute('aria-checked')).toBe('true');
      expect(screen.queryByText(/Could not enable shell/)).toBeNull();
    });
  });

  it('does not show a failed security save alert after a snapshot confirms the requested profile', async () => {
    const failedStrictSave = deferred<void>();
    let pushSnapshot!: (snapshot: DashboardSnapshot) => void;
    const client = mockClient({
      updateSecurityProfile: vi.fn().mockReturnValue(failedStrictSave.promise),
      subscribeToDashboard: vi.fn((onSnapshot: (nextSnapshot: DashboardSnapshot) => void) => {
        pushSnapshot = onSnapshot;
        return () => undefined;
      }),
    });

    render(<DashboardPage client={client} />);
    fireEvent.change(await screen.findByLabelText('Profile:'), { target: { value: 'strict' } });
    pushSnapshot({ ...snapshot, security: { ...snapshot.security, profile: 'strict' } });
    failedStrictSave.reject(new Error('HTTP 409'));

    await waitFor(() => {
      expect((screen.getByLabelText('Profile:') as HTMLSelectElement).value).toBe('strict');
      expect(screen.queryByText(/Could not save security profile/)).toBeNull();
    });
  });

  it('preserves unrelated optimistic skill updates when confirming one skill', async () => {
    const successfulShellToggle = deferred<void>();
    const pendingGithubToggle = deferred<void>();
    const multiSkillSnapshot: DashboardSnapshot = {
      ...snapshot,
      skills: [
        { name: 'shell', enabled: false, hasContext: false, mcpServerCount: 0 },
        { name: 'github', enabled: false, hasContext: false, mcpServerCount: 0 },
      ],
    };
    const client = mockClient({
      fetchSnapshot: vi.fn().mockResolvedValue(multiSkillSnapshot),
      toggleSkill: vi.fn()
        .mockReturnValueOnce(successfulShellToggle.promise)
        .mockReturnValueOnce(pendingGithubToggle.promise),
    });

    render(<DashboardPage client={client} />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Enable shell' }));
    fireEvent.click(await screen.findByRole('switch', { name: 'Enable github' }));
    successfulShellToggle.resolve(undefined);

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Disable shell' }).getAttribute('aria-checked')).toBe('true');
      expect(screen.getByRole('switch', { name: 'Disable github' }).getAttribute('aria-checked')).toBe('true');
    });
  });

  it('clears stale skill mutation errors when a server snapshot removes that skill', async () => {
    const failedEnable = deferred<void>();
    let pushSnapshot!: (snapshot: DashboardSnapshot) => void;
    const client = mockClient({
      toggleSkill: vi.fn().mockReturnValue(failedEnable.promise),
      subscribeToDashboard: vi.fn((onSnapshot: (nextSnapshot: DashboardSnapshot) => void) => {
        pushSnapshot = onSnapshot;
        return () => undefined;
      }),
    });

    render(<DashboardPage client={client} />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Enable shell' }));
    failedEnable.reject(new Error('HTTP 500'));
    expect(await screen.findByText(/Could not enable shell/)).toBeTruthy();

    pushSnapshot({ ...snapshot, skills: [] });

    await waitFor(() => {
      expect(screen.queryByText(/Could not enable shell/)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Retry enabling shell' })).toBeNull();
    });
  });

  it('ignores a failed skill mutation when a server snapshot removed that pending skill', async () => {
    const failedEnable = deferred<void>();
    let pushSnapshot!: (snapshot: DashboardSnapshot) => void;
    const client = mockClient({
      toggleSkill: vi.fn().mockReturnValue(failedEnable.promise),
      subscribeToDashboard: vi.fn((onSnapshot: (nextSnapshot: DashboardSnapshot) => void) => {
        pushSnapshot = onSnapshot;
        return () => undefined;
      }),
    });

    render(<DashboardPage client={client} />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Enable shell' }));
    pushSnapshot({ ...snapshot, skills: [] });
    failedEnable.reject(new Error('HTTP 500'));

    await waitFor(() => {
      expect(screen.queryByText(/Could not enable shell/)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Retry enabling shell' })).toBeNull();
    });
  });

  it('clears mutation errors when switching dashboard clients', async () => {
    const failedEnable = deferred<void>();
    const firstClient = mockClient({ toggleSkill: vi.fn().mockReturnValue(failedEnable.promise) });
    const nextClient = mockClient();
    const { rerender } = render(<DashboardPage client={firstClient} />);

    fireEvent.click(await screen.findByRole('switch', { name: 'Enable shell' }));
    failedEnable.reject(new Error('HTTP 500'));
    expect(await screen.findByText(/Could not enable shell/)).toBeTruthy();

    rerender(<DashboardPage client={nextClient} />);

    await waitFor(() => {
      expect(screen.queryByText(/Could not enable shell/)).toBeNull();
    });
  });

  it('handles skill names that collide with object prototype properties', async () => {
    const failedToggle = deferred<void>();
    const prototypeNameSnapshot: DashboardSnapshot = {
      ...snapshot,
      skills: [{ name: 'toString', enabled: false, hasContext: false, mcpServerCount: 0 }],
    };
    const client = mockClient({
      fetchSnapshot: vi.fn().mockResolvedValue(prototypeNameSnapshot),
      toggleSkill: vi.fn().mockReturnValue(failedToggle.promise),
    });

    render(<DashboardPage client={client} />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Enable toString' }));
    failedToggle.reject(new Error('HTTP 500'));

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Enable toString' }).getAttribute('aria-checked')).toBe('false');
      expect(screen.getByText(/Could not enable toString/)).toBeTruthy();
    });
  });

  it('retains the retry alert for a failed latest skill toggle when an older toggle later succeeds', async () => {
    const firstEnable = deferred<void>();
    const secondDisable = deferred<void>();
    const failedFinalEnable = deferred<void>();
    const client = mockClient({
      toggleSkill: vi.fn()
        .mockReturnValueOnce(firstEnable.promise)
        .mockReturnValueOnce(secondDisable.promise)
        .mockReturnValueOnce(failedFinalEnable.promise),
    });

    render(<DashboardPage client={client} />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Enable shell' }));
    fireEvent.click(await screen.findByRole('switch', { name: 'Disable shell' }));
    fireEvent.click(await screen.findByRole('switch', { name: 'Enable shell' }));

    failedFinalEnable.reject(new Error('HTTP 500'));
    secondDisable.resolve(undefined);

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Enable shell' }).getAttribute('aria-checked')).toBe('false');
      expect(screen.getByRole('button', { name: 'Retry enabling shell' })).toBeTruthy();
    });
  });

  it('retains the retry alert for a failed latest security save when an older save later succeeds', async () => {
    const firstStrictSave = deferred<void>();
    const secondPermissiveSave = deferred<void>();
    const failedFinalStrictSave = deferred<void>();
    const client = mockClient({
      updateSecurityProfile: vi.fn()
        .mockReturnValueOnce(firstStrictSave.promise)
        .mockReturnValueOnce(secondPermissiveSave.promise)
        .mockReturnValueOnce(failedFinalStrictSave.promise),
    });

    render(<DashboardPage client={client} />);
    fireEvent.change(await screen.findByLabelText('Profile:'), { target: { value: 'strict' } });
    fireEvent.change(screen.getByLabelText('Profile:'), { target: { value: 'permissive' } });
    fireEvent.change(screen.getByLabelText('Profile:'), { target: { value: 'strict' } });

    failedFinalStrictSave.reject(new Error('HTTP 409'));
    secondPermissiveSave.resolve(undefined);

    await waitFor(() => {
      expect((screen.getByLabelText('Profile:') as HTMLSelectElement).value).toBe('permissive');
      expect(screen.getByRole('button', { name: 'Retry saving strict' })).toBeTruthy();
    });
  });

  it('ignores snapshots from a superseded dashboard client subscription', async () => {
    let pushStaleSnapshot!: (nextSnapshot: DashboardSnapshot) => void;
    const firstClient = mockClient({
      subscribeToDashboard: vi.fn((onSnapshot: (nextSnapshot: DashboardSnapshot) => void) => {
        pushStaleSnapshot = onSnapshot;
        return () => undefined;
      }),
    });
    const nextClient = mockClient();
    const { rerender } = render(<DashboardPage client={firstClient} />);

    expect(await screen.findByRole('switch', { name: 'Enable shell' })).toBeTruthy();
    rerender(<DashboardPage client={nextClient} />);
    await screen.findByRole('switch', { name: 'Enable shell' });

    pushStaleSnapshot({ ...snapshot, security: { ...snapshot.security, profile: 'strict' } });

    await waitFor(() => {
      expect((screen.getByLabelText('Profile:') as HTMLSelectElement).value).toBe('standard');
    });
  });
});
