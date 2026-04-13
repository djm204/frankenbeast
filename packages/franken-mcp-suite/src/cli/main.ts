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
  default:
    console.log('Usage: fbeast <command>');
    console.log('');
    console.log('Commands:');
    console.log('  init          Set up fbeast MCP servers for Claude Code');
    console.log('  init --pick   Choose which servers to install');
    console.log('  init --hooks  Also add Claude Code hooks');
    console.log('  uninstall     Remove fbeast from Claude Code config');
    console.log('  uninstall --purge  Also remove stored data');
    process.exit(command ? 1 : 0);
}
