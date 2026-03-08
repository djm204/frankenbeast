export interface ProjectPaths {
    root: string;
    frankenbeastDir: string;
    plansDir: string;
    buildDir: string;
    checkpointFile: string;
    tracesDb: string;
    logFile: string;
    designDocFile: string;
    configFile: string;
    /** Raw LLM decomposition response cache */
    llmResponseFile: string;
}
/**
 * Resolves the project root from --base-dir or cwd.
 * Validates the directory exists.
 */
export declare function resolveProjectRoot(baseDir: string): string;
/**
 * Generates a plan name from the design doc filename and current date.
 * e.g. "docs/plans/2026-03-08-monorepo-migration-design.md" → "monorepo-migration-design"
 * Falls back to "plan-YYYY-MM-DD" if no design doc provided.
 */
export declare function generatePlanName(designDocPath?: string): string;
/**
 * Returns all conventional paths within .frankenbeast/.
 * When planName is provided, plans are scoped to .frankenbeast/plans/<planName>/.
 */
export declare function getProjectPaths(root: string, planName?: string): ProjectPaths;
/**
 * Creates .frankenbeast/ directory structure if it doesn't exist.
 */
export declare function scaffoldFrankenbeast(paths: ProjectPaths): void;
//# sourceMappingURL=project-root.d.ts.map