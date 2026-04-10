#!/usr/bin/env node
import { parseArgs } from 'node:util';

export async function runHook(argv: string[] = process.argv.slice(2)): Promise<void> {
  const { positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: false,
  });

  const phase = positionals[0];
  if (phase !== 'pre-tool' && phase !== 'post-tool') {
    throw new Error('Usage: fbeast-hook <pre-tool|post-tool> ...');
  }

  process.stdout.write(JSON.stringify({ phase, ok: true }) + '\n');
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  runHook().catch((error) => {
    console.error('fbeast-hook failed:', error);
    process.exit(1);
  });
}
