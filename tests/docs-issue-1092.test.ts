import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readDoc = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

describe('issue #1092 adapter status documentation', () => {
  it('documents the historical GeminiAdapter and MistralAdapter status', () => {
    const providerGuide = readDoc('docs/guides/add-llm-provider.md');
    const historicalIssue = readDoc('docs/issues/011-firewall-exports-unimplemented-adapters.md');

    for (const doc of [providerGuide, historicalIssue]) {
      expect(doc).toContain('GeminiAdapter');
      expect(doc).toContain('MistralAdapter');
      expect(doc).toContain('unimplemented');
      expect(doc).toContain('not supported');
    }

    expect(providerGuide).toContain('`GeminiProvider` is the supported Gemini CLI provider');
    expect(providerGuide).toContain('There is no supported Mistral provider');
    expect(historicalIssue).toContain('**Current status (2026-07)**');
  });
});
