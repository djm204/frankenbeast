import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';

import { writeHookScripts } from './hook-scripts.js';

function makeTempRoot(): string {
  const root = join(tmpdir(), `fbeast-hook-scripts-${randomUUID()}`);
  mkdirSync(root, { recursive: true });
  return root;
}

function installFakeHook(root: string): string {
  const binDir = join(root, 'bin');
  mkdirSync(binDir, { recursive: true });

  const hookPath = join(binDir, 'fbeast-hook');
  writeFileSync(hookPath, [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    '',
    'PHASE="$1"',
    'shift',
    '',
    'if [ "${FBEAST_HOOK_SHOULD_NOT_RUN:-}" = "1" ]; then',
    "  printf 'fbeast-hook should not have been invoked\\n' >&2",
    '  exit 99',
    'fi',
    '',
    'if [ "$PHASE" = "pre-tool" ]; then',
    '  TOOL_NAME="${3:-}"',
    '  if [ "$TOOL_NAME" = "hang" ]; then',
    '    sleep 10',
    '    exit 0',
    '  fi',
    '  if [ "$TOOL_NAME" = "rm -rf /tmp/nope" ]; then',
    "    printf 'destructive action blocked\\n' >&2",
    '    exit 1',
    '  fi',
    '',
    `  printf '{"allowed":true,"decision":"approved"}\\n'`,
    '  exit 0',
    'fi',
    '',
    'if [ "$PHASE" = "post-tool" ]; then',
    '  TOOL_NAME="${3:-}"',
    '  if [ "$TOOL_NAME" = "hang" ]; then',
    '    sleep 10',
    '    exit 0',
    '  fi',
    `  printf '{"logged":true}\\n'`,
    '  exit 0',
    'fi',
    '',
    `printf 'unexpected phase: %s\\n' "$PHASE" >&2`,
    'exit 99',
    '',
  ].join('\n'));
  chmodSync(hookPath, 0o755);
  return binDir;
}

function installUnavailableTimeout(binDir: string): void {
  const timeoutPath = join(binDir, 'timeout');
  writeFileSync(timeoutPath, [
    '#!/usr/bin/env bash',
    "printf 'timeout: command not found\\n' >&2",
    'exit 127',
    '',
  ].join('\n'));
  chmodSync(timeoutPath, 0o755);
}

function runScript(
  scriptPath: string,
  input: unknown,
  binDir: string,
  extraEnv: Record<string, string> = {},
) {
  return spawnSync(scriptPath, {
    cwd: dirname(scriptPath),
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
      ...extraEnv,
    },
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: 3_000,
  });
}

describe('Codex hook scripts', () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const root of tempRoots) {
      if (existsSync(root)) {
        rmSync(root, { recursive: true, force: true });
      }
    }
    tempRoots.length = 0;
  });

  it('returns Codex deny output with exit 2 when the pre-tool hook blocks an action', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'codex');

    const result = runScript(preTool, {
      tool_name: 'rm -rf /tmp/nope',
      tool_input: {},
      session_id: 'sess-1',
    }, binDir);

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('"permissionDecision":"deny"');
    expect(result.stdout).toContain('destructive action blocked');
  });

  it('keeps allowed pre-tool hooks silent for Codex', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'codex');

    const result = runScript(preTool, {
      tool_name: 'exec_command',
      tool_input: { cmd: 'sed -n 1,10p file' },
      session_id: 'sess-1',
    }, binDir);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('keeps post-tool hooks silent even when fbeast-hook writes success output', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { postTool } = writeHookScripts(root, 'codex');

    const result = runScript(postTool, {
      tool_name: 'exec_command',
      tool_response: { ok: true },
      session_id: 'sess-1',
    }, binDir);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('bypasses pre-tool hooks for spawned child processes', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'codex');

    const result = runScript(preTool, {
      tool_name: 'rm -rf /tmp/nope',
      tool_input: {},
      session_id: 'sess-1',
    }, binDir, {
      FRANKENBEAST_SPAWNED: '1',
      FBEAST_HOOK_SHOULD_NOT_RUN: '1',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  it('bypasses post-tool hooks when hooks are explicitly disabled', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { postTool } = writeHookScripts(root, 'codex');

    const result = runScript(postTool, {
      tool_name: 'exec_command',
      tool_response: { ok: true },
      session_id: 'sess-1',
    }, binDir, {
      FBEAST_DISABLE_HOOKS: '1',
      FBEAST_HOOK_SHOULD_NOT_RUN: '1',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  it('fails open when pre-tool governance times out', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'codex');
    const startedAt = Date.now();

    const result = runScript(preTool, {
      tool_name: 'hang',
      tool_input: {},
      session_id: 'sess-1',
    }, binDir, {
      FBEAST_HOOK_TIMEOUT_SECONDS: '1',
    });

    expect(Date.now() - startedAt).toBeLessThan(3_000);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('fails open when timeout is unavailable for pre-tool governance', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    installUnavailableTimeout(binDir);
    const { preTool } = writeHookScripts(root, 'codex');

    const result = runScript(preTool, {
      tool_name: 'exec_command',
      tool_input: {},
      session_id: 'sess-1',
    }, binDir);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('fails open when post-tool observer logging times out', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { postTool } = writeHookScripts(root, 'codex');
    const startedAt = Date.now();

    const result = runScript(postTool, {
      tool_name: 'hang',
      tool_response: { ok: true },
      session_id: 'sess-1',
    }, binDir, {
      FBEAST_HOOK_TIMEOUT_SECONDS: '1',
    });

    expect(Date.now() - startedAt).toBeLessThan(3_000);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });
});

describe('Gemini hook scripts', () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const root of tempRoots) {
      if (existsSync(root)) {
        rmSync(root, { recursive: true, force: true });
      }
    }
    tempRoots.length = 0;
  });

  it('bypasses before-tool hooks for spawned child processes', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'gemini');

    const result = runScript(preTool, {
      tool_name: 'rm -rf /tmp/nope',
      tool_input: {},
    }, binDir, {
      FRANKENBEAST_SPAWNED: '1',
      FBEAST_HOOK_SHOULD_NOT_RUN: '1',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  it('fails open when before-tool governance times out', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'gemini');
    const startedAt = Date.now();

    const result = runScript(preTool, {
      tool_name: 'hang',
      tool_input: {},
    }, binDir, {
      FBEAST_HOOK_TIMEOUT_SECONDS: '1',
    });

    expect(Date.now() - startedAt).toBeLessThan(3_000);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('fails open when timeout is unavailable for before-tool governance', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    installUnavailableTimeout(binDir);
    const { preTool } = writeHookScripts(root, 'gemini');

    const result = runScript(preTool, {
      tool_name: 'exec_command',
      tool_input: {},
    }, binDir);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });
});
