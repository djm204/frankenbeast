import { describe, expect, it } from 'vitest';
import {
  ChatSocketTicketResponseSchema,
  ChatSessionResponseSchema,
  MessageResultSchema,
  MODULE_CONFIG_KEYS,
  ProviderContextSchema,
  type ApiDataEnvelope,
  type NetworkStatusResponse,
} from '../src/api-contracts.js';

describe('web/API contracts', () => {
  it('validates chat session DTOs consumed by the web client', () => {
    const session = ChatSessionResponseSchema.parse({
      id: 'sess-1',
      projectId: 'proj-1',
      transcript: [{ role: 'user', content: 'hello', timestamp: '2026-03-09T00:00:00.000Z' }],
      state: 'active',
      tokenTotals: { cheap: 1, premiumReasoning: 0, premiumExecution: 0 },
      costUsd: 0.01,
      createdAt: '2026-03-09T00:00:00.000Z',
      updatedAt: '2026-03-09T00:00:01.000Z',
    });

    expect('socketToken' in session).toBe(false);
    expect(session.transcript[0]?.role).toBe('user');
  });

  it('validates websocket ticket DTOs separately from session snapshots', () => {
    const ticket = ChatSocketTicketResponseSchema.parse({ ticket: 'socket-ticket' });
    expect(ticket.ticket).toBe('socket-ticket');
  });

  it('validates chat turn result DTOs', () => {
    const result = MessageResultSchema.parse({
      outcome: { kind: 'execute', taskDescription: 'Run tests', approvalRequired: true },
      tier: 'premium_execution',
      state: 'pending_approval',
    });

    expect(result.outcome.kind).toBe('execute');
  });

  it('exposes envelope and network DTOs for route clients', () => {
    const envelope: ApiDataEnvelope<NetworkStatusResponse> = {
      data: {
        mode: 'local',
        services: [{ id: 'chat-server', status: 'started', url: 'http://127.0.0.1:3737' }],
      },
    };

    expect(envelope.data.services[0]?.id).toBe('chat-server');
    expect(MODULE_CONFIG_KEYS).toContain('planner');
  });

  it('validates provider context DTOs, including an in-progress fallback', () => {
    const noFallback = ProviderContextSchema.parse({ provider: 'claude' });
    expect(noFallback.switchedFrom).toBeUndefined();

    const withFallback = ProviderContextSchema.parse({
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      switchedFrom: 'codex',
      switchReason: 'rate_limited',
    });
    expect(withFallback.switchedFrom).toBe('codex');
  });

  it('rejects a provider context missing the required provider field', () => {
    expect(() => ProviderContextSchema.parse({ model: 'claude-sonnet-4-6' })).toThrow();
  });

  it('accepts chat sessions carrying a persisted providerContext', () => {
    const session = ChatSessionResponseSchema.parse({
      id: 'sess-1',
      projectId: 'proj-1',
      transcript: [],
      state: 'active',
      providerContext: { provider: 'claude', switchedFrom: 'codex', switchReason: 'rate_limited' },
      tokenTotals: { cheap: 0, premiumReasoning: 0, premiumExecution: 0 },
      costUsd: 0,
      createdAt: '2026-03-09T00:00:00.000Z',
      updatedAt: '2026-03-09T00:00:01.000Z',
    });

    expect(session.providerContext?.switchedFrom).toBe('codex');
  });
});
