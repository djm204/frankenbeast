#!/usr/bin/env node

function printLine(...args: unknown[]): void {
  console.info(...args);
}

import { existsSync } from 'node:fs';
import { constants, homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { resolveClientConfigDir, detectMcpClient, parseMcpClient, type McpClient } from './mcp-client-paths.js';
import { resolveInitOptions } from './init-options.js';

const command = process.argv[2];
const FRANKENBEAST_INSTALL_HELP = "install franken-orchestrator with 'npm install -g franken-orchestrator'";

function resolveClient(): McpClient {
  const clientArg = parseMcpClient(process.argv.find((a) => a.startsWith('--client='))?.split('=')[1]);
  return clientArg ?? detectMcpClient({ cwd: process.cwd(), homeDir: homedir(), exists: existsSync });
}

function reportMcpInitError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`fbeast mcp init: ${message}`);
  console.error('  Known flags: --hooks  --pick[=<servers>]  --mode=standard|proxy  --client=claude|gemini|codex');
  process.exit(1);
}

function passthrough(): never {
  const result = spawnSync('frankenbeast', process.argv.slice(2), {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) {
    const isNotFound = (result.error as NodeJS.ErrnoException).code === 'ENOENT';
    if (isNotFound) {
      console.error(`frankenbeast: binary not found — ${FRANKENBEAST_INSTALL_HELP}`);
    } else {
      console.error(`frankenbeast: ${result.error.message}`);
    }
    process.exit(1);
  }
  if (result.signal) {
    process.kill(process.pid, result.signal);
    process.exit(128 + (constants.signals[result.signal] ?? 0));
  }
  process.exit(result.status ?? 0);
}

if (command !== 'mcp') {
  passthrough();
}

// ─── fbeast mcp ───────────────────────────────────────────────────────────────

const subcommand = process.argv[3];

switch (subcommand) {
  case 'init': {
    const KNOWN_INIT_FLAGS = ['--hooks', '--pick', '--client', '--mode'];
    const unknownFlags = process.argv.slice(4).filter(
      (a) => a.startsWith('--') && !KNOWN_INIT_FLAGS.some((k) => a === k || a.startsWith(k + '=')),
    );
    if (unknownFlags.length > 0) {
      console.error(`fbeast mcp init: unknown flag(s): ${unknownFlags.join(', ')}`);
      console.error('  Known flags: --hooks  --pick[=<servers>]  --mode=standard|proxy  --client=claude|gemini|codex');
      process.exit(1);
    }
    try {
      const { runInit } = await import('./init.js');
      const root = process.cwd();
      const client = resolveClient();
      const claudeDir = resolveClientConfigDir({ client, cwd: root, homeDir: homedir(), exists: existsSync });
      const initOptions = await resolveInitOptions(process.argv);
      runInit({ root, claudeDir, client, ...initOptions });
    } catch (error) {
      reportMcpInitError(error);
    }
    break;
  }
  case 'uninstall': {
    const { runUninstall } = await import('./uninstall.js');
    const root = process.cwd();
    const client = resolveClient();
    const claudeDir = resolveClientConfigDir({ client, cwd: root, homeDir: homedir(), exists: existsSync });
    const purge = process.argv.includes('--purge') ? true : undefined;
    await runUninstall({ root, claudeDir, client, purge });
    break;
  }
  case 'beast': {
    const { runBeastMode } = await import('./beast-mode.js');
    const { createInterface } = await import('node:readline');
    const { spawnSync: spawn } = await import('node:child_process');
    const root = process.cwd();
    await runBeastMode(process.argv.slice(4), {
      root,
      confirm: (msg) => {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        return new Promise<boolean>((resolve) => {
          rl.question(msg + ' ', (answer) => {
            rl.close();
            resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes');
          });
        });
      },
      exec: async (cmd, args) => {
        const isWindows = process.platform === 'win32';
        const result = spawn(
          cmd,
          args,
          isWindows
            ? { stdio: 'pipe', shell: true, encoding: 'utf8' }
            : { stdio: 'inherit', shell: false },
        );
        if (result.error) {
          const isNotFound = (result.error as NodeJS.ErrnoException).code === 'ENOENT';
          throw new Error(
            isNotFound
              ? `${cmd}: binary not found — ${FRANKENBEAST_INSTALL_HELP}`
              : `${cmd} failed: ${result.error.message}`,
          );
        }
        if (result.status !== 0) {
          const stdout = result.stdout ? String(result.stdout) : '';
          const stderr = result.stderr ? String(result.stderr) : '';
          const shellOutput = `${stdout}\n${stderr}`.toLowerCase();
          const isWindowsCommandNotFound =
            isWindows &&
            (shellOutput.includes('is not recognized') ||
              shellOutput.includes('not recognized as an internal or external command') ||
              shellOutput.includes('command not found'));
          if (isWindowsCommandNotFound) {
            throw new Error(`${cmd}: binary not found — ${FRANKENBEAST_INSTALL_HELP}`);
          }
          if (stdout) process.stdout.write(stdout);
          if (stderr) process.stderr.write(stderr);
          throw new Error(
            result.signal
              ? `${cmd} killed by signal ${result.signal}`
              : `${cmd} exited with ${result.status}`,
          );
        }
        if (result.stdout) process.stdout.write(String(result.stdout));
        if (result.stderr) process.stderr.write(String(result.stderr));
      },
    });
    break;
  }
  default:
    printLine('Usage: fbeast mcp <command>');
    printLine('');
    printLine('MCP server management commands:');
    printLine('  mcp init                        Set up fbeast MCP servers');
    printLine('  mcp init --client=<name>        Target client: claude (default), gemini, codex');
    printLine('  mcp init --pick                 Choose which servers to install');
    printLine('  mcp init --mode=proxy           Register one proxy MCP server instead of individual servers');
    printLine('  mcp init --hooks                Add pre/post-tool hooks');
    printLine('  mcp uninstall                   Remove fbeast MCP config');
    printLine('  mcp uninstall --client=<name>   Target a specific client');
    printLine('  mcp uninstall --purge           Also remove stored data');
    printLine('  mcp beast                       Activate Beast mode');
    printLine('  mcp beast --provider=<name>     LLM provider: anthropic-api (default), codex-cli, claude-cli');
    printLine('');
    printLine('All other commands are forwarded to frankenbeast.');
    printLine('Run: frankenbeast --help');
    process.exit(subcommand ? 1 : 0);
}
