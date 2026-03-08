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
}
/**
 * Resolves the project root from --base-dir or cwd.
 * Validates the directory exists.
 */
export declare function resolveProjectRoot(baseDir: string): string;
/**
 * Returns all conventional paths within .frankenbeast/.
 */
export declare function getProjectPaths(root: string): ProjectPaths;
/**
 * Creates .frankenbeast/ directory structure if it doesn't exist.
 */
export declare function scaffoldFrankenbeast(paths: ProjectPaths): void;
//# sourceMappingURL=project-root.d.ts.map