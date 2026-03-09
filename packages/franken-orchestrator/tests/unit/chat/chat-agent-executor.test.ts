import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatAgentExecutor } from '../../../src/chat/chat-agent-executor.js';
import type { ExecutionResult } from '../../../src/chat/turn-runner.js';

describe('ChatAgentExecutor', () => {
  const mockComplete = vi.fn<[string], Promise<string>>();
  const mockLlm = { complete: mockComplete };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls LLM complete with user input and returns success', async () => {
    mockComplete.mockResolvedValueOnce('Created the file successfully');

    const executor = new ChatAgentExecutor({ llm: mockLlm });
    const result: ExecutionResult = await executor.execute({ userInput: 'create a hello.ts file' });

    expect(mockComplete).toHaveBeenCalledWith('create a hello.ts file');
    expect(result.status).toBe('success');
    expect(result.summary).toBe('Created the file successfully');
  });

  it('returns failed status when LLM throws', async () => {
    mockComplete.mockRejectedValueOnce(new Error('rate limited'));

    const executor = new ChatAgentExecutor({ llm: mockLlm });
    const result = await executor.execute({ userInput: 'do something' });

    expect(result.status).toBe('failed');
    expect(result.summary).toContain('rate limited');
    expect(result.errors).toContain('rate limited');
  });

  it('calls onProgress callback when provided', async () => {
    mockComplete.mockResolvedValueOnce('Done');
    const onProgress = vi.fn();

    const executor = new ChatAgentExecutor({ llm: mockLlm, onProgress });
    await executor.execute({ userInput: 'fix bug' });

    expect(onProgress).toHaveBeenCalledWith('Spawning agent...');
  });
});
