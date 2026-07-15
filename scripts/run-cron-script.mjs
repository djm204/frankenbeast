#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { constants as osConstants } from 'node:os';

const USAGE = 'Usage: node scripts/run-cron-script.mjs --name <job-name> -- <command> [args...]';
const STDERR_TAIL_LIMIT = 4_096;
const KILL_GRACE_MS = Number.parseInt(process.env.CRON_SCRIPT_KILL_GRACE_MS ?? '5000', 10);
const EXIT_STDERR_DRAIN_MS = Number.parseInt(process.env.CRON_SCRIPT_EXIT_STDERR_DRAIN_MS ?? '50', 10);

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

function collectDescendantPids(rootPid) {
  const childrenByParent = new Map();
  try {
    for (const entry of readdirSync('/proc')) {
      if (!/^\d+$/.test(entry)) {
        continue;
      }
      try {
        const pid = Number.parseInt(entry, 10);
        const stat = readFileSync(`/proc/${entry}/stat`, 'utf8');
        const endOfCommand = stat.lastIndexOf(')');
        const fields = stat.slice(endOfCommand + 2).split(' ');
        const parentPid = Number.parseInt(fields[1] ?? '', 10);
        if (!Number.isFinite(parentPid)) {
          continue;
        }
        const siblings = childrenByParent.get(parentPid) ?? [];
        siblings.push(pid);
        childrenByParent.set(parentPid, siblings);
      } catch (error) {
        if (error?.code !== 'ENOENT' && error?.code !== 'EACCES' && error?.code !== 'EPERM') {
          throw error;
        }
      }
    }
  } catch {
    return [];
  }

  const descendants = [];
  const stack = [...(childrenByParent.get(rootPid) ?? [])];
  while (stack.length > 0) {
    const pid = stack.pop();
    if (!pid || descendants.includes(pid)) {
      continue;
    }
    descendants.push(pid);
    stack.push(...(childrenByParent.get(pid) ?? []));
  }
  return descendants;
}

function signalChildTree(child, signal) {
  if (!child.pid) {
    return [];
  }

  const signaledPids = [];
  if (process.platform !== 'win32') {
    try {
      process.kill(-child.pid, signal);
      signaledPids.push(-child.pid);
    } catch (error) {
      if (error?.code !== 'ESRCH') {
        // Fall back to explicit descendant signaling below.
      }
    }
    for (const pid of collectDescendantPids(child.pid).reverse()) {
      try {
        process.kill(pid, signal);
        signaledPids.push(pid);
      } catch (error) {
        if (error?.code !== 'ESRCH') {
          // Keep trying the rest of the tree even if one descendant refuses the signal.
        }
      }
    }
  }

  try {
    child.kill(signal);
    signaledPids.push(child.pid);
  } catch (error) {
    if (error?.code !== 'ESRCH') {
      throw error;
    }
  }
  return signaledPids;
}

function isSecretKey(value) {
  return /^--?[a-z0-9_-]*(?:token|secret|password|passwd|credential|authorization|api[-_]?key|access[-_]?key|private[-_]?key|ssh[-_]?key|gpg[-_]?key|signing[-_]?key)[a-z0-9_-]*$/i.test(value);
}

function isAuthScheme(value) {
  return /^(?:Bearer|Basic|Digest|ApiKey|Token)$/i.test(value);
}

