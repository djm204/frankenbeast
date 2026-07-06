import { describe, expect, it } from 'vitest';
import { ToolCallEvidenceManifestSchema, serializeToolCallEvidence } from '../src/evidence/tool-call-evidence.js';

describe('tool-call evidence contract', () => {
  it('validates the normalized evidence artifact shape', () => {
    const evidence = ToolCallEvidenceManifestSchema.parse([
      {
        id: 'call-1',
        tool: 'write_file',
        params: { path: 'README.md' },
        source: 'mcp-proxy',
        startedAt: '2026-01-02T03:04:05.000Z',
        completedAt: '2026-01-02T03:04:06.000Z',
        ok: true,
      },
    ]);

    expect(evidence[0]?.tool).toBe('write_file');
  });

  it('rejects non-normalized evidence with missing params or unknown fields', () => {
    expect(() => ToolCallEvidenceManifestSchema.parse([{ id: 'call-1', tool: 'write_file', source: 'adapter' }])).toThrow();
    expect(() => ToolCallEvidenceManifestSchema.parse([{ id: 'call-1', tool: 'write_file', params: {}, source: 'adapter', rawArgs: {} }])).toThrow();
  });

  it('serializes manifests as newline-terminated JSON arrays', () => {
    expect(serializeToolCallEvidence([])).toBe('[]\n');
  });
});
