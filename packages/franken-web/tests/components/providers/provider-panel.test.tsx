import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ProviderPanel } from '../../../src/components/providers/provider-panel';

afterEach(cleanup);

describe('ProviderPanel', () => {
  it('renders provider names', () => {
    render(<ProviderPanel providers={[
      { name: 'claude', type: 'claude-cli', available: true, failoverOrder: 0 },
      { name: 'gemini', type: 'gemini-cli', available: false, failoverOrder: 1 },
    ]} />);
    expect(screen.getByText('claude')).toBeDefined();
    expect(screen.getByText('gemini')).toBeDefined();
  });

  it('shows health indicators', () => {
    render(<ProviderPanel providers={[
      { name: 'claude', type: 'claude-cli', available: true, failoverOrder: 0 },
      { name: 'gemini', type: 'gemini-cli', available: false, failoverOrder: 1 },
    ]} />);
    expect(screen.getByText('[ok]')).toBeDefined();
    expect(screen.getByText('[unavailable]')).toBeDefined();
  });

  it('shows a provider outage incident banner with deterministic failover guidance', () => {
    render(<ProviderPanel providers={[
      { name: 'gemini', type: 'gemini-cli', available: false, failoverOrder: 2 },
      { name: 'claude', type: 'claude-cli', available: true, failoverOrder: 0 },
      { name: 'codex', type: 'codex-cli', available: false, failoverOrder: 1 },
    ]} />);

    const banner = screen.getByRole('alert');
    expect(banner.textContent).toContain('Provider outage incident:');
    expect(banner.textContent).toContain('codex (codex-cli, failover #2), gemini (gemini-cli, failover #3) unavailable');
    expect(banner.textContent).toContain('Use the next available failover provider');
  });

  it('does not show an outage incident banner when every configured provider is available', () => {
    render(<ProviderPanel providers={[
      { name: 'claude', type: 'claude-cli', available: true, failoverOrder: 0 },
      { name: 'codex', type: 'codex-cli', available: true, failoverOrder: 1 },
    ]} />);

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('sorts by failover order', () => {
    render(<ProviderPanel providers={[
      { name: 'gemini', type: 'gemini-cli', available: true, failoverOrder: 2 },
      { name: 'claude', type: 'claude-cli', available: true, failoverOrder: 0 },
      { name: 'codex', type: 'codex-cli', available: true, failoverOrder: 1 },
    ]} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]!.textContent).toContain('claude');
    expect(items[1]!.textContent).toContain('codex');
    expect(items[2]!.textContent).toContain('gemini');
  });

  it('does not mutate provider order while sorting for display', () => {
    const providers = [
      { name: 'gemini', type: 'gemini-cli', available: true, failoverOrder: 2 },
      { name: 'claude', type: 'claude-cli', available: true, failoverOrder: 0 },
      { name: 'codex', type: 'codex-cli', available: true, failoverOrder: 1 },
    ];

    render(<ProviderPanel providers={providers} />);

    expect(providers.map((provider) => provider.name)).toEqual(['gemini', 'claude', 'codex']);
  });

  it('shows empty message when no providers', () => {
    render(<ProviderPanel providers={[]} />);
    expect(screen.getByText('No providers configured.')).toBeDefined();
  });
});