function redactSensitiveText(value) {
  const raw = typeof value === 'string' ? value : String(value ?? '');
  return raw
    .replace(/(["'](?:token|secret|password|passwd|credential|authorization|api[-_]?key|access[-_]?key|private[-_]?key|ssh[-_]?key|gpg[-_]?key|signing[-_]?key|access_token)["']\s*:\s*)(["'])(.*?)\2/gi, '$1$2[REDACTED]$2')
    .replace(/(\\["'](?:token|secret|password|passwd|credential|authorization|api[-_]?key|access[-_]?key|private[-_]?key|ssh[-_]?key|gpg[-_]?key|signing[-_]?key|access_token)\\["']\s*:\s*\\["'])(.*?)(\\["'])/gi, '$1[REDACTED]$3')
    .replace(/\b([A-Z0-9_]*(?:AUTHORIZATION)[A-Z0-9_]*\s*[:=]\s*)(Bearer|Basic|Digest|ApiKey|Token)\s+([^\s"']+)/gi, '$1$2 [REDACTED]')
    .replace(/\b([A-Z0-9_]*(?:PASSWORD|PASSWD|SECRET|PRIVATE[-_]?KEY|SSH[-_]?KEY|GPG[-_]?KEY|SIGNING[-_]?KEY)[A-Z0-9_]*\s*[:=]\s*)([^\n\r,;]+)/gi, '$1[REDACTED]')
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)([^\s/@:]+):([^\s/@]+)@/gi, '$1[REDACTED]:[REDACTED]@')
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)([^\s/@:]+)@/gi, '$1[REDACTED]@')
    .replace(/\b(Authorization\s*:\s*)(Bearer|Basic|Digest|ApiKey|Token)\s+(?:"[^"]*"|'[^']*'|[^\s"']+)/gi, '$1$2 [REDACTED]')
    .replace(/\b((?:token|secret|password|passwd|credential|api[-_]?key|access[-_]?key|private[-_]?key|ssh[-_]?key|gpg[-_]?key|signing[-_]?key)\s*[:=]\s*)\\(["'])(.*?)\\\2/gi, '$1\\$2[REDACTED]\\$2')
    .replace(/\b((?:token|secret|password|passwd|credential|api[-_]?key|access[-_]?key|private[-_]?key|ssh[-_]?key|gpg[-_]?key|signing[-_]?key)\s*[:=]\s*)(\\["'])(.*?)(\\["'])/gi, '$1$2[REDACTED]$4')
    .replace(/\b((?:token|secret|password|passwd|credential|api[-_]?key|access[-_]?key|private[-_]?key|ssh[-_]?key|gpg[-_]?key|signing[-_]?key)\s*[:=]\s*)(["'])(.*?)\2/gi, '$1$2[REDACTED]$2')
    .replace(/\b((?:token|secret|password|passwd|credential|api[-_]?key|access[-_]?key|private[-_]?key|ssh[-_]?key|gpg[-_]?key|signing[-_]?key)\s*[:=]\s*)([^\s"']+)/gi, '$1[REDACTED]')
    .replace(/\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTHORIZATION|API[-_]?KEY|ACCESS[-_]?KEY|PRIVATE[-_]?KEY|SSH[-_]?KEY|GPG[-_]?KEY|SIGNING[-_]?KEY)[A-Z0-9_]*)=\\(["'])(.*?)\\\2/gi, '$1=\\$2[REDACTED]\\$2')
    .replace(/\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTHORIZATION|API[-_]?KEY|ACCESS[-_]?KEY|PRIVATE[-_]?KEY|SSH[-_]?KEY|GPG[-_]?KEY|SIGNING[-_]?KEY)[A-Z0-9_]*)=(["'])(.*?)\2/gi, '$1=$2[REDACTED]$2')
    .replace(/\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTHORIZATION|API[-_]?KEY|ACCESS[-_]?KEY|PRIVATE[-_]?KEY|SSH[-_]?KEY|GPG[-_]?KEY|SIGNING[-_]?KEY)[A-Z0-9_]*)=([^\s"']+)/gi, '$1=[REDACTED]');
}

function redactCommand(command) {
  const redacted = [];
  let redactNextParts = 0;

  for (const part of command) {
    if (redactNextParts > 0) {
      redacted.push('[REDACTED]');
      redactNextParts = isAuthScheme(part) ? 1 : redactNextParts - 1;
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
        redactNextParts = 1;
      }
      continue;
    }

    redacted.push(redactSensitiveText(part));
  }

  return redacted;
}

function redactMessage(message, command) {
  const raw = typeof message === 'string' ? message : String(message ?? '');
  const redactedCommand = redactCommand(command);
  let redacted = raw;

  for (let index = 0; index < command.length; index += 1) {
    const original = command[index];
    const replacement = redactedCommand[index];
    if (!original || original === replacement) {
      continue;
    }
    redacted = redacted.split(original).join(replacement);
  }

  return redactSensitiveText(redacted);
}

function spawnFailureExitCode(error) {
  return error?.code === 'EACCES' || error?.code === 'EPERM' ? 126 : 127;
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
    message: redactMessage(message, command),
    stderrTail: redactSensitiveText(stderrTail),
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
  let parentTerminationEnvelopeEmitted = false;
  let parentTerminationPids = [];
  let parentTerminationProcessGroup = null;

  return await new Promise((resolve) => {
    let child;
    let exitDrainTimer;
    let exitResult = null;

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
      if (exitDrainTimer) {
        clearTimeout(exitDrainTimer);
        exitDrainTimer = null;
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

    const emitParentTerminationEnvelope = () => {
      if (parentTerminationEnvelopeEmitted || parentTerminationExitCode === null) {
        return;
      }
      parentTerminationEnvelopeEmitted = true;
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
    };

    const killTrackedParentTerminationProcesses = (signal) => {
      if (parentTerminationProcessGroup && process.platform !== 'win32') {
        try {
          process.kill(-parentTerminationProcessGroup, signal);
        } catch (error) {
          if (error?.code !== 'ESRCH') {
            // Keep trying the explicitly tracked processes below.
          }
        }
      }
      for (const pid of parentTerminationPids) {
        try {
          process.kill(pid, signal);
        } catch (error) {
          if (error?.code !== 'ESRCH') {
            // Keep trying the rest of the previously tracked process tree.
          }
        }
      }
      if (child) {
        signalChildTree(child, signal);
      }
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
        parentTerminationProcessGroup = child.pid ?? null;
        parentTerminationPids = signalChildTree(child, signal);
        forceKillTimer = setTimeout(() => {
          forceKillTimer = null;
          emitParentTerminationEnvelope();
          killTrackedParentTerminationProcesses('SIGKILL');
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

    const finishChildResult = (code, signal) => {
      if (settled) {
        return;
      }
      if (parentTerminationExitCode !== null) {
        emitParentTerminationEnvelope();
        if (forceKillTimer) {
          clearTimeout(forceKillTimer);
          forceKillTimer = null;
        }
        killTrackedParentTerminationProcesses('SIGKILL');
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
    };

    const scheduleExitDrainFinish = () => {
      if (!exitResult) {
        return;
      }
      if (exitDrainTimer) {
        clearTimeout(exitDrainTimer);
      }
      exitDrainTimer = setTimeout(() => {
        exitDrainTimer = null;
        child.stderr?.destroy();
        finishChildResult(exitResult.code, exitResult.signal);
      }, EXIT_STDERR_DRAIN_MS);
    };

    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      stderrTail = appendTail(stderrTail, text);
      stderrNeedsBoundary = !text.endsWith('\n');
      process.stderr.write(chunk);
      if (exitResult) {
        scheduleExitDrainFinish();
      }
    });

    child.on('error', (error) => {
      const durationMs = Date.now() - started;
      const exitCode = spawnFailureExitCode(error);
      emitEnvelope({
        script: name,
        command,
        exitCode,
        failureKind: 'spawn',
        message: redactMessage(error.message, command),
        stderrTail,
        durationMs,
        recoverable,
      });
      finish(exitCode);
    });

    child.on('exit', (code, signal) => {
      if (parentTerminationExitCode === null && code === 0 && !signal) {
        child.stderr?.destroy();
        finishChildResult(code, signal);
        return;
      }
      exitResult = { code, signal };
      scheduleExitDrainFinish();
    });

    child.on('close', (code, signal) => {
      finishChildResult(code, signal);
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
