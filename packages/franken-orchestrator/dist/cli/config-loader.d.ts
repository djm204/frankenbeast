import { type OrchestratorConfig } from '../config/orchestrator-config.js';
import type { CliArgs } from './args.js';
/**
 * Loads and merges config from all sources.
 * Priority: CLI > env > file > defaults
 */
export declare function loadConfig(args: CliArgs): Promise<OrchestratorConfig>;
//# sourceMappingURL=config-loader.d.ts.map