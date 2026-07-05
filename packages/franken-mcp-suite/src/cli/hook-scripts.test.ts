import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
    '  # Context arrives via env; the tool name is the positional after "--".',
    '  CONTEXT="${FBEAST_TOOL_CONTEXT:-}"',
    '  TOOL_NAME="${4:-}"',
    '  if [ "$TOOL_NAME" = "hang" ]; then',
    '    sleep 10',
    '    exit 0',
    '  fi',
    '  if [ "$TOOL_NAME" = "rm -rf /tmp/nope" ]; then',
    "    printf 'destructive action blocked\\n' >&2",
    '    exit 1',
    '  fi',
    '  case "$CONTEXT" in',
    '    *"rm -rf"*)',
    "      printf 'destructive payload blocked\\n' >&2",
    '      exit 1',
    '      ;;',
    '  esac',
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
  const node = findCommand('node');
  const cat = findCommand('cat');
  const bashPath = join(binDir, 'bash');
  writeFileSync(bashPath, [
    '#!/bin/sh',
    `exec ${bash} "$@"`,
    '',
  ].join('\n'));
  chmodSync(bashPath, 0o755);

  const nodePath = join(binDir, 'node');
  writeFileSync(nodePath, [
    '#!/bin/sh',
    `exec ${node} "$@"`,
    '',
  ].join('\n'));
  chmodSync(nodePath, 0o755);

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

  it('passes the tool payload through so a benign tool name with destructive input is denied', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'codex');

    const result = runScript(preTool, {
      tool_name: 'shell',
      tool_input: { command: 'rm -rf /important-dir' },
      session_id: 'sess-1',
    }, binDir);

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('"permissionDecision":"deny"');
    expect(result.stdout).toContain('destructive payload blocked');
  });

  it('does not forward file-content fields, so destructive-looking content is not seen by the governor', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'codex');

    const result = runScript(preTool, {
      tool_name: 'apply_patch',
      tool_input: { file_path: 'docs/safe.md', content: 'rm -rf / and SECRET_TOKEN=abc' },
      session_id: 'sess-1',
    }, binDir);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('does not forward apply_patch patch bodies carried in tool_input.command', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'codex');

    // Codex apply_patch puts the whole patch in tool_input.command; forwarding it
    // would both false-positive on diff text and persist secrets in governor_log.
    const result = runScript(preTool, {
      tool_name: 'apply_patch',
      tool_input: { command: '*** Begin Patch\n+ rm -rf / and SECRET_TOKEN=abc\n*** End Patch' },
      session_id: 'sess-1',
    }, binDir);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('allows large benign payloads without overflowing argv (ARG_MAX)', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'codex');

    const result = runScript(preTool, {
      tool_name: 'Write',
      tool_input: { file_path: 'big.txt', content: 'x'.repeat(300_000) },
      session_id: 'sess-1',
    }, binDir);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('does not let a leading-dash command be parsed as a hook flag', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'codex');

    const result = runScript(preTool, {
      tool_name: 'shell',
      tool_input: { command: '--db=/tmp/x; rm -rf /tmp/y' },
      session_id: 'sess-1',
    }, binDir);

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('"permissionDecision":"deny"');
    expect(result.stdout).toContain('destructive payload blocked');
  });

  it('denies a long command whose dangerous suffix is past 4096 chars (no truncation)', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'codex');

    const result = runScript(preTool, {
      tool_name: 'shell',
      tool_input: { command: `echo ${'A'.repeat(8000)}; rm -rf /tmp/y` },
      session_id: 'sess-1',
    }, binDir);

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('"permissionDecision":"deny"');
    expect(result.stdout).toContain('destructive payload blocked');
  });

  it('normalizes argv arrays so destructive tokens are matched', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'codex');

    const result = runScript(preTool, {
      tool_name: 'shell',
      tool_input: { args: ['rm', '-rf', '/tmp/x'] },
      session_id: 'sess-1',
    }, binDir);

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('"permissionDecision":"deny"');
    expect(result.stdout).toContain('destructive payload blocked');
  });

  it('preserves command text inside object-array command fields', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'codex');

    // A command field holding an array of command OBJECTS must not collapse to
    // "[object Object]" — the dangerous text has to survive into the context.
    const result = runScript(preTool, {
      tool_name: 'shell',
      tool_input: { commands: [{ command: 'rm -rf /tmp/x' }] },
      session_id: 'sess-1',
    }, binDir);

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('"permissionDecision":"deny"');
    expect(result.stdout).toContain('destructive payload blocked');
  });

  it('extracts the tool name even when NODE_OPTIONS forces ESM eval mode', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'codex');

    // If the parse eval ran as an ES module, require("fs") would throw and the
    // tool name would come back empty (fail-closed deny). The scripts force
    // --input-type=commonjs, so a destructive payload is still governed.
    const result = runScript(preTool, {
      tool_name: 'shell',
      tool_input: { command: 'rm -rf /tmp/x' },
      session_id: 'sess-1',
    }, binDir, {
      NODE_OPTIONS: '--input-type=module',
    });

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('"permissionDecision":"deny"');
    expect(result.stdout).toContain('destructive payload blocked');
  });

  it('allows benign file paths that contain destructive substrings', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'codex');

    const result = runScript(preTool, {
      tool_name: 'Write',
      tool_input: { file_path: 'src/dropdown.tsx' },
      session_id: 'sess-1',
    }, binDir);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('fails closed (denies) when the pre-tool tool name is empty', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'codex');

    const result = runScript(preTool, {
      tool_input: { command: 'ls' },
      session_id: 'sess-1',
    }, binDir);

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('"permissionDecision":"deny"');
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

  it('fails closed (denies) when pre-tool governance times out', () => {
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
    expect(result.status).toBe(2);
    expect(result.stdout).toContain('"permissionDecision":"deny"');
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

  it('denies when timeout exits 125 (timeout internal failure) for pre-tool governance', () => {
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

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('"permissionDecision":"deny"');
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

  it('runs post-tool fbeast-hook directly when timeout is unavailable', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    installRuntimeWithoutTimeout(binDir);
    const { postTool } = writeHookScripts(root, 'codex');

    const result = runScript(postTool, {
      tool_name: 'exec_command',
      tool_response: { ok: true },
      session_id: 'sess-1',
    }, binDir, {
      PATH: binDir,
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('');
  });
});

describe('generated script runtime dependencies', () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const root of tempRoots) {
      if (existsSync(root)) {
        rmSync(root, { recursive: true, force: true });
      }
    }
    tempRoots.length = 0;
  });

  it('parses stdin with node and never depends on python3', () => {
    const root = makeTempRoot();
    tempRoots.push(root);

    for (const client of ['claude', 'gemini', 'codex'] as const) {
      const { preTool, postTool } = writeHookScripts(root, client);
      for (const script of [preTool, postTool]) {
        const body = readFileSync(script, 'utf8');
        expect(body, `${client} ${script}`).not.toContain('python3');
        expect(body, `${client} ${script}`).toContain("node --input-type=commonjs -e");
      }
    }
  });

  it('preserves an explicit null tool_response instead of defaulting it to {}', () => {
    const root = makeTempRoot();
    tempRoots.push(root);

    for (const client of ['claude', 'gemini', 'codex'] as const) {
      const { postTool } = writeHookScripts(root, client);
      const body = readFileSync(postTool, 'utf8');
      // A key-presence check keeps `tool_response: null` as `null` in audit
      // metadata; `?? {}` would silently rewrite it to an empty object.
      expect(body, `${client} ${postTool}`).toContain('"tool_response" in d');
      expect(body, `${client} ${postTool}`).not.toContain('d.tool_response??{}');
    }
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

  it('passes the tool payload through so a benign tool name with destructive input is denied', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'claude');

    const result = runScript(preTool, {
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf /important-dir' },
      session_id: 'sess-1',
    }, binDir);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('fbeast governor blocked');
    expect(result.stderr).toContain('destructive payload blocked');
  });

  it('does not forward file-content fields, so destructive-looking content is not seen by the governor', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'claude');

    const result = runScript(preTool, {
      tool_name: 'Write',
      tool_input: { file_path: 'docs/safe.md', content: 'rm -rf / and SECRET_TOKEN=abc' },
      session_id: 'sess-1',
    }, binDir);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('allows large benign payloads without overflowing argv (ARG_MAX)', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'claude');

    const result = runScript(preTool, {
      tool_name: 'Write',
      tool_input: { file_path: 'big.txt', content: 'x'.repeat(300_000) },
      session_id: 'sess-1',
    }, binDir);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('does not let a leading-dash command be parsed as a hook flag', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'claude');

    const result = runScript(preTool, {
      tool_name: 'Bash',
      tool_input: { command: '--db=/tmp/x; rm -rf /tmp/y' },
      session_id: 'sess-1',
    }, binDir);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('fbeast governor blocked');
    expect(result.stderr).toContain('destructive payload blocked');
  });

  it('denies a long command whose dangerous suffix is past 4096 chars (no truncation)', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'claude');

    const result = runScript(preTool, {
      tool_name: 'Bash',
      tool_input: { command: `echo ${'A'.repeat(8000)}; rm -rf /tmp/y` },
      session_id: 'sess-1',
    }, binDir);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('fbeast governor blocked');
    expect(result.stderr).toContain('destructive payload blocked');
  });

  it('normalizes argv arrays so destructive tokens are matched', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'claude');

    const result = runScript(preTool, {
      tool_name: 'Bash',
      tool_input: { args: ['rm', '-rf', '/tmp/x'] },
      session_id: 'sess-1',
    }, binDir);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('fbeast governor blocked');
    expect(result.stderr).toContain('destructive payload blocked');
  });

  it('allows benign file paths that contain destructive substrings', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'claude');

    const result = runScript(preTool, {
      tool_name: 'Write',
      tool_input: { file_path: 'src/dropdown.tsx' },
      session_id: 'sess-1',
    }, binDir);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('fails closed (denies) when the pre-tool tool name is empty', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'claude');

    const result = runScript(preTool, {
      tool_input: { command: 'ls' },
      session_id: 'sess-1',
    }, binDir);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('fbeast governor blocked');
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

  it('fails closed (denies) when pre-tool governance times out', () => {
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
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('fbeast governor blocked');
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

  it('denies when timeout exits 125 (timeout internal failure) for pre-tool governance', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    installTimeoutExit(binDir, 125);
    const { preTool } = writeHookScripts(root, 'claude');

    const result = runScript(preTool, {
      tool_name: 'exec_command',
      tool_input: {},
      session_id: 'sess-1',
    }, binDir);

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

  it('runs post-tool fbeast-hook directly when timeout is unavailable', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    installRuntimeWithoutTimeout(binDir);
    const { postTool } = writeHookScripts(root, 'claude');

    const result = runScript(postTool, {
      tool_name: 'exec_command',
      tool_response: { ok: true },
      session_id: 'sess-1',
    }, binDir, {
      PATH: binDir,
    });

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

  it('passes the tool payload through so a benign tool name with destructive input is denied', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'gemini');

    const result = runScript(preTool, {
      tool_name: 'run_shell_command',
      tool_input: { command: 'rm -rf /important-dir' },
    }, binDir);

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('"decision":"deny"');
    expect(result.stdout).toContain('destructive payload blocked');
  });

  it('does not forward file-content fields, so destructive-looking content is not seen by the governor', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'gemini');

    const result = runScript(preTool, {
      tool_name: 'write_file',
      tool_input: { file_path: 'docs/safe.md', content: 'rm -rf / and SECRET_TOKEN=abc' },
    }, binDir);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('allows large benign payloads without overflowing argv (ARG_MAX)', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'gemini');

    const result = runScript(preTool, {
      tool_name: 'write_file',
      tool_input: { file_path: 'big.txt', content: 'x'.repeat(300_000) },
    }, binDir);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('does not let a leading-dash command be parsed as a hook flag', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'gemini');

    const result = runScript(preTool, {
      tool_name: 'run_shell_command',
      tool_input: { command: '--db=/tmp/x; rm -rf /tmp/y' },
    }, binDir);

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('"decision":"deny"');
    expect(result.stdout).toContain('destructive payload blocked');
  });

  it('denies a long command whose dangerous suffix is past 4096 chars (no truncation)', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'gemini');

    const result = runScript(preTool, {
      tool_name: 'run_shell_command',
      tool_input: { command: `echo ${'A'.repeat(8000)}; rm -rf /tmp/y` },
    }, binDir);

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('"decision":"deny"');
    expect(result.stdout).toContain('destructive payload blocked');
  });

  it('normalizes argv arrays so destructive tokens are matched', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'gemini');

    const result = runScript(preTool, {
      tool_name: 'run_shell_command',
      tool_input: { args: ['rm', '-rf', '/tmp/x'] },
    }, binDir);

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('"decision":"deny"');
    expect(result.stdout).toContain('destructive payload blocked');
  });

  it('allows benign file paths that contain destructive substrings', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'gemini');

    const result = runScript(preTool, {
      tool_name: 'write_file',
      tool_input: { file_path: 'src/dropdown.tsx' },
    }, binDir);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('fails closed (denies) when the before-tool tool name is empty', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    const { preTool } = writeHookScripts(root, 'gemini');

    const result = runScript(preTool, {
      tool_input: { command: 'ls' },
    }, binDir);

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('"decision":"deny"');
  });

  it('fails closed (denies) when before-tool governance times out', () => {
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
    expect(result.status).toBe(2);
    expect(result.stdout).toContain('"decision":"deny"');
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

  it('denies when timeout exits 125 (timeout internal failure) for before-tool governance', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    installTimeoutExit(binDir, 125);
    const { preTool } = writeHookScripts(root, 'gemini');

    const result = runScript(preTool, {
      tool_name: 'exec_command',
      tool_input: {},
    }, binDir);

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('"decision":"deny"');
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

  it('runs post-tool fbeast-hook directly when timeout is unavailable', () => {
    const root = makeTempRoot();
    tempRoots.push(root);
    const binDir = installFakeHook(root);
    installRuntimeWithoutTimeout(binDir);
    const { postTool } = writeHookScripts(root, 'gemini');

    const result = runScript(postTool, {
      tool_name: 'exec_command',
      tool_response: { ok: true },
    }, binDir, {
      PATH: binDir,
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('');
  });
});
