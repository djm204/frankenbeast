import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NetworkPage } from '../../src/pages/network-page';
import type { NetworkConfigResponse } from '../../src/lib/network-api';

const baseConfig: NetworkConfigResponse = {
  network: { mode: 'secure', secureBackend: 'local-encrypted' },
  chat: { model: 'claude-sonnet-4-6', enabled: true, host: '127.0.0.1', port: 3737 },
  dashboard: { enabled: true, host: '127.0.0.1', port: 4173, apiUrl: 'https://127.0.0.1:3737' },
  comms: { enabled: false },
};

afterEach(cleanup);

describe('NetworkPage', () => {
  it('renders status, service controls, secure mode, and logs', () => {
    render(
      <NetworkPage
        config={baseConfig}
        logs={['/tmp/chat-server.log']}
        onSelectLogService={vi.fn()}
        onRefresh={vi.fn()}
        onRestart={vi.fn()}
        onSaveConfig={vi.fn()}
        onStart={vi.fn()}
        onStop={vi.fn()}
        services={[
          {
            id: 'chat-server',
            status: 'running',
            explanation: 'CLI-parity websocket chat',
            url: 'http://127.0.0.1:3737',
          },
        ]}
        status={{ mode: 'secure', secureBackend: 'local-encrypted' }}
      />,
    );

    expect(screen.getAllByText('secure').length).toBeGreaterThan(0);
    expect(screen.getByText('chat-server')).toBeDefined();
    expect(screen.getByText('/tmp/chat-server.log')).toBeDefined();
    expect(screen.getByDisplayValue('claude-sonnet-4-6')).toBeDefined();
    expect(screen.getByDisplayValue('local-encrypted')).toBeDefined();
    expect((screen.getByLabelText('Chat enabled') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('button', { name: 'Refresh' }).getAttribute('class')).toContain('button--secondary');
    expect(screen.getByRole('button', { name: 'Save config' }).getAttribute('class')).toContain('button--primary');
  });

  it('gates service controls by status and saves all changed config assignments atomically', async () => {
    const onStart = vi.fn().mockResolvedValue(undefined);
    const onStop = vi.fn().mockResolvedValue(undefined);
    const onRestart = vi.fn().mockResolvedValue(undefined);
    const onSaveConfig = vi.fn();

    render(
      <NetworkPage
        config={baseConfig}
        logs={[]}
        onSelectLogService={vi.fn()}
        onRefresh={vi.fn()}
        onRestart={onRestart}
        onSaveConfig={onSaveConfig}
        onStart={onStart}
        onStop={onStop}
        services={[
          {
            id: 'chat-server',
            status: 'running',
            explanation: 'CLI-parity websocket chat',
            url: 'http://127.0.0.1:3737',
          },
          {
            id: 'dashboard',
            status: 'stopped',
            explanation: 'Dashboard is offline',
          },
          {
            id: 'worker',
            status: 'stale',
            explanation: 'Healthcheck failed',
          },
        ]}
        status={{ mode: 'secure', secureBackend: 'local-encrypted' }}
      />,
    );

    const runningStart = screen.getByRole('button', { name: 'Start chat-server' });
    const stoppedStop = screen.getByRole('button', { name: 'Stop dashboard' });
    const stoppedRestart = screen.getByRole('button', { name: 'Restart dashboard' });
    const staleStart = screen.getByRole('button', { name: 'Start worker' });

    expect(runningStart).toHaveProperty('disabled', true);
    expect(stoppedStop).toHaveProperty('disabled', true);
    expect(stoppedRestart).toHaveProperty('disabled', true);
    expect(staleStart).toHaveProperty('disabled', true);

    fireEvent.click(runningStart);
    fireEvent.click(stoppedStop);
    fireEvent.click(stoppedRestart);
    expect(onStart).not.toHaveBeenCalledWith('chat-server');
    expect(onStop).not.toHaveBeenCalledWith('dashboard');
    expect(onRestart).not.toHaveBeenCalledWith('dashboard');

    fireEvent.click(screen.getByRole('button', { name: 'Stop chat-server' }));
    await waitFor(() => expect(screen.getByText('Stopped chat-server.')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Restart chat-server' }));
    await waitFor(() => expect(screen.getByText('Restarted chat-server.')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Start dashboard' }));
    await waitFor(() => expect(screen.getByText('Started dashboard.')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Stop worker' }));
    await waitFor(() => expect(screen.getByText('Stopped worker.')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Restart worker' }));
    await waitFor(() => expect(screen.getByText('Restarted worker.')).toBeDefined());
    fireEvent.change(screen.getByLabelText('Network mode'), { target: { value: 'insecure' } });
    fireEvent.change(screen.getByLabelText('Chat model'), { target: { value: 'gpt-5' } });
    fireEvent.change(screen.getByLabelText('Chat host'), { target: { value: '0.0.0.0' } });
    fireEvent.change(screen.getByLabelText('Dashboard port'), { target: { value: '5173' } });
    fireEvent.click(screen.getByLabelText('Comms enabled'));
    fireEvent.click(screen.getByRole('button', { name: 'Save config' }));

    expect(onStart).toHaveBeenCalledWith('dashboard');
    expect(onStop).toHaveBeenCalledWith('chat-server');
    expect(onStop).toHaveBeenCalledWith('worker');
    expect(onRestart).toHaveBeenCalledWith('chat-server');
    expect(onRestart).toHaveBeenCalledWith('worker');
    expect(onSaveConfig).toHaveBeenCalledWith([
      'network.mode=insecure',
      'chat.model=gpt-5',
      'chat.host=0.0.0.0',
      'dashboard.port=5173',
      'comms.enabled=true',
    ]);
  });

  it('disables duplicate service actions while a request is pending', async () => {
    let resolveStop!: () => void;
    const onStop = vi.fn().mockImplementation(() => new Promise<void>((resolve) => { resolveStop = resolve; }));

    render(
      <NetworkPage
        config={baseConfig}
        logs={[]}
        onSelectLogService={vi.fn()}
        onRefresh={vi.fn()}
        onRestart={vi.fn()}
        onSaveConfig={vi.fn()}
        onStart={vi.fn()}
        onStop={onStop}
        services={[{ id: 'chat-server', status: 'running' }]}
        status={{ mode: 'secure', secureBackend: 'local-encrypted' }}
      />,
    );

    const stopButton = screen.getByRole('button', { name: 'Stop chat-server' });
    fireEvent.click(stopButton);
    fireEvent.click(stopButton);

    await waitFor(() => expect(stopButton).toHaveProperty('disabled', true));
    expect(screen.getByRole('button', { name: 'Restart chat-server' })).toHaveProperty('disabled', true);
    expect(onStop).toHaveBeenCalledTimes(1);

    resolveStop();
    await waitFor(() => expect(screen.getByText('Stopped chat-server.')).toBeDefined());
  });

  it('keeps Save disabled until valid config changes are pending and previews assignments', () => {
    const onSaveConfig = vi.fn();

    render(
      <NetworkPage
        config={baseConfig}
        logs={[]}
        onSelectLogService={vi.fn()}
        onRefresh={vi.fn()}
        onRestart={vi.fn()}
        onSaveConfig={onSaveConfig}
        onStart={vi.fn()}
        onStop={vi.fn()}
        services={[]}
        status={{ mode: 'secure', secureBackend: 'local-encrypted' }}
      />,
    );

    const saveButton = screen.getByRole('button', { name: 'Save config' });
    expect(saveButton).toHaveProperty('disabled', true);
    expect(screen.getByText('No pending config changes.')).toBeDefined();

    fireEvent.change(screen.getByLabelText('Dashboard port'), { target: { value: '70000' } });

    expect(saveButton).toHaveProperty('disabled', true);
    expect(screen.getByRole('alert').textContent).toContain('Dashboard port must be between 1 and 65535.');
    fireEvent.click(saveButton);
    expect(onSaveConfig).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Dashboard port'), { target: { value: '5173' } });
    fireEvent.change(screen.getByLabelText('Dashboard API URL'), { target: { value: '' } });

    expect(saveButton).toHaveProperty('disabled', true);
    expect(screen.getByRole('alert').textContent).toContain('Dashboard API URL is required.');

    fireEvent.change(screen.getByLabelText('Dashboard API URL'), { target: { value: 'http://localhost:3737' } });
    fireEvent.change(screen.getByLabelText('Chat model'), { target: { value: 'gpt-5' } });

    expect(screen.getByText('Pending config changes')).toBeDefined();
    expect(screen.getByText('chat.model=gpt-5')).toBeDefined();
    expect(saveButton).toHaveProperty('disabled', false);
  });

  it('shows success feedback after network config changes save and the refreshed config arrives', async () => {
    const onSaveConfig = vi.fn().mockResolvedValue(undefined);

    const { rerender } = render(
      <NetworkPage
        config={baseConfig}
        logs={[]}
        onSelectLogService={vi.fn()}
        onRefresh={vi.fn()}
        onRestart={vi.fn()}
        onSaveConfig={onSaveConfig}
        onStart={vi.fn()}
        onStop={vi.fn()}
        services={[]}
        status={{ mode: 'secure', secureBackend: 'local-encrypted' }}
      />,
    );

    fireEvent.change(screen.getByLabelText('Dashboard API URL'), { target: { value: 'http://localhost:3737' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save config' }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Saved network config changes.'));
    expect(onSaveConfig).toHaveBeenCalledWith(['dashboard.apiUrl=http://localhost:3737']);

    rerender(
      <NetworkPage
        config={{
          ...baseConfig,
          dashboard: { ...baseConfig.dashboard!, apiUrl: 'http://localhost:3737' },
        }}
        logs={[]}
        onSelectLogService={vi.fn()}
        onRefresh={vi.fn()}
        onRestart={vi.fn()}
        onSaveConfig={onSaveConfig}
        onStart={vi.fn()}
        onStop={vi.fn()}
        services={[]}
        status={{ mode: 'secure', secureBackend: 'local-encrypted' }}
      />,
    );

    expect(screen.getByRole('status').textContent).toContain('Saved network config changes.');
  });

  it('updates editor values when fetched config props change', () => {
    const { rerender } = render(
      <NetworkPage
        config={{
          network: { mode: 'secure', secureBackend: 'local-encrypted' },
          chat: { model: 'loading-model', enabled: true, host: '127.0.0.1', port: 3737 },
        }}
        logs={[]}
        onSelectLogService={vi.fn()}
        onRefresh={vi.fn()}
        onRestart={vi.fn()}
        onSaveConfig={vi.fn()}
        onStart={vi.fn()}
        onStop={vi.fn()}
        services={[]}
        status={{ mode: 'secure', secureBackend: 'local-encrypted' }}
      />,
    );

    expect(screen.getByDisplayValue('loading-model')).toBeDefined();

    rerender(
      <NetworkPage
        config={{
          network: { mode: 'insecure', secureBackend: 'os-keychain' },
          chat: { model: 'fetched-model', enabled: false, host: '0.0.0.0', port: 4747 },
          dashboard: { enabled: true, host: 'localhost', port: 5173, apiUrl: 'http://localhost:4747' },
          comms: { enabled: true },
        }}
        logs={[]}
        onSelectLogService={vi.fn()}
        onRefresh={vi.fn()}
        onRestart={vi.fn()}
        onSaveConfig={vi.fn()}
        onStart={vi.fn()}
        onStop={vi.fn()}
        services={[]}
        status={{ mode: 'secure', secureBackend: 'local-encrypted' }}
      />,
    );

    expect(screen.getByDisplayValue('fetched-model')).toBeDefined();
    expect(screen.getByDisplayValue('insecure')).toBeDefined();
    expect(screen.getByDisplayValue('os-keychain')).toBeDefined();
    expect((screen.getByLabelText('Chat enabled') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText('Comms enabled') as HTMLInputElement).checked).toBe(true);
  });

  it('surfaces save errors from the network config API', async () => {
    const onSaveConfig = vi.fn().mockRejectedValue(new Error('HTTP 400'));

    render(
      <NetworkPage
        config={baseConfig}
        logs={[]}
        onSelectLogService={vi.fn()}
        onRefresh={vi.fn()}
        onRestart={vi.fn()}
        onSaveConfig={onSaveConfig}
        onStart={vi.fn()}
        onStop={vi.fn()}
        services={[]}
        status={{ mode: 'secure', secureBackend: 'local-encrypted' }}
      />,
    );

    fireEvent.change(screen.getByLabelText('Chat model'), { target: { value: 'bad-model' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save config' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('HTTP 400'));
  });

  it('disables unsupported service controls for in-process services', () => {
    const onStart = vi.fn();
    const onStop = vi.fn();
    const onRestart = vi.fn();

    render(
      <NetworkPage
        config={{
          network: { mode: 'secure', secureBackend: 'local-encrypted' },
          chat: { model: 'claude-sonnet-4-6', enabled: true, host: '127.0.0.1', port: 3737 },
        }}
        logs={[]}
        onSelectLogService={vi.fn()}
        onRefresh={vi.fn()}
        onRestart={onRestart}
        onSaveConfig={vi.fn()}
        onStart={onStart}
        onStop={onStop}
        services={[
          {
            id: 'comms-gateway',
            status: 'running',
            inProcess: true,
            channels: { slack: true, discord: false },
          },
        ]}
        status={{ mode: 'secure', secureBackend: 'local-encrypted' }}
      />,
    );

    const startButton = screen.getByRole('button', { name: 'Start comms-gateway' });
    const stopButton = screen.getByRole('button', { name: 'Stop comms-gateway' });
    const restartButton = screen.getByRole('button', { name: 'Restart comms-gateway' });

    fireEvent.click(startButton);
    fireEvent.click(stopButton);
    fireEvent.click(restartButton);

    expect(startButton).toHaveProperty('disabled', true);
    expect(stopButton).toHaveProperty('disabled', true);
    expect(restartButton).toHaveProperty('disabled', true);
    expect(onStart).not.toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();
    expect(onRestart).not.toHaveBeenCalled();
  });

  it('lets operators select a service whose logs should be fetched', () => {
    const onSelectLogService = vi.fn();

    render(
      <NetworkPage
        config={{
          network: { mode: 'secure', secureBackend: 'local-encrypted' },
          chat: { model: 'claude-sonnet-4-6', enabled: true, host: '127.0.0.1', port: 3737 },
        }}
        logs={[]}
        onRefresh={vi.fn()}
        onRestart={vi.fn()}
        onSaveConfig={vi.fn()}
        onSelectLogService={onSelectLogService}
        onStart={vi.fn()}
        onStop={vi.fn()}
        services={[
          { id: 'chat-server', status: 'running' },
          { id: 'dashboard', status: 'stopped' },
          { id: 'orphan-in-process', status: 'running', inProcess: true },
          { id: 'comms-gateway', status: 'running', inProcess: true, hostServiceId: 'chat-server' },
        ]}
        status={{ mode: 'secure', secureBackend: 'local-encrypted' }}
      />,
    );

    fireEvent.change(screen.getByLabelText('Service logs'), { target: { value: 'chat-server' } });

    expect(onSelectLogService).toHaveBeenCalledWith('chat-server');
    expect(screen.queryByRole('option', { name: 'orphan-in-process (running)' })).toBeNull();
    expect(screen.getByRole('option', { name: 'comms-gateway (running)' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'View logs for dashboard' }));
    fireEvent.click(screen.getByRole('button', { name: 'View logs for comms-gateway' }));

    expect(onSelectLogService).toHaveBeenCalledWith('dashboard');
    expect(onSelectLogService).toHaveBeenCalledWith('comms-gateway');
    expect(screen.queryByRole('button', { name: 'View logs for orphan-in-process' })).toBeNull();
  });

  it('upgrades network logs into a searchable operational viewer', () => {
    const scrollTo = vi.fn();
    const originalScrollTo = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = scrollTo;

    render(
      <NetworkPage
        config={baseConfig}
        logs={[
          '2026-07-05T07:00:00Z INFO chat-server ready',
          '2026-07-05T07:01:00Z ERROR failed to bind port',
          'WARN retrying connection to dashboard',
        ]}
        onRefresh={vi.fn()}
        onRestart={vi.fn()}
        onSaveConfig={vi.fn()}
        onSelectLogService={vi.fn()}
        onStart={vi.fn()}
        onStop={vi.fn()}
        selectedLogServiceId="chat-server"
        services={[{ id: 'chat-server', status: 'running' }]}
        status={{ mode: 'secure', secureBackend: 'local-encrypted' }}
      />,
    );

    expect(screen.getByText('3 entries')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Copy visible logs' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Download visible logs' }).getAttribute('download')).toBe('chat-server-network.log');
    expect(screen.getByRole('button', { name: 'Tail live logs' }).getAttribute('aria-pressed')).toBe('true');
    expect(scrollTo).toHaveBeenCalled();
    expect((screen.getByLabelText('Wrap log lines') as HTMLInputElement).checked).toBe(true);

    const errorLine = screen.getByText(/failed to bind port/).closest('li');
    expect(errorLine?.getAttribute('class')).toContain('network-logs__line--error');
    expect(errorLine?.querySelector('time')?.getAttribute('dateTime')).toBe('2026-07-05T07:01:00Z');

    fireEvent.change(screen.getByLabelText('Search logs'), { target: { value: 'failed' } });

    expect(screen.getByText('1 of 3 entries')).toBeDefined();
    expect(screen.getByText(/failed to bind port/)).toBeDefined();
    expect(screen.queryByText(/chat-server ready/)).toBeNull();

    fireEvent.change(screen.getByLabelText('Log level'), { target: { value: 'warn' } });

    expect(screen.getByText('No logs match the current search and level filters.')).toBeDefined();

    HTMLElement.prototype.scrollTo = originalScrollTo;
  });
});
