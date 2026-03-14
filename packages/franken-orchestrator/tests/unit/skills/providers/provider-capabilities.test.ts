import { describe, expect, it } from 'vitest';
import { AiderProvider } from '../../../../src/skills/providers/aider-provider.js';
import { ClaudeProvider } from '../../../../src/skills/providers/claude-provider.js';
import { CodexProvider } from '../../../../src/skills/providers/codex-provider.js';
import { GeminiProvider } from '../../../../src/skills/providers/gemini-provider.js';
import { resolveProviderCacheCapabilities } from '../../../../src/skills/providers/cli-provider.js';

describe('provider cache capabilities', () => {
  it('reports explicit native session capabilities for Claude', () => {
    const capabilities = resolveProviderCacheCapabilities(new ClaudeProvider());
    expect(capabilities).toMatchObject({
      nativeWorkSessions: true,
      persistentAcrossProcesses: true,
      promptReuse: 'native',
    });
  });

  it('reports managed-fallback-only capabilities for non-native providers', () => {
    expect(resolveProviderCacheCapabilities(new CodexProvider())).toMatchObject({
      nativeWorkSessions: false,
      persistentAcrossProcesses: false,
      promptReuse: 'managed',
    });
    expect(resolveProviderCacheCapabilities(new GeminiProvider())).toMatchObject({
      nativeWorkSessions: false,
      persistentAcrossProcesses: false,
      promptReuse: 'managed',
    });
    expect(resolveProviderCacheCapabilities(new AiderProvider())).toMatchObject({
      nativeWorkSessions: false,
      persistentAcrossProcesses: false,
      promptReuse: 'managed',
    });
  });
});
