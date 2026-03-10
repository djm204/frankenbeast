import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { defaultConfig } from '../../../src/config/orchestrator-config.js';
import { resolveManagedChatAttachment } from '../../../src/network/chat-attach.js';

describe('resolveManagedChatAttachment', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('attaches to managed chat when the managed service is healthy', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-chat-attach-'));
    const frankenbeastDir = join(workDir, '.frankenbeast');
    await mkdir(join(frankenbeastDir, 'network'), { recursive: true });

    await writeFile(join(frankenbeastDir, 'network', 'state.json'), JSON.stringify({
      mode: 'secure',
      secureBackend: 'local-encrypted',
      detached: true,
      startedAt: '2026-03-09T00:00:00.000Z',
      services: [
        {
          id: 'chat-server',
          pid: 100,
          dependsOn: [],
          startedAt: '2026-03-09T00:00:00.000Z',
          url: 'http://127.0.0.1:4242',
        },
      ],
    }));

    const attachment = await resolveManagedChatAttachment({
      config: defaultConfig(),
      frankenbeastDir,
      fetchImpl: async (input) => {
        expect(String(input)).toBe('http://127.0.0.1:4242/health');
        return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
      },
    });

    expect(attachment).toEqual({
      baseUrl: 'http://127.0.0.1:4242',
      wsUrl: 'ws://127.0.0.1:4242/v1/chat/ws',
    });
  });

  it('falls back to standalone chat when the managed service is not healthy', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-chat-attach-'));

    const attachment = await resolveManagedChatAttachment({
      config: defaultConfig(),
      frankenbeastDir: join(workDir, '.frankenbeast'),
      fetchImpl: async () => new Response('down', { status: 503 }),
    });

    expect(attachment).toBeUndefined();
  });

  it('ignores stale detached state when healthcheck fails', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-chat-attach-'));
    const frankenbeastDir = join(workDir, '.frankenbeast');
    await mkdir(join(frankenbeastDir, 'network'), { recursive: true });
    await writeFile(join(frankenbeastDir, 'network', 'state.json'), JSON.stringify({
      mode: 'secure',
      secureBackend: 'local-encrypted',
      detached: true,
      startedAt: '2026-03-09T00:00:00.000Z',
      services: [
        {
          id: 'chat-server',
          pid: 100,
          dependsOn: [],
          startedAt: '2026-03-09T00:00:00.000Z',
          url: 'http://127.0.0.1:4242',
        },
      ],
    }));

    const attachment = await resolveManagedChatAttachment({
      config: defaultConfig(),
      frankenbeastDir,
      fetchImpl: async () => new Response('down', { status: 503 }),
    });

    expect(attachment).toBeUndefined();
  });
});
