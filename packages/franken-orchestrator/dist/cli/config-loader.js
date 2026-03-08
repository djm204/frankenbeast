import { readFile } from 'node:fs/promises';
import { OrchestratorConfigSchema } from '../config/orchestrator-config.js';
/** Environment variable prefix for orchestrator config. */
const ENV_PREFIX = 'FRANKEN_';
/** Extract config values from environment variables. */
function fromEnv() {
    const env = {};
    const maxTokens = process.env[`${ENV_PREFIX}MAX_TOTAL_TOKENS`];
    if (maxTokens)
        env.maxTotalTokens = Number(maxTokens);
    const maxDuration = process.env[`${ENV_PREFIX}MAX_DURATION_MS`];
    if (maxDuration)
        env.maxDurationMs = Number(maxDuration);
    const maxCritique = process.env[`${ENV_PREFIX}MAX_CRITIQUE_ITERATIONS`];
    if (maxCritique)
        env.maxCritiqueIterations = Number(maxCritique);
    const heartbeat = process.env[`${ENV_PREFIX}ENABLE_HEARTBEAT`];
    if (heartbeat !== undefined)
        env.enableHeartbeat = heartbeat === 'true';
    const tracing = process.env[`${ENV_PREFIX}ENABLE_TRACING`];
    if (tracing !== undefined)
        env.enableTracing = tracing === 'true';
    const minScore = process.env[`${ENV_PREFIX}MIN_CRITIQUE_SCORE`];
    if (minScore)
        env.minCritiqueScore = Number(minScore);
    return env;
}
/** Load config from a JSON file. */
async function fromFile(filePath) {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw);
}
/** Extract config overrides from CLI args. */
function fromCli(args) {
    const cli = {};
    if (args.verbose) {
        cli.enableTracing = true;
    }
    return cli;
}
/**
 * Loads and merges config from all sources.
 * Priority: CLI > env > file > defaults
 */
export async function loadConfig(args) {
    let fileConfig = {};
    if (args.config) {
        fileConfig = await fromFile(args.config);
    }
    const envConfig = fromEnv();
    const cliConfig = fromCli(args);
    const merged = {
        ...fileConfig,
        ...envConfig,
        ...cliConfig,
    };
    return OrchestratorConfigSchema.parse(merged);
}
//# sourceMappingURL=config-loader.js.map