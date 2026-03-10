import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createInterface, type Interface } from 'node:readline';
import type { OrchestratorConfig } from '../config/orchestrator-config.js';
import { sanitizeChatOutput } from '../chat/output-sanitizer.js';

interface ManagedNetworkState {
  services?: Array<{
    id?: string;
    url?: string;
  }>;
}

export interface ManagedChatAttachment {
  baseUrl: string;
  wsUrl: string;
}

export interface ResolveManagedChatAttachmentOptions {
  config: OrchestratorConfig;
  frankenbeastDir: string;
  fetchImpl?: typeof fetch;
}

async function loadNetworkState(frankenbeastDir: string): Promise<ManagedNetworkState | undefined> {
  try {
    const raw = await readFile(join(frankenbeastDir, 'network', 'state.json'), 'utf-8');
    return JSON.parse(raw) as ManagedNetworkState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

export async function resolveManagedChatAttachment(
  options: ResolveManagedChatAttachmentOptions,
): Promise<ManagedChatAttachment | undefined> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const state = await loadNetworkState(options.frankenbeastDir);
  const stateUrl = state?.services?.find((service) => service.id === 'chat-server')?.url;
  const baseUrl = stateUrl ?? `http://${options.config.chat.host}:${options.config.chat.port}`;
  const healthResponse = await fetchImpl(`${baseUrl}/health`);
  if (!healthResponse.ok) {
    return undefined;
  }

  return {
    baseUrl,
    wsUrl: baseUrl.replace(/^http/, 'ws') + '/v1/chat/ws',
  };
}

interface RemoteChatSession {
  sessionId: string;
  token: string;
  socket: WebSocket;
}

async function createRemoteSession(target: ManagedChatAttachment, projectId: string): Promise<RemoteChatSession> {
  const createResponse = await fetch(`${target.baseUrl}/v1/chat/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId }),
  });
  if (!createResponse.ok) {
    throw new Error(`Failed to create remote chat session (${createResponse.status})`);
  }

  const body = await createResponse.json() as {
    data: {
      id: string;
      socketToken: string;
    };
  };
  const socket = new WebSocket(`${target.wsUrl}?sessionId=${body.data.id}&token=${body.data.socketToken}`);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', () => reject(new Error('Managed chat websocket failed to connect')), { once: true });
  });

  await new Promise<void>((resolve) => {
    const onMessage = (event: MessageEvent<string>) => {
      const payload = JSON.parse(event.data) as { type?: string };
      if (payload.type === 'session.ready') {
        socket.removeEventListener('message', onMessage);
        resolve();
      }
    };
    socket.addEventListener('message', onMessage);
  });

  return {
    sessionId: body.data.id,
    token: body.data.socketToken,
    socket,
  };
}

function createIo(): {
  prompt(): Promise<string>;
  print(message: string): void;
  close(): void;
} {
  const rl: Interface = createInterface({ input: process.stdin, output: process.stdout });
  return {
    prompt: () => new Promise((resolve) => rl.question('> ', resolve)),
    print: (message: string) => console.log(message),
    close: () => rl.close(),
  };
}

async function awaitRemoteReply(socket: WebSocket, verbose: boolean): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let streamed = false;
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for managed chat reply'));
    }, 30_000);

    const cleanup = (): void => {
      clearTimeout(timeout);
      socket.removeEventListener('message', onMessage);
      socket.removeEventListener('error', onError);
    };

    const onError = (): void => {
      cleanup();
      reject(new Error('Managed chat websocket error'));
    };

    const onMessage = (event: MessageEvent<string>): void => {
      const payload = JSON.parse(event.data) as Record<string, unknown>;
      switch (payload.type) {
        case 'assistant.message.delta':
          process.stdout.write(String(payload.chunk ?? ''));
          streamed = true;
          break;
        case 'assistant.message.complete':
          if (streamed) {
            process.stdout.write('\n');
          } else {
            console.log(sanitizeChatOutput(String(payload.content ?? '')));
          }
          if (verbose && payload.modelTier) {
            console.log(`  [${String(payload.modelTier)}]`);
          }
          cleanup();
          resolve();
          break;
        case 'turn.approval.requested':
          console.log(String(payload.description ?? 'approval required'));
          cleanup();
          resolve();
          break;
        case 'turn.execution.progress':
          console.log(String((payload.data as { summary?: string } | undefined)?.summary ?? 'Executing...'));
          break;
        default:
          break;
      }
    };

    socket.addEventListener('message', onMessage);
    socket.addEventListener('error', onError, { once: true });
  });
}

export async function runManagedChatRepl(options: {
  attachment: ManagedChatAttachment;
  projectId: string;
  verbose?: boolean;
}): Promise<void> {
  const io = createIo();
  const session = await createRemoteSession(options.attachment, options.projectId);
  const verbose = options.verbose ?? false;

  io.print('\nfrankenbeast chat — attached to managed network (/quit to exit)\n');

  try {
    for (;;) {
      const input = (await io.prompt()).trim();
      if (!input) {
        continue;
      }
      if (input === '/quit') {
        break;
      }

      if (input === '/approve') {
        session.socket.send(JSON.stringify({ type: 'approval.respond', approved: true }));
        await awaitRemoteReply(session.socket, verbose);
        continue;
      }

      session.socket.send(JSON.stringify({
        type: 'message.send',
        clientMessageId: randomUUID(),
        content: input,
      }));
      await awaitRemoteReply(session.socket, verbose);
    }
  } finally {
    session.socket.close();
    io.close();
  }
}
