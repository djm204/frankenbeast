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

  it('prunes transcript to keep only objective and last 3 turns', () => {
    const renderer = new ChunkSessionRenderer();
    const session = {
      ...createChunkSession({
        planName: 'demo-plan',
        taskId: 'impl:01_demo',
        chunkId: '01_demo',
        promiseTag: 'IMPL_01_demo_DONE',
        workingDir: '/tmp/demo',
        provider: 'codex',
        maxTokens: 128000,
      }),
      transcript: [
        { kind: 'objective' as const, content: 'Original Objective', createdAt: '2026-03-10T10:00:00Z' },
        { kind: 'assistant' as const, content: 'Turn 1', createdAt: '2026-03-10T10:01:00Z' },
        { kind: 'assistant' as const, content: 'Turn 2', createdAt: '2026-03-10T10:02:00Z' },
        { kind: 'assistant' as const, content: 'Turn 3', createdAt: '2026-03-10T10:03:00Z' },
        { kind: 'assistant' as const, content: 'Turn 4', createdAt: '2026-03-10T10:04:00Z' },
        { kind: 'assistant' as const, content: 'Turn 5', createdAt: '2026-03-10T10:05:00Z' },
      ],
    };

    const rendered = renderer.render(session, new CodexProvider());
    expect(rendered.prompt).toContain('Original Objective');
    expect(rendered.prompt).not.toContain('Turn 1');
    expect(rendered.prompt).not.toContain('Turn 2');
    expect(rendered.prompt).toContain('Turn 3');
    expect(rendered.prompt).toContain('Turn 4');
    expect(rendered.prompt).toContain('Turn 5');
    expect(rendered.prompt).toContain('<promise>IMPL_01_demo_DONE</promise>');
  });
});
