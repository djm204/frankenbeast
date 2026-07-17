import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SseConnectionTicketStore } from '../../../src/beasts/events/sse-connection-ticket.js';
import { createChatApp } from '../../../src/http/chat-app.js';
import type { DashboardRouteDeps } from '../../../src/http/routes/dashboard-routes.js';
import type { SkillManager } from '../../../src/skills/skill-manager.js';
import { testCredential } from '../../support/test-credentials.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TMP = join(__dirname, '__fixtures__/dashboard-chat-app-auth');
const TEST_OPERATOR_TOKEN = testCredential('TEST_DASHBOARD_CHAT_APP_OPERATOR_TOKEN');
let ticketStore: SseConnectionTicketStore | undefined;

function createDashboardDeps(): DashboardRouteDeps {
  return {
    skillManager: {
      listInstalled: vi.fn().mockReturnValue([]),
      getEnabledSkills: vi.fn().mockReturnValue([]),
    } as unknown as SkillManager,
    getSecurityConfig: vi.fn().mockReturnValue({
      profile: 'standard',
      injectionDetection: true,
      piiMasking: true,
      outputValidation: true,
    }),
    getProviders: vi.fn().mockReturnValue([]),
    ticketStore: ticketStore = new SseConnectionTicketStore(),
  };
}

function createProtectedDashboardApp() {
  mkdirSync(TMP, { recursive: true });
  return createChatApp({
    sessionStoreDir: join(TMP, 'chat'),
    llm: { complete: vi.fn().mockResolvedValue('hello') },
    projectName: 'dashboard-auth-test-project',
    operatorToken: TEST_OPERATOR_TOKEN,
    dashboardDeps: createDashboardDeps(),
  });
}

describe('dashboard SSE auth through createChatApp', () => {
  afterEach(() => {
    ticketStore?.destroy();
    ticketStore = undefined;
    rmSync(TMP, { recursive: true, force: true });
  });

  it('rejects a bare protected EventSource request and accepts a one-shot ticketed stream', async () => {
    const app = createProtectedDashboardApp();

    const bareStream = await app.request('/api/dashboard/events');
    expect(bareStream.status).toBe(401);

    const unauthenticatedTicket = await app.request('/api/dashboard/events/ticket', { method: 'POST' });
    expect(unauthenticatedTicket.status).toBe(401);

    const ticketResponse = await app.request('/api/dashboard/events/ticket', {
      method: 'POST',
      headers: { Authorization: `Bearer ${TEST_OPERATOR_TOKEN}` },
    });
    expect(ticketResponse.status).toBe(200);
    const { ticket } = await ticketResponse.json() as { ticket?: string };
    expect(ticket).toBeTruthy();

    const ticketedStream = await app.request(`/api/dashboard/events?ticket=${ticket}`);
    expect(ticketedStream.status).toBe(200);
    expect(ticketedStream.headers.get('content-type')).toContain('text/event-stream');
    await ticketedStream.body?.cancel();
  });
});
