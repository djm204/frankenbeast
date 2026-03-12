import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { InterviewIO } from '../../../src/planning/interview-loop.js';
import type { ISecretStore, SecretStoreDetection } from '../../../src/network/secret-store.js';
import { runInitWizard, type InitWizardScope } from '../../../src/init/init-wizard.js';
import { createEmptyInitState } from '../../../src/init/init-types.js';

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function makeIO(responses: string[]): InterviewIO {
  let index = 0;
  const displayMessages: string[] = [];
  return {
    ask: vi.fn(async (_q: string) => {
      const resp = responses[index] ?? '';
      index++;
      return resp;
    }),
    display: vi.fn((_msg: string) => {
      displayMessages.push(_msg);
    }),
  };
}

function makeSecretStore(detection: SecretStoreDetection = { available: true }): ISecretStore & {
  stored: Map<string, string>;
} {
  const stored = new Map<string, string>();
  return {
    id: 'mock',
    detect: vi.fn(async () => detection),
    store: vi.fn(async (key: string, value: string) => {
      stored.set(key, value);
    }),
    resolve: vi.fn(async (key: string) => stored.get(key)),
    delete: vi.fn(async (key: string) => { stored.delete(key); }),
    keys: vi.fn(async () => Array.from(stored.keys())),
    stored,
  };
}

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

describe('InitWizardScope type', () => {
  it('includes secret-backend as a valid scope value', () => {
    // Type-level check — if this compiles, the type includes the value.
    const scope: readonly InitWizardScope[] = ['secret-backend'];
    expect(scope).toContain('secret-backend');
  });
});

describe('runInitWizard – backward compatibility (no secretStore)', () => {
  it('runs without a secretStore and produces valid result', async () => {
    // Answers: modules=yes, provider=default, security=secure, comms=no
    const io = makeIO(['y', 'y', 'n', 'claude', 'secure']);
    const state = createEmptyInitState('/tmp/test-config.json');
    const result = await runInitWizard({ io, initialState: state });
    expect(result.config).toBeDefined();
    expect(result.state).toBeDefined();
    // No secret-backend-selection in completedSteps (no secretStore)
    expect(result.state.completedSteps).not.toContain('secret-backend-selection');
  });
});

