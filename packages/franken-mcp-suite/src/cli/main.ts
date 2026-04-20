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
        if (result.status !== 0) throw new Error(`${cmd} exited with ${result.status}`);
      },
    });
    break;
  }
  default:
    console.log('Usage: fbeast <command>');
    console.log('');
    console.log('Commands:');
    console.log('  init                        Set up fbeast MCP servers');
    console.log('  init --client=<name>        Target client: claude (default), gemini');
    console.log('  init --pick                 Choose which servers to install');
    console.log('  init --hooks                Add pre/post-tool hooks (claude only)');
    console.log('  uninstall                   Remove fbeast MCP config');
    console.log('  uninstall --client=<name>   Target a specific client');
    console.log('  uninstall --purge           Also remove stored data');
    console.log('  beast                       Activate Beast mode');
    console.log('  beast --provider=<name>     LLM provider: anthropic-api (default), codex-cli, claude-cli');
    process.exit(command ? 1 : 0);
}
