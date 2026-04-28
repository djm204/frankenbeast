#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolveClientConfigDir, detectMcpClient, type McpClient } from './mcp-client-paths.js';
import { resolveInitOptions } from './init-options.js';

const command = process.argv[2];

function resolveClient(): McpClient {
  const clientArg = process.argv.find((a) => a.startsWith('--client='))?.split('=')[1] as McpClient | undefined;
  return clientArg ?? detectMcpClient({ cwd: process.cwd(), homeDir: homedir(), exists: existsSync });
}

switch (command) {
  case 'init': {
    const KNOWN_INIT_FLAGS = ['--hooks', '--pick', '--client', '--mode'];
    const unknownFlags = process.argv.slice(3).filter(
      (a) => a.startsWith('--') && !KNOWN_INIT_FLAGS.some((k) => a === k || a.startsWith(k + '=')),
    );
    if (unknownFlags.length > 0) {
      console.error(`fbeast init: unknown flag(s): ${unknownFlags.join(', ')}`);
      console.error('  Known flags: --hooks  --pick[=<servers>]  --mode=standard|proxy  --client=claude|gemini|codex');
      process.exit(1);
    }
    const { runInit } = await import('./init.js');
    const root = process.cwd();
    const client = resolveClient();
    const claudeDir = resolveClientConfigDir({ client, cwd: root, homeDir: homedir(), exists: existsSync });
    const initOptions = await resolveInitOptions(process.argv);
    runInit({ root, claudeDir, client, ...initOptions });
    break;
  }
  case 'uninstall': {
    const { runUninstall } = await import('./uninstall.js');
    const root = process.cwd();
    const client = resolveClient();
    const claudeDir = resolveClientConfigDir({ client, cwd: root, homeDir: homedir(), exists: existsSync });
    const purge = process.argv.includes('--purge') ? true : undefined;
    await runUninstall({ root, claudeDir, purge });
    break;
  }
  case 'beast': {
    const { runBeastMode } = await import('./beast-mode.js');
    const { createInterface } = await import('node:readline');
    const { spawnSync } = await import('node:child_process');
    const root = process.cwd();
    await runBeastMode(process.argv.slice(3), {
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
        const result = spawnSync(cmd, args, { stdio: 'inherit' });
        if (result.error) {
          const isNotFound = (result.error as NodeJS.ErrnoException).code === 'ENOENT';
          throw new Error(
            isNotFound
              ? `${cmd}: binary not found — install @fbeast/orchestrator or run 'npm link --workspace=franken-orchestrator'`
              : `${cmd} failed: ${result.error.message}`,
          );
        }
        if (result.status !== 0) {
          throw new Error(
            result.signal
              ? `${cmd} killed by signal ${result.signal}`
              : `${cmd} exited with ${result.status}`,
          );
        }
      },
    });
    break;
  }
  default:
    console.log('Usage: fbeast <command>');
    console.log('');
    console.log('Commands:');
    console.log('  init                        Set up fbeast MCP servers');
    console.log('  init --client=<name>        Target client: claude (default), gemini, codex');
    console.log('  init --pick                 Choose which servers to install');
    console.log('  init --mode=proxy           Register one proxy MCP server instead of individual servers');
    console.log('  init --hooks                Add pre/post-tool hooks');
    console.log('  uninstall                   Remove fbeast MCP config');
    console.log('  uninstall --client=<name>   Target a specific client');
    console.log('  uninstall --purge           Also remove stored data');
    console.log('  beast                       Activate Beast mode');
    console.log('  beast --provider=<name>     LLM provider: anthropic-api (default), codex-cli, claude-cli');
    process.exit(command ? 1 : 0);
}