describe('runInitWizard – with secretStore', () => {
  it('calls secretStore.detect() and records secret-backend-selection in completedSteps', async () => {
    // Answers: modules=skip-defaults, provider=default, security=secure, comms=no, operator-token=blank(auto)
    const io = makeIO([
      'y',   // Enable Chat?
      'y',   // Enable Dashboard?
      'n',   // Enable Comms?
      'claude', // Default provider
      'secure', // Security mode
      '',    // Operator token (blank → auto-generate)
    ]);
    const secretStore = makeSecretStore({ available: true });
    const state = createEmptyInitState('/tmp/test-config.json');
    const result = await runInitWizard({ io, initialState: state, secretStore });
    expect(secretStore.detect).toHaveBeenCalled();
    expect(result.state.completedSteps).toContain('secret-backend-selection');
  });

  it('stores auto-generated operator token when user leaves it blank', async () => {
    const io = makeIO([
      'y',      // Enable Chat?
      'y',      // Enable Dashboard?
      'n',      // Enable Comms?
      'claude', // Default provider
      'secure', // Security mode
      '',       // Operator token blank → auto-generate
    ]);
    const secretStore = makeSecretStore({ available: true });
    const state = createEmptyInitState('/tmp/test-config.json');
    await runInitWizard({ io, initialState: state, secretStore });
    // Should have stored operator token
    expect(secretStore.stored.has('network.operatorTokenRef')).toBe(true);
    const storedToken = secretStore.stored.get('network.operatorTokenRef');
    // Should be a 64-char hex string (32 bytes)
    expect(storedToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it('stores provided operator token when user supplies one', async () => {
    const io = makeIO([
      'y',      // Enable Chat?
      'y',      // Enable Dashboard?
      'n',      // Enable Comms?
      'claude', // Default provider
      'secure', // Security mode
      'my-secret-op-token', // Operator token explicitly provided
    ]);
    const secretStore = makeSecretStore({ available: true });
    const state = createEmptyInitState('/tmp/test-config.json');
    const result = await runInitWizard({ io, initialState: state, secretStore });
    expect(secretStore.stored.get('network.operatorTokenRef')).toBe('my-secret-op-token');
    expect(result.config.network.operatorTokenRef).toBe('network.operatorTokenRef');
  });

  it('sets operatorTokenRef in config to logical key after storing', async () => {
    const io = makeIO([
      'y', 'y', 'n', 'claude', 'secure', '',
    ]);
    const secretStore = makeSecretStore({ available: true });
    const state = createEmptyInitState('/tmp/test-config.json');
    const result = await runInitWizard({ io, initialState: state, secretStore });
    expect(result.config.network.operatorTokenRef).toBe('network.operatorTokenRef');
  });
});

describe('runInitWizard – with secretStore and Slack enabled', () => {
  it('prompts for raw Slack secrets and stores them', async () => {
    const io = makeIO([
      'y',            // Enable Chat?
      'y',            // Enable Dashboard?
      'y',            // Enable Comms?
      'claude',       // Default provider
      'secure',       // Security mode
      'y',            // Enable Slack?
      'A001TEST',     // Slack app ID
      'xoxb-abc',     // Slack bot token (raw value)
      'signsecret',   // Slack signing secret (raw value)
      'n',            // Enable Discord?
      '',             // Operator token (blank → auto)
    ]);
    const secretStore = makeSecretStore({ available: true });
    const state = createEmptyInitState('/tmp/test-config.json');
    const result = await runInitWizard({ io, initialState: state, secretStore });
    // Raw values stored in secret store
    expect(secretStore.stored.get('comms.slack.botTokenRef')).toBe('xoxb-abc');
    expect(secretStore.stored.get('comms.slack.signingSecretRef')).toBe('signsecret');
    // Config refs point to logical keys
    expect(result.config.comms.slack.botTokenRef).toBe('comms.slack.botTokenRef');
    expect(result.config.comms.slack.signingSecretRef).toBe('comms.slack.signingSecretRef');
  });
});

describe('runInitWizard – with secretStore and Discord enabled', () => {
  it('prompts for raw Discord secrets and stores them', async () => {
    const io = makeIO([
      'y',               // Enable Chat?
      'y',               // Enable Dashboard?
      'y',               // Enable Comms?
      'claude',          // Default provider
      'secure',          // Security mode
      'n',               // Enable Slack?
      'y',               // Enable Discord?
      '1234567890',      // Discord application ID
      'discord-bot-tok', // Discord bot token (raw value)
      'pubkey-abc',      // Discord public key (raw value)
      '',                // Operator token (blank → auto)
    ]);
    const secretStore = makeSecretStore({ available: true });
    const state = createEmptyInitState('/tmp/test-config.json');
    const result = await runInitWizard({ io, initialState: state, secretStore });
    expect(secretStore.stored.get('comms.discord.botTokenRef')).toBe('discord-bot-tok');
    // publicKeyRef is NOT sensitive — stored directly in config, not in secret store
    expect(secretStore.stored.has('comms.discord.publicKeyRef')).toBe(false);
    expect(result.config.comms.discord.botTokenRef).toBe('comms.discord.botTokenRef');
    expect(result.config.comms.discord.publicKeyRef).toBe('pubkey-abc');
  });
});

describe('runInitWizard – scope: secret-backend only', () => {
  it('runs only backend detection when scope is restricted to secret-backend', async () => {
    // With scope=['secret-backend'], no module/provider/security questions should be asked
    const io = makeIO([]);
    const secretStore = makeSecretStore({ available: true });
    const state = createEmptyInitState('/tmp/test-config.json');
    const result = await runInitWizard({
      io,
      initialState: state,
      secretStore,
      scope: ['secret-backend'],
    });
    expect(secretStore.detect).toHaveBeenCalled();
    expect(result.state.completedSteps).toContain('secret-backend-selection');
    // io.ask should never have been called (no interactive prompts)
    expect(io.ask).not.toHaveBeenCalled();
  });
});
