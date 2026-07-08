#!/usr/bin/env node

function printLine(...args: unknown[]): void {
  console.info(...args);
}

import { existsSync } from 'node:fs';
import { constants, homedir } from 'node:os';
import { win32 } from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveClientConfigDir, detectMcpClient, parseMcpClient, type McpClient } from './mcp-client-paths.js';
import { resolveInitOptions } from './init-options.js';

const command = process.argv[2];
const FRANKENBEAST_INSTALL_HELP = "install @franken/orchestrator with 'npm install -g @franken/orchestrator'";
const TOP_LEVEL_HELP_OPTIONS = new Set(['--help', '-h', 'help']);
const MCP_HELP_OPTIONS = new Set(['--help', '-h', 'help']);

type ResolvedCommand = {
  command: string;
  args: string[];
  windowsVerbatimArguments?: boolean;
};

function getEnvPath(env: NodeJS.ProcessEnv): string {
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path');
  return pathKey ? env[pathKey] ?? '' : '';
}

function windowsCommandCandidates(command: string): string[] {
  const pathext = (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .map((ext) => ext.trim())
    .filter(Boolean);
  const hasWindowsPathSeparator = command.includes('/') || command.includes('\\');
  const commandHasExt = win32.extname(command) !== '';

  if (hasWindowsPathSeparator || win32.isAbsolute(command)) {
    const directory = win32.dirname(command);
    const file = win32.basename(command);
    return commandHasExt ? [command] : pathext.map((ext) => win32.join(directory, `${file}${ext}`));
  }

  const pathEntries = getEnvPath(process.env).split(win32.delimiter).filter(Boolean);
  const names = commandHasExt ? [command] : pathext.map((ext) => `${command}${ext}`);
  return pathEntries.flatMap((entry) => names.map((name) => joinWindowsPathEntry(entry, name)));
}

function joinWindowsPathEntry(entry: string, name: string): string {
  // Tests can mock process.platform to win32 while running on POSIX paths.
  // Preserve those host paths so existsSync can exercise the Windows branch.
  if (entry.includes('/')) return `${entry.replace(/[\\/]+$/, '')}/${name}`;
  return win32.join(entry, name);
}

function resolveExecutable(command: string): string {
  if (process.platform !== 'win32') return command;

  for (const candidate of windowsCommandCandidates(command)) {
    if (existsSync(candidate)) return candidate;
  }

  return command;
}

function quoteCmdArg(arg: string): string {
  let quoted = '"';
  let backslashes = 0;

  for (const char of arg) {
    if (char === '\\') {
      backslashes += 1;
      continue;
    }

    if (char === '"') {
      quoted += `${'\\'.repeat(backslashes * 2 + 1)}"`;
      backslashes = 0;
      continue;
    }

    quoted += `${'\\'.repeat(backslashes)}${char}`;
    backslashes = 0;
  }

  quoted += `${'\\'.repeat(backslashes * 2)}"`;
  return quoted.replace(/%/g, '%%').replace(/[\^&|<>()!]/g, (char) => `^${char}`);
}

function isWindowsShellShim(command: string): boolean {
  const extension = win32.extname(command).toLowerCase();
  return extension === '.cmd' || extension === '.bat';
}

function resolveCommand(command: string, args: string[]): ResolvedCommand {
  const executable = resolveExecutable(command);
  if (process.platform !== 'win32' || !isWindowsShellShim(executable)) {
    return { command: executable, args };
  }

  const comspec = process.env.ComSpec || process.env.COMSPEC || 'cmd.exe';
  const commandLine = [executable, ...args].map(quoteCmdArg).join(' ');
  return { command: comspec, args: ['/d', '/s', '/c', `"${commandLine}"`], windowsVerbatimArguments: true };
}

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
  const passthroughArgs = process.argv.slice(2);
  const { command, args, windowsVerbatimArguments } = resolveCommand('frankenbeast', passthroughArgs);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
    windowsVerbatimArguments,
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

function printMcpHelp(): never {
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
  process.exit(0);
}

function printTopLevelHelp(): never {
  printLine('Usage: fbeast <command> [args...]');
  printLine('');
  printLine('Primary command:');
  printLine('  mcp   MCP server management commands');
  printLine('  help  Display help (this message)');
  printLine('');
  printLine('All other commands are forwarded to frankenbeast.');
  printLine('Run: frankenbeast --help');
  process.exit(0);
}

if (TOP_LEVEL_HELP_OPTIONS.has(command ?? '')) {
  printTopLevelHelp();
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
        const resolved = resolveCommand(cmd, args);
        const result = spawn(
          resolved.command,
          resolved.args,
          process.platform === 'win32'
            ? { stdio: 'pipe', shell: false, encoding: 'utf8', windowsVerbatimArguments: resolved.windowsVerbatimArguments }
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
    if (!subcommand || MCP_HELP_OPTIONS.has(subcommand)) {
      printMcpHelp();
    }
    console.error(`Unknown command: fbeast mcp ${subcommand}`);
    process.exit(1);
}
