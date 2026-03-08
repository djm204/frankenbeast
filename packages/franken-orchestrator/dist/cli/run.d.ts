#!/usr/bin/env node
import type { CliArgs } from './args.js';
import type { OrchestratorConfig } from '../config/orchestrator-config.js';
import type { SessionPhase } from './session.js';
import type { InterviewIO } from '../planning/interview-loop.js';
/**
 * Creates an InterviewIO backed by stdin/stdout.
 */
export declare function createStdinIO(): InterviewIO;
/**
 * Determines entry phase and exit behavior from CLI args.
 * Subcommand takes precedence, then flags, then default.
 */
export declare function resolvePhases(args: Pick<CliArgs, 'subcommand' | 'designDoc' | 'planDir'>): {
    entryPhase: SessionPhase;
    exitAfter?: SessionPhase;
};
/**
 * Validates config path and loads config from all sources.
 * Exported for testability.
 */
export declare function resolveConfig(args: CliArgs): Promise<OrchestratorConfig>;
//# sourceMappingURL=run.d.ts.map