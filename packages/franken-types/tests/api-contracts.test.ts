import { describe, expect, it } from 'vitest';
import {
  ChatSocketTicketResponseSchema,
  ChatSessionResponseSchema,
  MessageResultSchema,
  MODULE_CONFIG_KEYS,
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
});
