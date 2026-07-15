#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { constants as osConstants } from 'node:os';

const USAGE = 'Usage: node scripts/run-cron-script.mjs --name <job-name> -- <command> [args...]';
const STDERR_TAIL_LIMIT = 4_096;
const KILL_GRACE_MS = Number.parseInt(process.env.CRON_SCRIPT_KILL_GRACE_MS ?? '5000', 10);

function nowIso() {
  return new Date().toISOString();
}

function parseArgs(argv) {
  const separatorIndex = argv.indexOf('--');
  const optionArgs = separatorIndex === -1 ? argv : argv.slice(0, separatorIndex);
  const command = separatorIndex === -1 ? [] : argv.slice(separatorIndex + 1);

  let name;
  let recoverable = false;
  for (let index = 0; index < optionArgs.length; index += 1) {
    const arg = optionArgs[index];
    if (arg === '--name') {
      name = optionArgs[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--recoverable') {
      recoverable = true;
      continue;
    }
    throw Object.assign(new Error(`${USAGE}; unknown option ${JSON.stringify(arg)}`), {
      exitCode: 2,
      failureKind: 'usage',
      scriptName: name || 'unknown',
    });
  }

  if (!name || name.startsWith('--') || command.length === 0 || command[0] === '') {
    throw Object.assign(new Error(USAGE), { exitCode: 2, failureKind: 'usage', scriptName: name || 'unknown' });
  }

  return { name, recoverable, command };
}

function appendTail(current, chunk) {
  const next = `${current}${chunk}`;
  if (next.length <= STDERR_TAIL_LIMIT) {
    return next;
  }
  return next.slice(next.length - STDERR_TAIL_LIMIT);
}

function signalExitCode(signal) {
  const signalNumber = osConstants.signals[signal];
  return typeof signalNumber === 'number' ? 128 + signalNumber : 128;
}

function signalChildTree(child, signal) {
  if (!child.pid) {
    return;
  }

  if (process.platform !== 'win32') {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      if (error?.code !== 'ESRCH') {
        child.kill(signal);
      }
      return;
    }
  }

  child.kill(signal);
}

function isSecretKey(value) {
  return /(?:token|secret|password|passwd|credential|authorization|api[-_]?key|access[-_]?key)/i.test(value);
}

function redactCommand(command) {
  const redacted = [];
  let redactNext = false;

  for (const part of command) {
    if (redactNext) {
      redacted.push('[REDACTED]');
      redactNext = false;
      continue;
    }

    const equalsIndex = part.indexOf('=');
    if (equalsIndex > 0 && isSecretKey(part.slice(0, equalsIndex))) {
      redacted.push(`${part.slice(0, equalsIndex + 1)}[REDACTED]`);
      continue;
    }

    if (isSecretKey(part)) {
      redacted.push('[REDACTED]');
      if (part.startsWith('-') && !part.includes('=')) {
        redactNext = true;
      }
      continue;
    }

    redacted.push(part);
  }

  return redacted;
}

function writeEnvelope({ script, command, exitCode, signal = null, failureKind = 'exit', message, stderrTail = '', durationMs, recoverable = false }) {
  const envelope = {
    schemaVersion: 1,
    type: 'franken.cron.script.error',
    timestamp: nowIso(),
    script,
    command: redactCommand(command),
    failureKind,
    exitCode,
    signal,
    durationMs,
    recoverable,
    message,
    stderrTail,
  };
  process.stderr.write(`${JSON.stringify(envelope)}\n`);
}

async function runCronScript({ name, recoverable, command }) {
  const started = Date.now();
  const [bin, ...args] = command;
  let stderrTail = '';
  let stderrNeedsBoundary = false;
  let settled = false;
  let forceKillTimer;
  let parentTerminationExitCode = null;
  let parentTerminationSignal = null;
  let parentTerminationMessage = null;

  return await new Promise((resolve) => {
    let child;

    const signalHandlers = {
      SIGINT: () => handleParentSignal('SIGINT'),
      SIGTERM: () => handleParentSignal('SIGTERM'),
      SIGHUP: () => handleParentSignal('SIGHUP'),
    };

    const finish = (exitCode) => {
      if (settled) {
        return;
      }
      settled = true;
      for (const signal of Object.keys(signalHandlers)) {
        process.off(signal, signalHandlers[signal]);
      }
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
      }
      resolve(exitCode);
    };

    const emitEnvelope = (details) => {
      if (stderrNeedsBoundary) {
        process.stderr.write('\n');
        stderrNeedsBoundary = false;
      }
      writeEnvelope(details);
    };

    function handleParentSignal(signal) {
      if (settled || parentTerminationExitCode !== null) {
        return;
      }
      const exitCode = signalExitCode(signal);
      parentTerminationExitCode = exitCode;
      parentTerminationSignal = signal;
      parentTerminationMessage = `cron wrapper received ${signal} and terminated child script`;
      if (child && !child.killed) {
        signalChildTree(child, signal);
        forceKillTimer = setTimeout(() => {
          signalChildTree(child, 'SIGKILL');
          finish(parentTerminationExitCode);
        }, KILL_GRACE_MS);
      }
    }

    child = spawn(bin, args, {
      cwd: process.cwd(),
      env: process.env,
      shell: process.platform === 'win32',
      detached: process.platform !== 'win32',
      stdio: ['inherit', 'inherit', 'pipe'],
    });

    for (const signal of Object.keys(signalHandlers)) {
      process.on(signal, signalHandlers[signal]);
    }

    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      stderrTail = appendTail(stderrTail, text);
      stderrNeedsBoundary = !text.endsWith('\n');
      if (!process.stderr.write(chunk)) {
        child.stderr.pause();
        process.stderr.once('drain', () => {
          child.stderr.resume();
        });
      }
    });

    child.on('error', (error) => {
      const durationMs = Date.now() - started;
      emitEnvelope({
        script: name,
        command,
        exitCode: 127,
        failureKind: 'spawn',
        message: error.message,
        stderrTail,
        durationMs,
        recoverable,
      });
      finish(127);
    });

    child.on('close', (code, signal) => {
      if (settled) {
        return;
      }
      if (parentTerminationExitCode !== null) {
        const durationMs = Date.now() - started;
        emitEnvelope({
          script: name,
          command,
          exitCode: parentTerminationExitCode,
          signal: parentTerminationSignal,
          failureKind: 'signal',
          message: parentTerminationMessage,
          stderrTail,
          durationMs,
          recoverable,
        });
        if (forceKillTimer) {
          return;
        }
        finish(parentTerminationExitCode);
        return;
      }
      const exitCode = signal ? signalExitCode(signal) : (code ?? 1);
      if (exitCode !== 0) {
        const durationMs = Date.now() - started;
        emitEnvelope({
          script: name,
          command,
          exitCode,
          signal: signal ?? null,
          failureKind: signal ? 'signal' : 'exit',
          message: signal ? `cron script terminated by signal ${signal}` : `cron script exited with code ${exitCode}`,
          stderrTail,
          durationMs,
          recoverable,
        });
      }
      finish(exitCode);
    });
  });
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  process.exitCode = await runCronScript(config);
}

main().catch((error) => {
  const exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  const failureKind = typeof error?.failureKind === 'string' ? error.failureKind : 'internal';
  const script = typeof error?.scriptName === 'string' ? error.scriptName : 'unknown';
  writeEnvelope({
    script,
    command: [],
    exitCode,
    failureKind,
    message: error instanceof Error ? error.message : String(error),
    durationMs: 0,
  });
  process.exitCode = exitCode;
});
