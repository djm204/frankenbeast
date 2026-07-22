#!/usr/bin/env node

function printLine(...args: unknown[]): void {
  console.info(...args);
}


import { loadCorpusWithDiagnostics } from '../corpus/loader.js';
import {
  evaluateWorkflowRegression,
  loadWorkflowRegressionCandidateResults,
  loadWorkflowRegressionFixtures,
} from '../learning/regression.js';

const command = process.argv[2] ?? 'help';

if (command === 'help' || command === '--help' || command === '-h') {
  printLine(`fbeast-live-bench

Usage:
  fbeast-live-bench list <corpus-root>
  fbeast-live-bench learning-regression <fixture-root> <baseline-results.json> <candidate-results.json> [--min-pass-rate N] [--min-delta N]

Commands:
  list                 Load and print benchmark task ids from a corpus root
  learning-regression  Dry-run learned workflow changes against regression fixtures and print a JSON pass/fail delta report
`);
  process.exit(0);
}

if (command === 'list') {
  const corpusRoot = process.argv[3];
  if (!corpusRoot || process.argv.length !== 4) {
    console.error('Usage: fbeast-live-bench list <corpus-root>');
    process.exit(2);
  }

  const result = loadCorpusWithDiagnostics(corpusRoot);
  for (const task of result.tasks) {
    printLine(task.taskId);
  }
  if (result.quarantined.length > 0) {
    console.error(JSON.stringify({
      type: 'live-bench-corpus-quarantine',
      count: result.quarantined.length,
      tasks: result.quarantined,
    }, null, 2));
  }
  process.exit(0);
}

if (command === 'learning-regression') {
  const fixtureRoot = process.argv[3];
  const baselinePath = process.argv[4];
  const candidatePath = process.argv[5];
  if (!fixtureRoot || !baselinePath || !candidatePath) {
    console.error('Usage: fbeast-live-bench learning-regression <fixture-root> <baseline-results.json> <candidate-results.json> [--min-pass-rate N] [--min-delta N]');
    process.exit(2);
  }

  let options: { minPassRate?: number; minDelta?: number };
  try {
    options = parseLearningRegressionOptions(process.argv.slice(6));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
  let report: ReturnType<typeof evaluateWorkflowRegression>;
  try {
    report = evaluateWorkflowRegression(
      loadWorkflowRegressionFixtures(fixtureRoot),
      loadWorkflowRegressionCandidateResults(baselinePath),
      loadWorkflowRegressionCandidateResults(candidatePath),
      options,
    );
  } catch (error) {
    if (isThresholdUsageError(error)) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(2);
    }
    throw error;
  }
  printLine(JSON.stringify(report, null, 2));
  process.exit(report.passed ? 0 : 1);
}

console.error(`Unknown command: ${command}`);
process.exit(2);

function parseLearningRegressionOptions(args: readonly string[]): { minPassRate?: number; minDelta?: number } {
  const options: { minPassRate?: number; minDelta?: number } = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--min-pass-rate') {
      options.minPassRate = parseRequiredNumber(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--min-delta') {
      options.minDelta = parseRequiredNumber(args, index, arg);
      index += 1;
      continue;
    }
    throw new Error(`Unknown learning-regression option: ${arg}`);
  }
  return options;
}

function parseRequiredNumber(args: readonly string[], index: number, flag: string): number {
  const value = args[index + 1];
  if (value === undefined) {
    throw new Error(`Missing value for ${flag}`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number for ${flag}: ${value}`);
  }
  return parsed;
}

function isThresholdUsageError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /^min(?:PassRate|Delta) must be a finite number between /.test(error.message);
}
