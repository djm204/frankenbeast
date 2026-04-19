#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createGovernorAdapter, type GovernorAdapter } from '../adapters/governor-adapter.js';
import { createObserverAdapter, type ObserverAdapter } from '../adapters/observer-adapter.js';

export interface HookDeps {
  governor: GovernorAdapter;
  observer: ObserverAdapter;
  sessionId(): string;
}

export function defaultHookDeps(dbPath?: string): HookDeps {
  const resolved = dbPath ?? join(process.cwd(), '.fbeast', 'beast.db');

  return {
    governor: createGovernorAdapter(resolved),
    observer: createObserverAdapter(resolved),
    sessionId: () =>
      process.env['FBEAST_SESSION_ID']
      ?? process.env['CLAUDE_SESSION_ID']
      ?? randomUUID(),
  };
}

export async function runHook(
  argv: string[] = process.argv.slice(2),
  deps?: HookDeps,
): Promise<void> {
  // Extract --db flag before parsing positional args
  let dbPath: string | undefined;
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--db' && i + 1 < argv.length) {
      dbPath = argv[++i];
    } else if (argv[i]?.startsWith('--db=')) {
      dbPath = argv[i]!.slice(5);
    } else {
      positionals.push(argv[i]!);
    }
  }

  const resolvedDeps = deps ?? defaultHookDeps(dbPath);
  const [phase, toolName = '', payload = ''] = positionals;

  if (phase === 'pre-tool') {
    const decision = await resolvedDeps.governor.check({ action: toolName, context: payload });
    if (decision.decision !== 'approved') {
      process.stderr.write(`${decision.reason}\n`);
      process.exitCode = 1;
      return;
    }

    process.stdout.write(JSON.stringify({ allowed: true, decision: decision.decision }) + '\n');
    return;
  }

  if (phase === 'post-tool') {
    await resolvedDeps.observer.log({
      event: 'tool_call',
      metadata: JSON.stringify({ toolName, payload, phase }),
      sessionId: resolvedDeps.sessionId(),
    });
    process.stdout.write(JSON.stringify({ logged: true }) + '\n');
    return;
  }

  if (phase !== 'pre-tool' && phase !== 'post-tool') {
    throw new Error('Usage: fbeast-hook <pre-tool|post-tool> ...');
  }
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  runHook().catch((error) => {
    console.error('fbeast-hook failed:', error);
    process.exit(1);
  });
}
