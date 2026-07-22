import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOOL_REGISTRY } from '../packages/franken-mcp-suite/src/shared/tool-registry.js';

const ROOT = resolve(import.meta.dirname, '..');
const readDoc = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');
const canonicalToolIds = new Set(TOOL_REGISTRY.keys());

const maintainedMcpDocs = [
  ...readdirSync(resolve(ROOT, 'docs/adr'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => `docs/adr/${name}`),
  'docs/walkthrough-mcp-suite.md',
  'packages/franken-mcp-suite/README.md',
];

describe('issue #3565 canonical MCP tool references', () => {
  it('uses complete canonical tool IDs instead of slash-prefixed shorthand', () => {
    for (const path of maintainedMcpDocs) {
      const doc = readDoc(path);

      expect(doc, path).not.toMatch(/`fbeast_[a-z0-9_]+`\s*\/\s*`_[a-z0-9_]+`/);
    }
  });

  it('keeps maintained MCP documentation references in the registry', () => {
    for (const path of maintainedMcpDocs) {
      const references = readDoc(path).match(/`(fbeast_[a-z0-9_]+)`/g) ?? [];

      for (const reference of references) {
        const toolId = reference.slice(1, -1);
        expect(canonicalToolIds.has(toolId), `${path}: ${toolId}`).toBe(true);
      }
    }
  });

  it('keeps the walkthrough tool table synchronized with the registry', () => {
    const walkthrough = readDoc('docs/walkthrough-mcp-suite.md');
    const referenceSection = walkthrough.slice(
      walkthrough.indexOf('## MCP Tools Reference'),
      walkthrough.indexOf('## Switching to Beast Mode'),
    );
    const documentedToolIds = [...referenceSection.matchAll(/^\| `(fbeast_[a-z0-9_]+)` \|/gm)]
      .map((match) => match[1]);

    expect(new Set(documentedToolIds)).toEqual(canonicalToolIds);
    expect(documentedToolIds).toHaveLength(canonicalToolIds.size);
  });
});
