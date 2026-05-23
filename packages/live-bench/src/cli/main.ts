#!/usr/bin/env node

import { loadCorpus } from '../corpus/loader.js';

const command = process.argv[2] ?? 'help';

if (command === 'help' || command === '--help' || command === '-h') {
  console.log(`fbeast-live-bench

Usage:
  fbeast-live-bench list <corpus-root>

Commands:
  list    Load and print benchmark task ids from a corpus root
`);
  process.exit(0);
}

if (command === 'list') {
  const corpusRoot = process.argv[3];
  if (!corpusRoot) {
    console.error('Usage: fbeast-live-bench list <corpus-root>');
    process.exit(2);
  }

  const tasks = loadCorpus(corpusRoot);
  for (const task of tasks) {
    console.log(task.taskId);
  }
  process.exit(0);
}

console.error(`Unknown command: ${command}`);
process.exit(2);
