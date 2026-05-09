import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';

import { writeHookScripts } from './hook-scripts.js';

function findCommand(name: string): string {
  const result = spawnSync('sh', ['-lc', `command -v ${name}`], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`Unable to locate required test command: ${name}`);
  }
  return result.stdout.trim();
}

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

function installTimeoutExit(binDir: string, status: number): void {
  const timeoutPath = join(binDir, 'timeout');
  writeFileSync(timeoutPath, [
    '#!/usr/bin/env bash',
    `printf 'timeout exited ${status}\\n' >&2`,
    `exit ${status}`,
    '',
  ].join('\n'));
  chmodSync(timeoutPath, 0o755);
}

function installRuntimeWithoutTimeout(binDir: string): void {
  const bash = findCommand('bash');
  const python = findCommand('python3');
  const cat = findCommand('cat');
  const bashPath = join(binDir, 'bash');
  writeFileSync(bashPath, [
    '#!/bin/sh',
    `exec ${bash} "$@"`,
    '',
  ].join('\n'));
  chmodSync(bashPath, 0o755);

  const pythonPath = join(binDir, 'python3');
  writeFileSync(pythonPath, [
    '#!/bin/sh',
    `exec ${python} "$@"`,
    '',
  ].join('\n'));
  chmodSync(pythonPath, 0o755);

  const catPath = join(binDir, 'cat');
  writeFileSync(catPath, [
    '#!/bin/sh',
    `exec ${cat} "$@"`,
    '',
  ].join('\n'));
  chmodSync(catPath, 0o755);
}

