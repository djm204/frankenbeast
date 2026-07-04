import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NetworkPage } from '../../src/pages/network-page';

afterEach(cleanup);

describe('NetworkPage', () => {
  it('renders status, service controls, secure mode, and logs', () => {
    render(
      <NetworkPage
        config={{
          network: { mode: 'secure', secureBackend: 'local-encrypted' },
          chat: { model: 'claude-sonnet-4-6', enabled: true, host: '127.0.0.1', port: 3737 },
        }}
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

    expect(screen.getByText('secure')).toBeDefined();
    expect(screen.getByText('chat-server')).toBeDefined();
    expect(screen.getByText('/tmp/chat-server.log')).toBeDefined();
    expect(screen.getByDisplayValue('claude-sonnet-4-6')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Refresh' }).getAttribute('class')).toContain('button--secondary');
    expect(screen.getByRole('button', { name: 'Save config' }).getAttribute('class')).toContain('button--primary');
  });

  it('invokes service controls and config save interactions', () => {
    const onStart = vi.fn();
    const onStop = vi.fn();
    const onRestart = vi.fn();
    const onSaveConfig = vi.fn();

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
    fireEvent.change(screen.getByLabelText('Chat model'), { target: { value: 'gpt-5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save config' }));

    expect(onStart).toHaveBeenCalledWith('chat-server');
    expect(onStop).toHaveBeenCalledWith('chat-server');
    expect(onRestart).toHaveBeenCalledWith('chat-server');
    expect(onSaveConfig).toHaveBeenCalledWith(['chat.model=gpt-5']);
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
        ]}
        status={{ mode: 'secure', secureBackend: 'local-encrypted' }}
      />,
    );

    fireEvent.change(screen.getByLabelText('Service logs'), { target: { value: 'chat-server' } });

    expect(onSelectLogService).toHaveBeenCalledWith('chat-server');
  });
});
