#!/usr/bin/env node
import { spawn } from 'node:child_process';

const RETRY_ENV = 'CI_TEST_RETRIES';
const DEFAULT_RETRIES = 0;

function parseRetryCount(value) {
  if (value === undefined || value === '') {
    return DEFAULT_RETRIES;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${RETRY_ENV} must be a non-negative integer, got ${JSON.stringify(value)}`);
  }

  return parsed;
}

function splitCommand(argv) {
  const separatorIndex = argv.indexOf('--');
  const command = separatorIndex === -1 ? argv : argv.slice(separatorIndex + 1);
  if (command.length === 0 || command[0] === '') {
    throw new Error('Usage: node scripts/retry-ci-command.mjs -- <command> [args...]');
  }
  return command;
}

function runOnce(command, args, attempt, totalAttempts) {
  console.error(`[ci-retry] attempt ${attempt}/${totalAttempts}: ${[command, ...args].join(' ')}`);

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env,
    });

    child.on('error', (error) => {
      console.error(`[ci-retry] failed to start command: ${error.message}`);
      resolve(127);
    });

    child.on('close', (code, signal) => {
      if (signal) {
        console.error(`[ci-retry] command terminated by signal ${signal}`);
        resolve(128);
        return;
      }
      resolve(code ?? 1);
    });
  });
}

async function main() {
  const [command, ...args] = splitCommand(process.argv.slice(2));
  const retries = parseRetryCount(process.env[RETRY_ENV]);
  const totalAttempts = retries + 1;

  let lastExitCode = 1;
  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    lastExitCode = await runOnce(command, args, attempt, totalAttempts);
    if (lastExitCode === 0) {
      if (attempt > 1) {
        console.error(`[ci-retry] command succeeded on retry attempt ${attempt}`);
      }
      return;
    }

    if (attempt < totalAttempts) {
      console.error(`[ci-retry] command failed with exit code ${lastExitCode}; retrying`);
    }
  }

  console.error(`[ci-retry] command failed after ${totalAttempts} attempt(s)`);
  process.exitCode = lastExitCode;
}

main().catch((error) => {
  console.error(`[ci-retry] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