function installRuntimeWithoutHook(binDir: string): void {
  installRuntimeWithoutTimeout(binDir);

  const timeoutPath = join(binDir, 'timeout');
  writeFileSync(timeoutPath, [
    '#!/bin/sh',
    'shift',
    'exec "$@"',
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

    expect(result.status, result.stderr).toBe(0);
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

    expect(result.status, result.stderr).toBe(0);
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

  it('runs fbeast-hook directly when timeout is unavailable and allows governed calls', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    installRuntimeWithoutTimeout(binDir);
    const { preTool } = writeHookScripts(root, 'codex');

    const result = runScript(preTool, {
      tool_name: 'exec_command',
      tool_input: {},
      session_id: 'sess-1',
    }, binDir, {
      PATH: binDir,
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('denies via direct fbeast-hook call when timeout unavailable and hook blocks', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    installRuntimeWithoutTimeout(binDir);
    const { preTool } = writeHookScripts(root, 'codex');

    const result = runScript(preTool, {
      tool_name: 'rm -rf /tmp/nope',
      tool_input: {},
      session_id: 'sess-1',
    }, binDir, {
      PATH: binDir,
    });

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('"permissionDecision":"deny"');
  });

  it('fails open when timeout exits 125 for pre-tool governance', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    installTimeoutExit(binDir, 125);
    const { preTool } = writeHookScripts(root, 'codex');

    const result = runScript(preTool, {
      tool_name: 'exec_command',
      tool_input: {},
      session_id: 'sess-1',
    }, binDir);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('denies when timeout exits 126 (command not executable) for pre-tool governance', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    installTimeoutExit(binDir, 126);
    const { preTool } = writeHookScripts(root, 'codex');

    const result = runScript(preTool, {
      tool_name: 'exec_command',
      tool_input: {},
      session_id: 'sess-1',
    }, binDir);

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('"permissionDecision":"deny"');
  });

  it('denies when pre-tool governance is killed', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    installTimeoutExit(binDir, 137);
    const { preTool } = writeHookScripts(root, 'codex');

    const result = runScript(preTool, {
      tool_name: 'exec_command',
      tool_input: {},
      session_id: 'sess-1',
    }, binDir);

    expect(result.status, result.stderr).toBe(2);
    expect(result.stdout).toContain('"permissionDecision":"deny"');
  });

  it('denies when fbeast-hook is unavailable for pre-tool governance', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = join(root, 'bin');
    mkdirSync(binDir, { recursive: true });
    installRuntimeWithoutHook(binDir);
    const { preTool } = writeHookScripts(root, 'codex');

    const result = runScript(preTool, {
      tool_name: 'exec_command',
      tool_input: {},
      session_id: 'sess-1',
    }, binDir, {
      PATH: binDir,
    });

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('"permissionDecision":"deny"');
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
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('');
  });
});

describe('Claude Code hook scripts', () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const root of tempRoots) {
      if (existsSync(root)) {
        rmSync(root, { recursive: true, force: true });
      }
    }
    tempRoots.length = 0;
  });

  it('returns Claude block reason on stderr with exit 2 when the pre-tool hook blocks an action', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'claude');

    const result = runScript(preTool, {
      tool_name: 'rm -rf /tmp/nope',
      tool_input: {},
      session_id: 'sess-1',
    }, binDir);

    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('fbeast governor blocked');
    expect(result.stderr).toContain('destructive action blocked');
  });

  it('keeps allowed pre-tool hooks silent for Claude Code', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'claude');

    const result = runScript(preTool, {
      tool_name: 'exec_command',
      tool_input: { cmd: 'ls' },
      session_id: 'sess-1',
    }, binDir);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('bypasses pre-tool hooks for spawned child processes', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'claude');

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

  it('fails open when pre-tool governance times out', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'claude');
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

  it('runs fbeast-hook directly when timeout is unavailable and allows governed calls', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    installRuntimeWithoutTimeout(binDir);
    const { preTool } = writeHookScripts(root, 'claude');

    const result = runScript(preTool, {
      tool_name: 'exec_command',
      tool_input: {},
      session_id: 'sess-1',
    }, binDir, {
      PATH: binDir,
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('denies via direct fbeast-hook call when timeout unavailable and hook blocks', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    installRuntimeWithoutTimeout(binDir);
    const { preTool } = writeHookScripts(root, 'claude');

    const result = runScript(preTool, {
      tool_name: 'rm -rf /tmp/nope',
      tool_input: {},
      session_id: 'sess-1',
    }, binDir, {
      PATH: binDir,
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('fbeast governor blocked');
  });

  it('denies when timeout exits 126 (command not executable) for pre-tool governance', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    installTimeoutExit(binDir, 126);
    const { preTool } = writeHookScripts(root, 'claude');

    const result = runScript(preTool, {
      tool_name: 'exec_command',
      tool_input: {},
      session_id: 'sess-1',
    }, binDir);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('fbeast governor blocked');
  });

  it('denies when pre-tool governance is killed', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    installTimeoutExit(binDir, 137);
    const { preTool } = writeHookScripts(root, 'claude');

    const result = runScript(preTool, {
      tool_name: 'exec_command',
      tool_input: {},
      session_id: 'sess-1',
    }, binDir);

    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('fbeast governor blocked');
  });

  it('keeps post-tool hooks silent', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { postTool } = writeHookScripts(root, 'claude');

    const result = runScript(postTool, {
      tool_name: 'exec_command',
      tool_response: { ok: true },
      session_id: 'sess-1',
    }, binDir);

    expect(result.status, result.stderr).toBe(0);
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

  it('runs fbeast-hook directly when timeout is unavailable and allows governed calls', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    installRuntimeWithoutTimeout(binDir);
    const { preTool } = writeHookScripts(root, 'gemini');

    const result = runScript(preTool, {
      tool_name: 'exec_command',
      tool_input: {},
    }, binDir, {
      PATH: binDir,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('denies via direct fbeast-hook call when timeout unavailable and hook blocks', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    installRuntimeWithoutTimeout(binDir);
    const { preTool } = writeHookScripts(root, 'gemini');

    const result = runScript(preTool, {
      tool_name: 'rm -rf /tmp/nope',
      tool_input: {},
    }, binDir, {
      PATH: binDir,
    });

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('"decision":"deny"');
  });

  it('fails open when timeout exits 125 for before-tool governance', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    installTimeoutExit(binDir, 125);
    const { preTool } = writeHookScripts(root, 'gemini');

    const result = runScript(preTool, {
      tool_name: 'exec_command',
      tool_input: {},
    }, binDir);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('denies when timeout exits 126 (command not executable) for before-tool governance', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    installTimeoutExit(binDir, 126);
    const { preTool } = writeHookScripts(root, 'gemini');

    const result = runScript(preTool, {
      tool_name: 'exec_command',
      tool_input: {},
    }, binDir);

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('"decision":"deny"');
  });

  it('denies when before-tool governance is killed', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    installTimeoutExit(binDir, 137);
    const { preTool } = writeHookScripts(root, 'gemini');

    const result = runScript(preTool, {
      tool_name: 'exec_command',
      tool_input: {},
    }, binDir);

    expect(result.status, result.stderr).toBe(2);
    expect(result.stdout).toContain('"decision":"deny"');
  });

  it('denies when fbeast-hook is unavailable for before-tool governance', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = join(root, 'bin');
    mkdirSync(binDir, { recursive: true });
    installRuntimeWithoutHook(binDir);
    const { preTool } = writeHookScripts(root, 'gemini');

    const result = runScript(preTool, {
      tool_name: 'exec_command',
      tool_input: {},
    }, binDir, {
      PATH: binDir,
    });

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('"decision":"deny"');
  });
});
