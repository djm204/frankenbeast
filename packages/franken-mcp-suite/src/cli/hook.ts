#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createGovernorAdapter, type GovernorAdapter } from '../adapters/governor-adapter.js';
import { createObserverAdapter, type ObserverAdapter } from '../adapters/observer-adapter.js';

/** Env var carrying the governor context (policy-relevant command text). */
export const TOOL_CONTEXT_ENV = 'FBEAST_TOOL_CONTEXT';

export interface HookDeps {
  governor: GovernorAdapter;
  observer: ObserverAdapter;
  sessionId(): string;
  /**
   * Reads the governor context (policy-relevant command text). Untrusted payload
   * text is transported out-of-band from argv (via the FBEAST_TOOL_CONTEXT env
   * var) so it can never be parsed as a CLI flag. Reading from the environment
   * rather than stdin is also non-blocking.
   */
  readContext(): string;
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
    readContext: () => process.env[TOOL_CONTEXT_ENV] ?? '',
  };
}

export async function runHook(
  argv: string[] = process.argv.slice(2),
  deps?: HookDeps,
): Promise<void> {
  // Extract --db flag before parsing positional args. A bare `--` terminates
  // option parsing so any following token (e.g. an untrusted tool name) is never
  // interpreted as a flag.
  let dbPath: string | undefined;
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg === '--db' && i + 1 < argv.length) {
      dbPath = argv[++i];
    } else if (arg.startsWith('--db=')) {
      dbPath = arg.slice(5);
    } else {
      positionals.push(arg);
    }
  }

  const resolvedDeps = deps ?? defaultHookDeps(dbPath);
  const [phase, toolName = '', payload = ''] = positionals;

  if (phase === 'pre-tool') {
    // The governor context (command text) arrives via the FBEAST_TOOL_CONTEXT
    // env var, never argv, so it cannot be consumed as a flag. It is not
    // truncated; an over-limit command fails the exec and is denied (fail-closed).
    // Fall back to the positional payload for direct/legacy callers
    // (`fbeast-hook pre-tool <tool> <payload>`) so they keep governance coverage
    // when the env var is unset.
    const context = resolvedDeps.readContext() || payload;
    const decision = await resolvedDeps.governor.check({ action: toolName, context });
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

const isMain = (await import('../shared/is-main.js')).isMain(import.meta.url);
if (isMain) {
  runHook().catch((error) => {
    console.error('fbeast-hook failed:', error);
    process.exit(1);
  });
}
