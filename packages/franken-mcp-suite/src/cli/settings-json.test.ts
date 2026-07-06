import { describe, expect, it } from 'vitest';
import { chmodSync, existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
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

  it('preserves permissions when replacing an existing settings file', () => {
    const dir = mkdtempSync(join(tmpdir(), `fbeast-settings-${randomUUID()}`));
    const settingsPath = join(dir, 'settings.json');
    writeFileSync(settingsPath, '{"existing":true}\n', 'utf-8');
    chmodSync(settingsPath, 0o600);

    writeJsonFileAtomic(settingsPath, { existing: true, updated: true });

    expect(statSync(settingsPath).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(settingsPath, 'utf-8'))).toEqual({ existing: true, updated: true });
  });

  it('updates the target of a symlinked settings file without replacing the symlink', () => {
    const dir = mkdtempSync(join(tmpdir(), `fbeast-settings-${randomUUID()}`));
    const targetPath = join(dir, 'settings-target.json');
    const settingsPath = join(dir, 'settings.json');
    writeFileSync(targetPath, '{"existing":true}\n', 'utf-8');
    symlinkSync(targetPath, settingsPath);

    writeJsonFileAtomic(settingsPath, { existing: true, updated: true });

    expect(lstatSync(settingsPath).isSymbolicLink()).toBe(true);
    expect(JSON.parse(readFileSync(targetPath, 'utf-8'))).toEqual({ existing: true, updated: true });
  });

  it('creates the target of a dangling symlinked settings file without replacing the symlink', () => {
    const dir = mkdtempSync(join(tmpdir(), `fbeast-settings-${randomUUID()}`));
    const targetPath = join(dir, 'settings-target.json');
    const settingsPath = join(dir, 'settings.json');
    symlinkSync(targetPath, settingsPath);

    writeJsonFileAtomic(settingsPath, { created: true });

    expect(lstatSync(settingsPath).isSymbolicLink()).toBe(true);
    expect(JSON.parse(readFileSync(targetPath, 'utf-8'))).toEqual({ created: true });
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
