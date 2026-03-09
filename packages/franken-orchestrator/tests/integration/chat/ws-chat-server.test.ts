import { describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConversationEngine } from '../../../src/chat/conversation-engine.js';
import { FileSessionStore } from '../../../src/chat/session-store.js';
import { TurnRunner } from '../../../src/chat/turn-runner.js';
import { ChatRuntime } from '../../../src/chat/runtime.js';
import {
  ChatSocketController,
} from '../../../src/http/ws-chat-server.js';
import {
  createSessionTokenSecret,
  issueSessionToken,
} from '../../../src/http/ws-chat-auth.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TMP = join(__dirname, '__fixtures__/ws-chat');

function createPeer() {
  const sent: string[] = [];
  return {
    peer: {
      close: vi.fn(),
      send: (data: string) => sent.push(data),
    },
    sent,
  };
}

describe('ws chat server', () => {
  it('emits typing, delta, and complete events for a reply turn', async () => {
    mkdirSync(TMP, { recursive: true });
    const store = new FileSessionStore(TMP);
    const session = store.create('proj');
    const secret = createSessionTokenSecret();
    const token = issueSessionToken({ secret, sessionId: session.id });
    const runtime = new ChatRuntime({
      engine: new ConversationEngine({
        llm: { complete: vi.fn().mockResolvedValue('Working on it right now.') },
        projectName: 'proj',
      }),
      turnRunner: new TurnRunner({
        execute: vi.fn().mockResolvedValue({
          status: 'success',
          summary: 'Done',
          filesChanged: [],
          testsRun: 0,
          errors: [],
        }),
      }),
    });
    const controller = new ChatSocketController({
      runtime,
      sessionStore: store,
      tokenSecret: secret,
    });
    const { peer, sent } = createPeer();

    const connect = controller.connect(peer, {
      origin: null,
      sessionId: session.id,
      token,
    });
    expect(connect.ok).toBe(true);

    await controller.receive(peer, JSON.stringify({
      type: 'message.send',
      clientMessageId: 'client-1',
      content: 'Explain the routing logic',
    }));

    const events = sent.map((raw) => JSON.parse(raw) as { type: string });
    expect(events.map((event) => event.type)).toContain('assistant.typing.start');
    expect(events.map((event) => event.type)).toContain('assistant.message.delta');
    expect(events.map((event) => event.type)).toContain('assistant.message.complete');

    rmSync(TMP, { recursive: true, force: true });
  });
});
