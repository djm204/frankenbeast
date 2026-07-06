import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { parseJsonObjectWithComments, writeJsonFileAtomic } from './settings-json.js';

describe('settings.json helpers', () => {
  it('parses comments and trailing commas without treating comment markers inside strings as comments', () => {
    const parsed = parseJsonObjectWithComments(`{
      // VS Code-style comment
      "mcpServers": {
        "existing": {
          "command": "node",
          "args": ["https://example.test//not-a-comment"],
        },
      },
      /* block comment */
      "note": "literal /* not a comment */ and // also literal",
    }`);

    expect(parsed).toEqual({
      mcpServers: {
        existing: {
          command: 'node',
          args: ['https://example.test//not-a-comment'],
        },
      },
      note: 'literal /* not a comment */ and // also literal',
    });
  });

  it('rejects settings JSON that does not parse to an object', () => {
    expect(() => parseJsonObjectWithComments('[1, 2, 3]')).toThrow(/settings\.json must contain a JSON object/);
  });

  it('writes JSON via a sibling temp file and leaves no temp file after success', () => {
    const dir = mkdtempSync(join(tmpdir(), `fbeast-settings-${randomUUID()}`));
    const settingsPath = join(dir, 'settings.json');

    writeJsonFileAtomic(settingsPath, { mcpServers: { 'fbeast-memory': { command: 'fbeast-memory' } } });

    expect(JSON.parse(readFileSync(settingsPath, 'utf-8'))).toEqual({
      mcpServers: { 'fbeast-memory': { command: 'fbeast-memory' } },
    });
    expect(readdirSync(dir).filter((entry) => entry.includes('.tmp-'))).toEqual([]);
  });

  it('does not modify an existing file when serialization fails before the atomic rename', () => {
    const dir = mkdtempSync(join(tmpdir(), `fbeast-settings-${randomUUID()}`));
    const settingsPath = join(dir, 'settings.json');
    writeFileSync(settingsPath, '{"existing":true}\n', 'utf-8');
    const value = {
      toJSON() {
        throw new Error('boom');
      },
    };

    expect(() => writeJsonFileAtomic(settingsPath, value)).toThrow('boom');

    expect(readFileSync(settingsPath, 'utf-8')).toBe('{"existing":true}\n');
    expect(existsSync(settingsPath)).toBe(true);
  });
});
