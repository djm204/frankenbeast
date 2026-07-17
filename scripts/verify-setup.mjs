#!/usr/bin/env node
// Usage: npm run local:verify-setup
// Usage: node scripts/verify-setup.mjs [--dry-run] [--env-file <path>] [--json] [--require-services]
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { connect } from 'node:net';
function printLine(...args) {
    console.info(...args);
}
const REQUIRED_BOOTSTRAP_ENV_VARS = [
    'CHROMA_URL',
    'FRANKEN_MAX_TOTAL_TOKENS',
    'FRANKEN_MAX_DURATION_MS',
    'FRANKEN_MAX_CRITIQUE_ITERATIONS',
    'FRANKEN_ENABLE_HEARTBEAT',
    'FRANKEN_ENABLE_TRACING',
    'FRANKEN_ENABLE_REFLECTION',
    'FRANKEN_MIN_CRITIQUE_SCORE',
];
const COMMON_LOCAL_PORTS = [
    { id: 'port-3000', name: 'Port 3000', port: 3000, service: 'Grafana/dashboard dev server' },
    { id: 'port-8000', name: 'Port 8000', port: 8000, service: 'ChromaDB' },
    { id: 'port-3200', name: 'Port 3200', port: 3200, service: 'Tempo' },
    { id: 'port-4317', name: 'Port 4317', port: 4317, service: 'Tempo OTLP gRPC' },
    { id: 'port-4318', name: 'Port 4318', port: 4318, service: 'Tempo OTLP HTTP' },
];
const results = [];
function parseOptions(argv) {
    const options = { dryRun: false, envFile: '.env', json: false, requireServices: false };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--dry-run') {
            options.dryRun = true;
            continue;
        }
        if (arg === '--json') {
            options.json = true;
            continue;
        }
        if (arg === '--require-services') {
            options.requireServices = true;
            continue;
        }
        if (arg === '--env-file') {
            const value = argv[i + 1];
            if (!value) {
                throw new Error('--env-file requires a path');
            }
            options.envFile = value;
            i += 1;
            continue;
        }
        if (arg.startsWith('--env-file=')) {
            const value = arg.slice('--env-file='.length);
            if (!value) {
                throw new Error('--env-file requires a path');
            }
            options.envFile = value;
            continue;
        }
        if (arg === '-h' || arg === '--help') {
            printLine('Usage: node scripts/verify-setup.mjs [--dry-run] [--env-file <path>] [--json] [--require-services]');
            process.exit(0);
        }
        throw new Error(`Unknown argument: ${arg}`);
    }
    return options;
}
function check(id, name, ok, detail, action = null, required = true) {
    results.push({ id, name, status: ok ? 'ok' : 'fail', ok, required, detail, action });
}
function warn(id, name, detail, action = null) {
    results.push({ id, name, status: 'warn', ok: true, required: false, detail, action });
}
function parseEnvFile(path) {
    const env = new Map();
    if (!existsSync(path)) {
        return env;
    }
    for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/u)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) {
            continue;
        }
        const equalsIndex = line.indexOf('=');
        if (equalsIndex <= 0) {
            continue;
        }
        const key = line.slice(0, equalsIndex).trim();
        const value = line.slice(equalsIndex + 1).trim().replace(/^(?:"|')|(?:"|')$/gu, '');
        env.set(key, value);
    }
    return env;
}
function runCommand(command) {
    try {
        return {
            ok: true,
            stdout: execSync(command, {
                encoding: 'utf8',
                shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
                stdio: ['ignore', 'pipe', 'pipe'],
            }).trim(),
        };
    }
    catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
}
function checkNodeVersion() {
    // Node version
    const [major, minor, patch] = process.versions.node.split('.').map(Number);
    const meetsMinimumNode = (major === 22 && (minor > 13 || (minor === 13 && patch >= 0))) ||
        (major >= 24 && major < 26);
    check('node-version', 'Node.js >=22.13.0 <23 || >=24.0.0 <26', meetsMinimumNode, `v${process.versions.node}`, 'Install Node.js 22.13.x or a supported 24/25 release, then re-run npm commands from the repository root.');
}
function checkNpmPackageManager() {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
    const expected = manifest.packageManager?.match(/^npm@(\d+\.\d+\.\d+)$/u)?.[1];
    if (!expected) {
        check('npm-package-manager', 'packageManager declares npm', false, manifest.packageManager ?? 'missing', 'Set packageManager to npm@<version> in package.json.');
        return;
    }
    const actual = runCommand('npm --version');
    if (actual.ok === false) {
        check('npm-package-manager', 'npm matches packageManager', false, actual.message, 'Install npm via Corepack: corepack enable npm && corepack prepare npm@11.5.1 --activate.');
        return;
    }
    check('npm-package-manager', 'npm matches packageManager', actual.stdout === expected, `expected ${expected}, found ${actual.stdout}`, `Run corepack enable npm && corepack prepare npm@${expected} --activate, then retry.`);
}
function checkDependencyInstallState(dryRun) {
    if (dryRun) {
        check('dependencies-installed', 'Workspace dependencies installed', true, 'Skipping dependency install-state check in dry-run mode', 'Run npm ci before non-dry-run verification.');
        return;
    }
    const hasLockfile = existsSync('package-lock.json');
    const hasNodeModules = existsSync('node_modules');
    check('dependencies-installed', 'Workspace dependencies installed', hasLockfile && hasNodeModules, hasLockfile && hasNodeModules
        ? 'package-lock.json and node_modules are present'
        : `package-lock.json ${hasLockfile ? 'present' : 'missing'}; node_modules ${hasNodeModules ? 'present' : 'missing'}`, 'Run npm ci from the repository root to install the locked workspace dependencies.');
}
function checkGitHubAuth(required = true) {
    const ghVersion = runCommand('gh --version');
    if (ghVersion.ok === false) {
        if (required) {
            check('github-auth', 'GitHub CLI authenticated', false, 'gh command not found or not executable', 'Install GitHub CLI, then run gh auth login --hostname github.com.');
        }
        else {
            warn('github-auth', 'GitHub CLI authenticated', 'Optional GitHub auth check skipped because gh is unavailable', 'Install GitHub CLI and run gh auth login --hostname github.com before opening PRs.');
        }
        return;
    }
    const auth = runCommand('gh auth status --hostname github.com');
    if (auth.ok === false && !required) {
        warn('github-auth', 'GitHub CLI authenticated', 'Optional GitHub auth check skipped because gh is not authenticated', 'Run gh auth login --hostname github.com before opening PRs.');
        return;
    }
    if (auth.ok === true) {
        check('github-auth', 'GitHub CLI authenticated', true, 'gh auth status --hostname github.com succeeded', 'Run gh auth login --hostname github.com and select an account with access to djm204/frankenbeast.');
    }
    else {
        check('github-auth', 'GitHub CLI authenticated', false, auth.message, 'Run gh auth login --hostname github.com and select an account with access to djm204/frankenbeast.');
    }
}
function checkGitStatus() {
    const root = runCommand('git rev-parse --show-toplevel');
    if (root.ok === false) {
        check('git-worktree', 'Git worktree readable', false, root.message, 'Run the healthcheck inside a Frankenbeast git checkout or recreate the worktree.');
        return;
    }
    const status = runCommand('git status --short');
    if (status.ok === false) {
        check('git-worktree', 'Git worktree readable', false, status.message, 'Repair the git checkout, resolve index errors, or recreate the worktree.');
        return;
    }
    if (status.stdout.length > 0) {
        warn('git-worktree-clean', 'Git worktree clean', `${status.stdout.split(/\r?\n/u).length} uncommitted path(s)`, 'Commit, stash, or move unrelated changes before running issue-to-PR automation.');
        return;
    }
    check('git-worktree-clean', 'Git worktree clean', true, 'No uncommitted files');
}
function checkRequiredBootstrapEnv(path, parsed) {
    const missing = REQUIRED_BOOTSTRAP_ENV_VARS.filter((key) => {
        const value = process.env[key] ?? parsed.get(key);
        return value === undefined || value === '';
    });
    check('required-bootstrap-env-vars', 'Required bootstrap env vars', missing.length === 0, missing.length === 0 ? `Found in ${path} or process.env` : `Missing: ${missing.join(', ')}`, `Copy .env.example to ${path} and fill the missing FRANKEN_* values before bootstrapping.`);
}
async function checkHttp(name, url, required = false) {
    const id = `http-${name.toLowerCase().replace(/[^a-z0-9]+/gu, '-')}`;
    const optionalAction = 'If this optional service is required for your task, start it with docker compose up -d and re-run npm run local:verify-setup.';
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
        if (res.ok || required) {
            check(id, name, res.ok, `${res.status} ${res.statusText}`, 'Start optional services with docker compose up -d, or run npm run bootstrap -- --with-docker before retrying.', required);
        }
        else {
            warn(id, name, `${res.status} ${res.statusText}`, optionalAction);
        }
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        if (required) {
            check(id, name, false, detail, 'Start optional services with docker compose up -d, verify the service port is reachable, then retry.', true);
        }
        else {
            warn(id, name, detail, optionalAction);
        }
    }
}
function probePort(port, timeoutMs = 500) {
    return new Promise((resolve) => {
        const socket = connect({ host: '127.0.0.1', port });
        const done = (open) => {
            socket.removeAllListeners();
            socket.destroy();
            resolve(open);
        };
        socket.setTimeout(timeoutMs);
        socket.once('connect', () => done(true));
        socket.once('timeout', () => done(false));
        socket.once('error', () => done(false));
    });
}
async function checkCommonLocalPorts(requireServices = false) {
    for (const portCheck of COMMON_LOCAL_PORTS) {
        const open = await probePort(portCheck.port);
        const detail = open
            ? `${portCheck.service} port ${portCheck.port} is accepting TCP connections`
            : `${portCheck.service} port ${portCheck.port} is not accepting TCP connections`;
        if (open) {
            if (requireServices) {
                check(portCheck.id, portCheck.name, true, detail, `If this is not the expected ${portCheck.service} process, stop the conflicting service before starting Frankenbeast local infrastructure.`, false);
            }
            else {
                warn(portCheck.id, portCheck.name, detail, `If this is not the expected ${portCheck.service} process, stop the conflicting service before starting Frankenbeast local infrastructure.`);
            }
        }
        else {
            warn(portCheck.id, portCheck.name, detail, `If ${portCheck.service} is required for your task, start it with docker compose up -d and re-run the healthcheck.`);
        }
    }
}
function printHumanSummary(options) {
    printLine(`Verifying Frankenbeast local setup${options.dryRun ? ' (dry-run)' : ''}...\n`);
    printLine('Results:\n');
    for (const result of results) {
        const icon = result.status === 'ok' ? '\u2713' : result.status === 'warn' ? '!' : '\u2717';
        printLine(`  ${icon} ${result.name}: ${result.detail}`);
        if (result.status !== 'ok' && result.action) {
            printLine(`      fix: ${result.action}`);
        }
    }
    const failedChecks = results.filter((result) => result.status === 'fail' && result.required).map((result) => result.name).join(', ');
    const warningCount = results.filter((result) => result.status === 'warn').length;
    printLine();
    if (failedChecks.length === 0) {
        const suffix = warningCount > 0 ? ` (${warningCount} warning${warningCount === 1 ? '' : 's'})` : '';
        printLine(options.dryRun ? `Dry-run checks passed. Bootstrap prerequisites are valid.${suffix}` : `All required checks passed! Ready to develop.${suffix}`);
    }
    else {
        printLine(options.dryRun
            ? `Dry-run checks failed: ${failedChecks}. Fix bootstrap prerequisites before installing.`
            : `Some checks failed: ${failedChecks}. Run "docker compose up -d" for ChromaDB, Grafana, and Tempo, then retry.`);
    }
}
async function main() {
    const options = parseOptions(process.argv.slice(2));
    const envFileExists = existsSync(options.envFile);
    const envFile = parseEnvFile(options.envFile);
    checkNodeVersion();
    checkNpmPackageManager();
    checkDependencyInstallState(options.dryRun);
    checkGitHubAuth(false);
    checkGitStatus();
    // Environment file
    check('environment-file', 'Environment file exists', envFileExists, envFileExists ? options.envFile : `Missing — copy .env.example to ${options.envFile}`, `Copy .env.example to ${options.envFile} and customize local-only secrets.`);
    if (!options.requireServices) {
        checkRequiredBootstrapEnv(options.envFile, envFile);
    }
    // Config example
    check('config-example', 'Config example', existsSync('frankenbeast.config.example.json'), 'frankenbeast.config.example.json', 'Restore frankenbeast.config.example.json from the repository or rebase onto origin/main.');
    await checkCommonLocalPorts(options.requireServices);
    if (options.dryRun) {
        check('live-service-probes', 'Live service probes', true, 'Skipping live service probes in dry-run mode');
    }
    else {
        // ChromaDB
        const chromaUrl = process.env['CHROMA_URL'] ?? envFile.get('CHROMA_URL') ?? 'http://localhost:8000';
        const grafanaUrl = process.env['GRAFANA_URL'] ?? envFile.get('GRAFANA_URL') ?? 'http://localhost:3000';
        const tempoUrl = process.env['TEMPO_URL'] ?? envFile.get('TEMPO_URL') ?? 'http://localhost:3200';
        await checkHttp('ChromaDB', `${chromaUrl}/api/v2/heartbeat`, options.requireServices);
        // Grafana
        await checkHttp('Grafana', `${grafanaUrl}/api/health`, options.requireServices);
        // Tempo
        await checkHttp('Tempo', `${tempoUrl}/ready`, options.requireServices);
    }
    const failedRequired = results.filter((result) => result.status === 'fail' && result.required);
    const report = {
        ok: failedRequired.length === 0,
        dryRun: options.dryRun,
        envFile: options.envFile,
        summary: {
            ok: results.filter((result) => result.status === 'ok').length,
            warn: results.filter((result) => result.status === 'warn').length,
            fail: failedRequired.length,
        },
        checks: results,
    };
    if (options.json) {
        printLine(JSON.stringify(report, null, 2));
    }
    else {
        printHumanSummary(options);
    }
    if (!report.ok) {
        process.exit(1);
    }
}
main().catch((err) => {
    console.error('Verify failed:', err);
    process.exit(1);
});
