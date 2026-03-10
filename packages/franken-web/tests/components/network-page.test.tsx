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
          chat: { model: 'claude-sonnet-4-6', enabled: true, host: '127.0.0.1', port: 3000 },
        }}
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
            url: 'http://127.0.0.1:3000',
          },
        ]}
        status={{ mode: 'secure', secureBackend: 'local-encrypted' }}
      />,
    );

    expect(screen.getByText('secure')).toBeDefined();
    expect(screen.getByText('chat-server')).toBeDefined();
    expect(screen.getByText('/tmp/chat-server.log')).toBeDefined();
    expect(screen.getByDisplayValue('claude-sonnet-4-6')).toBeDefined();
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
          chat: { model: 'claude-sonnet-4-6', enabled: true, host: '127.0.0.1', port: 3000 },
        }}
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
            url: 'http://127.0.0.1:3000',
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
});
