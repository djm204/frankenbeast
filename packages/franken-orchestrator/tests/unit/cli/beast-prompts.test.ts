import { describe, expect, it, vi } from 'vitest';
import { collectBeastConfig } from '../../../src/cli/beast-prompts.js';
import { martinLoopDefinition } from '../../../src/beasts/definitions/martin-loop-definition.js';
import { chunkPlanDefinition } from '../../../src/beasts/definitions/chunk-plan-definition.js';

describe('collectBeastConfig', () => {
  it('asks prompts in definition order and returns config answers', async () => {
    const io = {
      ask: vi.fn()
        .mockResolvedValueOnce('claude')
        .mockResolvedValueOnce('Implement the dispatch panel')
        .mockResolvedValueOnce('docs/chunks'),
      display: vi.fn(),
    };

    const config = await collectBeastConfig(io, martinLoopDefinition);

    expect(io.ask).toHaveBeenCalledTimes(3);
    expect(config).toEqual({
      provider: 'claude',
      objective: 'Implement the dispatch panel',
      chunkDirectory: 'docs/chunks',
    });
  });

  it('rejects answers outside prompt options before schema parsing', async () => {
    const io = {
      ask: vi.fn().mockResolvedValue('not-a-provider'),
      display: vi.fn(),
    };

    await expect(collectBeastConfig(io, martinLoopDefinition)).rejects.toThrow(
      "Invalid answer for 'provider': expected one of claude, codex, gemini, aider",
    );
    expect(io.ask).toHaveBeenCalledTimes(1);
  });

  it('displays accessible file guidance before asking for a design document path', async () => {
    const io = {
      ask: vi.fn()
        .mockResolvedValueOnce('docs/design.md')
        .mockResolvedValueOnce('tasks/chunks'),
      display: vi.fn(),
    };

    await collectBeastConfig(io, chunkPlanDefinition);

    expect(io.display).toHaveBeenCalledWith(
      'Enter a repo-relative path to the Markdown design document (.md, .mdx, or .markdown) that will be split into implementation chunks.',
    );
    expect(io.display.mock.invocationCallOrder[0]).toBeLessThan(io.ask.mock.invocationCallOrder[0]);
  });
});
