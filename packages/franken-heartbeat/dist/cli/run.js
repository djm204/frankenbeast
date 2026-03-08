#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from './args.js';
import { HeartbeatConfigSchema } from '../core/config.js';
import { PulseOrchestrator } from '../orchestrator/pulse-orchestrator.js';
import { exec } from 'node:child_process';
// Stub implementations for standalone mode
// In production, these would be wired to real module implementations
export const stubMemory = {
    getRecentTraces: async () => [],
    getSuccesses: async () => [],
    getFailures: async () => [],
    recordLesson: async () => { },
};
export const stubObservability = {
    getTraces: async () => [],
    getTokenSpend: async () => ({ totalTokens: 0, totalCostUsd: 0, breakdown: [] }),
};
export const stubPlanner = {
    injectTask: async () => { },
};
export const stubCritique = {
    auditConclusions: async () => ({ passed: true, reason: 'stub', flaggedItems: [] }),
};
export const stubHitl = {
    sendMorningBrief: async () => { },
    notifyAlert: async () => { },
};
export const stubLlm = {
    complete: async () => ({
        ok: true,
        value: JSON.stringify({ patterns: [], improvements: [], techDebt: [] }),
    }),
};
export async function getGitStatus() {
    return new Promise((resolve) => {
        exec('git status --porcelain', (err, stdout) => {
            if (err) {
                resolve({ dirty: false, files: [] });
                return;
            }
            const files = stdout.trim().split('\n').filter(Boolean);
            resolve({ dirty: files.length > 0, files });
        });
    });
}
export function buildOrchestratorDeps(cliArgs) {
    const configOverrides = {};
    if (cliArgs.heartbeatFilePath) {
        configOverrides['heartbeatFilePath'] = cliArgs.heartbeatFilePath;
    }
    const config = HeartbeatConfigSchema.parse(configOverrides);
    return {
        memory: stubMemory,
        observability: stubObservability,
        planner: cliArgs.dryRun ? { injectTask: async () => { } } : stubPlanner,
        critique: stubCritique,
        hitl: cliArgs.dryRun ? { sendMorningBrief: async () => { }, notifyAlert: async () => { } } : stubHitl,
        llm: stubLlm,
        gitStatusExecutor: getGitStatus,
        clock: () => new Date(),
        config,
        readFile: async (path) => {
            try {
                return await readFile(path, 'utf-8');
            }
            catch {
                return '';
            }
        },
        writeFile: cliArgs.dryRun
            ? async () => { }
            : async (path, content) => { await writeFile(path, content, 'utf-8'); },
        projectId: cliArgs.projectId,
    };
}
export async function main(argv) {
    const cliArgs = parseArgs(argv);
    const deps = buildOrchestratorDeps(cliArgs);
    const orchestrator = new PulseOrchestrator(deps);
    const report = await orchestrator.run();
    return JSON.stringify(report, null, 2);
}
// Only run when executed directly (not imported for testing)
const isDirectRun = process.argv[1]?.endsWith('run.js') ?? false;
if (isDirectRun) {
    // Graceful shutdown
    const shutdown = (signal) => {
        process.stderr.write(`Received ${signal}, shutting down...\n`);
        process.exit(0);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    main(process.argv.slice(2))
        .then((output) => {
        process.stdout.write(output + '\n');
    })
        .catch((err) => {
        process.stderr.write(`Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
    });
}
//# sourceMappingURL=run.js.map