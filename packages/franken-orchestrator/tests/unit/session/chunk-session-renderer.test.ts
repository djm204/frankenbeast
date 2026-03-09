import { describe, it, expect } from 'vitest';
import { ChunkSessionRenderer } from '../../../src/session/chunk-session-renderer.js';
import { ClaudeProvider } from '../../../src/skills/providers/claude-provider.js';
import { CodexProvider } from '../../../src/skills/providers/codex-provider.js';
import { createChunkSession } from '../../../src/session/chunk-session.js';

describe('ChunkSessionRenderer', () => {
  it('replays canonical session state for providers without native resume', () => {
    const renderer = new ChunkSessionRenderer();
    const session = createChunkSession({
      planName: 'demo-plan',
      taskId: 'impl:01_demo',
      chunkId: '01_demo',
      promiseTag: 'IMPL_01_demo_DONE',
      workingDir: '/tmp/demo',
      provider: 'codex',
      maxTokens: 128000,
    });

    const rendered = renderer.render(session, new CodexProvider());
    expect(rendered.prompt).toContain('IMPL_01_demo_DONE');
    expect(rendered.sessionContinue).toBe(false);
  });

  it('enables native continuation only when provider supports it and did not switch', () => {
    const renderer = new ChunkSessionRenderer();
    const session = {
      ...createChunkSession({
        planName: 'demo-plan',
        taskId: 'impl:01_demo',
        chunkId: '01_demo',
        promiseTag: 'IMPL_01_demo_DONE',
        workingDir: '/tmp/demo',
        provider: 'claude',
        maxTokens: 200000,
      }),
      activeProvider: 'claude',
      iterations: 2,
    };

    const rendered = renderer.render(session, new ClaudeProvider());
    expect(rendered.sessionContinue).toBe(true);
  });
});
