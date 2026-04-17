#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { resolveClaudeConfigDir } from './claude-config-paths.js';
import { resolveInitOptions } from './init-options.js';

const command = process.argv[2];

switch (command) {
  case 'init': {
    const { runInit } = await import('./init.js');
    const root = process.cwd();
    const claudeDir = resolveClaudeConfigDir({
      cwd: root,
      homeDir: homedir(),
      exists: existsSync,
    });
    const initOptions = await resolveInitOptions(process.argv);
    runInit({ root, claudeDir, ...initOptions });
    break;
  }
  case 'uninstall': {
    const { runUninstall } = await import('./uninstall.js');
    const root = process.cwd();
    const claudeDir = resolveClaudeConfigDir({
      cwd: root,
      homeDir: homedir(),
      exists: existsSync,
    });
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
    console.log('  init          Set up fbeast MCP servers for Claude Code');
    console.log('  init --pick   Choose which servers to install');
    console.log('  init --hooks  Also add Claude Code hooks');
    console.log('  uninstall     Remove fbeast from Claude Code config');
    console.log('  uninstall --purge  Also remove stored data');
    console.log('  beast              Activate Beast mode');
    console.log('  beast --provider=<name>  Specify LLM provider (default: anthropic-api)');
    process.exit(command ? 1 : 0);
}
