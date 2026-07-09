import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import process from 'node:process';
import { resolveProjectDbPath } from './resolve-db-path.js';

describe('resolveProjectDbPath', () => {
  const originalClaudeProjectDir = process.env['CLAUDE_PROJECT_DIR'];
  const originalGeminiProjectRoot = process.env['GEMINI_PROJECT_ROOT'];
  const originalFbeastRoot = process.env['FBEAST_ROOT'];

  afterEach(() => {
    if (originalClaudeProjectDir === undefined) delete process.env['CLAUDE_PROJECT_DIR'];
    else process.env['CLAUDE_PROJECT_DIR'] = originalClaudeProjectDir;
    if (originalGeminiProjectRoot === undefined) delete process.env['GEMINI_PROJECT_ROOT'];
    else process.env['GEMINI_PROJECT_ROOT'] = originalGeminiProjectRoot;
    if (originalFbeastRoot === undefined) delete process.env['FBEAST_ROOT'];
    else process.env['FBEAST_ROOT'] = originalFbeastRoot;
  });

  it('anchors project-relative database paths to CLAUDE_PROJECT_DIR when cwd differs', () => {
    process.env['CLAUDE_PROJECT_DIR'] = '/project-a';
    delete process.env['GEMINI_PROJECT_ROOT'];
    delete process.env['FBEAST_ROOT'];

    expect(resolveProjectDbPath(join('.fbeast', 'beast.db'))).toBe(join('/project-a', '.fbeast', 'beast.db'));
  });

  it('expands Claude project-root placeholders emitted in project .mcp.json', () => {
    process.env['CLAUDE_PROJECT_DIR'] = '/project-a';
    delete process.env['GEMINI_PROJECT_ROOT'];
    delete process.env['FBEAST_ROOT'];

    expect(resolveProjectDbPath('${CLAUDE_PROJECT_DIR}/.fbeast/beast.db')).toBe(
      join('/project-a', '.fbeast', 'beast.db'),
    );
  });
});
