#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const command = process.argv[2];

switch (command) {
  case 'init': {
    const { runInit } = await import('./init.js');
    const root = process.cwd();
    const claudeDir = join(root, '.claude');
    const hooks = process.argv.includes('--hooks');
    runInit({ root, claudeDir, hooks });
    break;
  }
  case 'uninstall': {
    const { runUninstall } = await import('./uninstall.js');
    const root = process.cwd();
    const claudeDir = join(root, '.claude');
    const purge = process.argv.includes('--purge');
    runUninstall({ root, claudeDir, purge });
    break;
  }
  default:
    console.log('Usage: fbeast-mcp-suite <command>');
    console.log('');
    console.log('Commands:');
    console.log('  init          Set up fbeast MCP servers for Claude Code');
    console.log('  init --pick   Choose which servers to install');
    console.log('  init --hooks  Also add Claude Code hooks');
    console.log('  uninstall     Remove fbeast from Claude Code config');
    console.log('  uninstall --purge  Also remove stored data');
    process.exit(command ? 1 : 0);
}
