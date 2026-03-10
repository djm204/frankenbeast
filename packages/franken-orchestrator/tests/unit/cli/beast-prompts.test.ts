import { describe, expect, it, vi } from 'vitest';
import { collectBeastConfig } from '../../../src/cli/beast-prompts.js';
import { martinLoopDefinition } from '../../../src/beasts/definitions/martin-loop-definition.js';

describe('collectBeastConfig', () => {
  it('asks prompts in definition order and returns config answers', async () => {
    const io = {
      ask: vi.fn()
        .mockResolvedValueOnce('claude')
        .mockResolvedValueOnce('Implement the dispatch panel'),
      display: vi.fn(),
    };

    const config = await collectBeastConfig(io, martinLoopDefinition);

    expect(io.ask).toHaveBeenCalledTimes(2);
    expect(config).toEqual({
      provider: 'claude',
      objective: 'Implement the dispatch panel',
    });
  });
});
