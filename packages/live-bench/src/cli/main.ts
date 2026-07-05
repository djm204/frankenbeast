#!/usr/bin/env node

function printLine(...args: unknown[]): void {
  console.info(...args);
}


import { loadCorpus } from '../corpus/loader.js';

const command = process.argv[2] ?? 'help';

if (command === 'help' || command === '--help' || command === '-h') {
  printLine(`fbeast-live-bench

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
    printLine(task.taskId);
  }
  process.exit(0);
}

console.error(`Unknown command: ${command}`);
process.exit(2);
