#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { resolveClaudeConfigDir } from './claude-config-paths.js';
import { confirmYesNo } from './prompt.js';

export interface UninstallOptions {
  root: string;
  claudeDir: string;
  purge?: boolean | undefined;
  ask?: (question: string) => Promise<string>;
}

export async function runUninstall(options: UninstallOptions): Promise<void> {
  const { root, claudeDir, ask } = options;
  const purge = options.purge ?? await confirmYesNo(
    'Remove stored data (.fbeast/)? [y/N] ',
    ask ?? defaultAsk,
  );

  const settingsPath = join(claudeDir, 'settings.json');
  if (existsSync(settingsPath)) {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));

    // Remove fbeast MCP servers
    const mcpServers = (settings['mcpServers'] as Record<string, unknown>) ?? {};
    for (const key of Object.keys(mcpServers)) {
      if (key.startsWith('fbeast-')) {
        delete mcpServers[key];
      }
    }
    settings['mcpServers'] = mcpServers;

    // Remove fbeast hooks
    const hooks = settings['hooks'] as Record<string, unknown[]> | undefined;
    if (hooks) {
      for (const [hookType, hookList] of Object.entries(hooks)) {
        if (Array.isArray(hookList)) {
          hooks[hookType] = hookList.filter(
            (h: any) => !h.description?.includes('fbeast') && !h.command?.includes('fbeast'),
          );
        }
      }
      settings['hooks'] = hooks;
    }

    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  }

  const instrPath = join(claudeDir, 'fbeast-instructions.md');
  if (existsSync(instrPath)) {
    unlinkSync(instrPath);
  }

  const fbeastDir = join(root, '.fbeast');
  if (purge && existsSync(fbeastDir)) {
    rmSync(fbeastDir, { recursive: true, force: true });
  }

  console.log('fbeast uninstalled.');
  if (purge) {
    console.log('  Purged .fbeast/ directory and all stored data.');
  } else {
    console.log('  Stored data preserved in .fbeast/ — run with --purge to remove.');
  }
  console.log('  No traces left in Claude Code config.');
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  const root = process.cwd();
  const claudeDir = resolveClaudeConfigDir({
    cwd: root,
    homeDir: homedir(),
    exists: existsSync,
  });
  const purge = process.argv.includes('--purge') ? true : undefined;
  runUninstall({ root, claudeDir, purge }).catch((err) => {
    console.error('fbeast-uninstall failed:', err);
    process.exit(1);
  });
}

function defaultAsk(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    return Promise.resolve('');
  }

  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    const finish = (answer: string) => {
      process.stdin.off('data', onData);
      process.stdin.off('end', onEnd);
      process.stdin.off('error', onError);
      process.stdin.pause();
      resolve(answer);
    };
    const onData = (data: string | Buffer) => finish(String(data));
    const onEnd = () => finish('');
    const onError = () => finish('');

    process.stdin.once('data', onData);
    process.stdin.once('end', onEnd);
    process.stdin.once('error', onError);
  });
}
