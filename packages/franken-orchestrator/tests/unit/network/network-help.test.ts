import { describe, expect, it } from 'vitest';
import { renderNetworkHelp } from '../../../src/network/network-help.js';

describe('renderNetworkHelp', () => {
  it('documents the supervisor-owned managed network marker and side effects', () => {
    const help = renderNetworkHelp();

    expect(help).toContain('FRANKENBEAST_NETWORK_MANAGED=1');
    expect(help).toContain('supervisor-owned marker');
    expect(help).toContain('suppress the CLI banner');
    expect(help).toContain('fails closed');
    expect(help).toContain('FRANKENBEAST_BEAST_OPERATOR_TOKEN');
  });
});