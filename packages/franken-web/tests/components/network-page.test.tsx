import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NetworkPage } from '../../src/pages/network-page';
import type { NetworkConfigResponse } from '../../src/lib/network-api';

const baseConfig: NetworkConfigResponse = {
  network: { mode: 'secure', secureBackend: 'local-encrypted' },
  chat: { model: 'claude-sonnet-4-6', enabled: true, host: '127.0.0.1', port: 3737 },
  dashboard: { enabled: true, host: '127.0.0.1', port: 4173, apiUrl: 'http://127.0.0.1:3737' },
  comms: { enabled: false },
};

afterEach(cleanup);

describe('NetworkPage', () => {
  it('renders status, service controls, secure mode, and logs', () => {
    render(
      <NetworkPage
        config={baseConfig}
        logs={['/tmp/chat-server.log']}
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

    expect(screen.getByText('secure')).toBeDefined();
    expect(screen.getByText('chat-server')).toBeDefined();
    expect(screen.getByText('/tmp/chat-server.log')).toBeDefined();
    expect(screen.getByDisplayValue('claude-sonnet-4-6')).toBeDefined();
    expect(screen.getByDisplayValue('local-encrypted')).toBeDefined();
    expect((screen.getByLabelText('Chat enabled') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('button', { name: 'Refresh' }).getAttribute('class')).toContain('button--secondary');
    expect(screen.getByRole('button', { name: 'Save config' }).getAttribute('class')).toContain('button--primary');
  });

  it('invokes service controls and saves all changed config assignments atomically', () => {
    const onStart = vi.fn();
    const onStop = vi.fn();
    const onRestart = vi.fn();
    const onSaveConfig = vi.fn();

    render(
      <NetworkPage
        config={baseConfig}
        logs={[]}
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
        ]}
        status={{ mode: 'secure', secureBackend: 'local-encrypted' }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start chat-server' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop chat-server' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restart chat-server' }));
    fireEvent.change(screen.getByLabelText('Network mode'), { target: { value: 'hybrid' } });
    fireEvent.change(screen.getByLabelText('Chat model'), { target: { value: 'gpt-5' } });
    fireEvent.change(screen.getByLabelText('Chat host'), { target: { value: '0.0.0.0' } });
    fireEvent.change(screen.getByLabelText('Dashboard port'), { target: { value: '5173' } });
    fireEvent.click(screen.getByLabelText('Comms enabled'));
    fireEvent.click(screen.getByRole('button', { name: 'Save config' }));

    expect(onStart).toHaveBeenCalledWith('chat-server');
    expect(onStop).toHaveBeenCalledWith('chat-server');
    expect(onRestart).toHaveBeenCalledWith('chat-server');
    expect(onSaveConfig).toHaveBeenCalledWith([
      'network.mode=hybrid',
      'chat.model=gpt-5',
      'chat.host=0.0.0.0',
      'dashboard.port=5173',
      'comms.enabled=true',
    ]);
  });

  it('updates editor values when fetched config props change', () => {
    const { rerender } = render(
      <NetworkPage
        config={{
          network: { mode: 'secure', secureBackend: 'local-encrypted' },
          chat: { model: 'loading-model', enabled: true, host: '127.0.0.1', port: 3737 },
        }}
        logs={[]}
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
          network: { mode: 'hybrid', secureBackend: 'remote-vault' },
          chat: { model: 'fetched-model', enabled: false, host: '0.0.0.0', port: 4747 },
          dashboard: { enabled: true, host: 'localhost', port: 5173, apiUrl: 'http://localhost:4747' },
          comms: { enabled: true },
        }}
        logs={[]}
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
    expect(screen.getByDisplayValue('hybrid')).toBeDefined();
    expect(screen.getByDisplayValue('remote-vault')).toBeDefined();
    expect((screen.getByLabelText('Chat enabled') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText('Comms enabled') as HTMLInputElement).checked).toBe(true);
  });

  it('surfaces save errors from the network config API', async () => {
    const onSaveConfig = vi.fn().mockRejectedValue(new Error('HTTP 400'));

    render(
      <NetworkPage
        config={baseConfig}
        logs={[]}
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

  it('disables unsupported stop and restart controls for in-process services', () => {
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

    const stopButton = screen.getByRole('button', { name: 'Stop comms-gateway' });
    const restartButton = screen.getByRole('button', { name: 'Restart comms-gateway' });

    fireEvent.click(screen.getByRole('button', { name: 'Start comms-gateway' }));
    fireEvent.click(stopButton);
    fireEvent.click(restartButton);

    expect(stopButton).toHaveProperty('disabled', true);
    expect(restartButton).toHaveProperty('disabled', true);
    expect(onStart).toHaveBeenCalledWith('comms-gateway');
    expect(onStop).not.toHaveBeenCalled();
    expect(onRestart).not.toHaveBeenCalled();
  });
});
