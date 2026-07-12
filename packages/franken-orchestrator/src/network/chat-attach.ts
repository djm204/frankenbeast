import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface, type Interface } from 'node:readline';
import type { OrchestratorConfig } from '../config/orchestrator-config.js';
import { sanitizeChatOutput } from '../chat/output-sanitizer.js';
import {
  CHAT_SOCKET_PROTOCOL,
  CHAT_SOCKET_TOKEN_PROTOCOL_PREFIX,
} from '../http/ws-chat-server.js';
import { deterministicUuid } from '@franken/types';
import { assertLocalPlaintextOrSecureHttpUrl, localPlaintextOrSecureEndpoint } from './network-url.js';


function printLine(...args: unknown[]): void {
  console.info(...args);
}
interface ManagedNetworkState {
  services?: Array<{
    id?: string;
    url?: string;
  }>;
}

export interface ManagedChatAttachment {
  baseUrl: string;
  wsUrl: string;
  /** Operator token to present on /v1/chat/* HTTP requests (Authorization: Bearer). */
  operatorToken?: string;
}

export interface ResolveManagedChatAttachmentOptions {
  config: OrchestratorConfig;
  frankenbeastDir: string;
  /** Operator token resolved by the caller (e.g. from FRANKENBEAST_BEAST_OPERATOR_TOKEN). */
  operatorToken?: string;
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
  const baseUrl = stateUrl
    ? assertLocalPlaintextOrSecureHttpUrl(stateUrl, 'Persisted chat-server URL')
    : localPlaintextOrSecureEndpoint(options.config.chat.host, options.config.chat.port);
  const healthResponse = await fetchImpl(`${baseUrl}/health`);
  if (!healthResponse.ok) {
    return undefined;
  }

  return {
    baseUrl,
    wsUrl: baseUrl.replace(/^http/, 'ws') + '/v1/chat/ws',
    ...(options.operatorToken ? { operatorToken: options.operatorToken } : {}),
  };
}

interface RemoteChatSession {
  sessionId: string;
  socket: WebSocket;
}

const REMOTE_CHAT_TIMEOUT_MS = 30_000;

function parseManagedChatMessage(data: string, phase: string): Record<string, unknown> {
  try {
    const payload = JSON.parse(data) as unknown;
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      return payload as Record<string, unknown>;
    }
  } catch {
    // Fall through to the uniform managed-chat diagnostic below.
  }
  throw new Error(`Invalid managed chat websocket message during ${phase}`);
}

async function createRemoteSession(target: ManagedChatAttachment, projectId: string): Promise<RemoteChatSession> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (target.operatorToken) {
    headers['authorization'] = `Bearer ${target.operatorToken}`;
  }
  const createResponse = await fetch(`${target.baseUrl}/v1/chat/sessions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ projectId }),
  });
  if (!createResponse.ok) {
    throw new Error(`Failed to create remote chat session (${createResponse.status})`);
  }

  const body = await createResponse.json() as {
    data: {
      id: string;
    };
  };

  const ticketResponse = await fetch(`${target.baseUrl}/v1/chat/sessions/${encodeURIComponent(body.data.id)}/socket-ticket`, {
    method: 'POST',
    headers,
  });
  if (!ticketResponse.ok) {
    throw new Error(`Failed to mint remote chat websocket ticket (${ticketResponse.status})`);
  }
  const ticketBody = await ticketResponse.json() as {
    data: {
      ticket: string;
    };
  };

  const socket = new WebSocket(
    `${target.wsUrl}?sessionId=${encodeURIComponent(body.data.id)}`,
    [CHAT_SOCKET_PROTOCOL, `${CHAT_SOCKET_TOKEN_PROTOCOL_PREFIX}${ticketBody.data.ticket}`],
  );
  await new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      socket.removeEventListener('open', onOpen);
      socket.removeEventListener('error', onError);
    };
    const onOpen = (): void => {
      cleanup();
      resolve();
    };
    const onError = (): void => {
      cleanup();
      reject(new Error('Managed chat websocket failed to connect'));
    };
    socket.addEventListener('open', onOpen, { once: true });
    socket.addEventListener('error', onError, { once: true });
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      socket.close();
      reject(new Error('Timed out waiting for managed chat session readiness'));
    }, REMOTE_CHAT_TIMEOUT_MS);

    const cleanup = (): void => {
      clearTimeout(timeout);
      socket.removeEventListener('message', onMessage);
      socket.removeEventListener('error', onError);
    };

    const onError = (): void => {
      cleanup();
      reject(new Error('Managed chat websocket error while waiting for session readiness'));
    };

    const onMessage = (event: MessageEvent<string>) => {
      let payload: Record<string, unknown>;
      try {
        payload = parseManagedChatMessage(event.data, 'session readiness');
      } catch (error) {
        cleanup();
        socket.close();
        reject(error);
        return;
      }
      if (payload.type === 'session.ready') {
        cleanup();
        resolve();
      }
    };
    socket.addEventListener('message', onMessage);
    socket.addEventListener('error', onError, { once: true });
  });

  return {
    sessionId: body.data.id,
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
    print: (message: string) => printLine(message),
    close: () => rl.close(),
  };
}

async function awaitRemoteReply(socket: WebSocket, verbose: boolean): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let streamed = false;
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for managed chat reply'));
    }, REMOTE_CHAT_TIMEOUT_MS);

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
      let payload: Record<string, unknown>;
      try {
        payload = parseManagedChatMessage(event.data, 'reply handling');
      } catch (error) {
        cleanup();
        reject(error);
        return;
      }
      switch (payload.type) {
        case 'assistant.message.delta':
          process.stdout.write(String(payload.chunk ?? ''));
          streamed = true;
          break;
        case 'assistant.message.complete':
          if (streamed) {
            process.stdout.write('\n');
          } else {
            printLine(sanitizeChatOutput(String(payload.content ?? '')));
          }
          if (verbose && payload.modelTier) {
            printLine(`  [${String(payload.modelTier)}]`);
          }
          cleanup();
          resolve();
          break;
        case 'turn.approval.requested':
          printLine(String(payload.description ?? 'approval required'));
          cleanup();
          resolve();
          break;
        case 'turn.error':
          printLine(String(payload.message ?? payload.error ?? 'Chat request failed'));
          cleanup();
          resolve();
          break;
        case 'turn.execution.progress':
          printLine(String((payload.data as { summary?: string } | undefined)?.summary ?? 'Executing...'));
          break;
        default:
          break;
      }
    };

    socket.addEventListener('message', onMessage);
    socket.addEventListener('error', onError, { once: true });
  });
}

function sendManagedChatInput(socket: WebSocket, input: string): void {
  if (input === '/approve' || input === '/reject') {
    socket.send(JSON.stringify({ type: 'approval.respond', approved: input === '/approve' }));
    return;
  }

  socket.send(JSON.stringify({
    type: 'message.send',
    clientMessageId: deterministicUuid('packages/franken-orchestrator/src/network/chat-attach.ts'),
    content: input,
  }));
}

export const __chatAttachTestHooks = {
  awaitRemoteReply,
  createRemoteSession,
  parseManagedChatMessage,
  sendManagedChatInput,
};

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

      sendManagedChatInput(session.socket, input);
      await awaitRemoteReply(session.socket, verbose);
    }
  } finally {
    session.socket.close();
    io.close();
  }
}
