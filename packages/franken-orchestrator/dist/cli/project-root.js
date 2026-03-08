import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
/**
 * Resolves the project root from --base-dir or cwd.
 * Validates the directory exists.
 */
export function resolveProjectRoot(baseDir) {
    const root = resolve(baseDir);
    if (!existsSync(root)) {
        throw new Error(`Project root does not exist: ${root}`);
    }
    return root;
}
/**
 * Returns all conventional paths within .frankenbeast/.
 */
export function getProjectPaths(root) {
    const frankenbeastDir = resolve(root, '.frankenbeast');
    const plansDir = resolve(frankenbeastDir, 'plans');
    const buildDir = resolve(frankenbeastDir, '.build');
    return {
        root,
        frankenbeastDir,
        plansDir,
        buildDir,
        checkpointFile: resolve(buildDir, '.checkpoint'),
        tracesDb: resolve(buildDir, 'build-traces.db'),
        logFile: resolve(buildDir, 'build.log'),
        designDocFile: resolve(plansDir, 'design.md'),
        configFile: resolve(frankenbeastDir, 'config.json'),
    };
}
/**
 * Creates .frankenbeast/ directory structure if it doesn't exist.
 */
export function scaffoldFrankenbeast(paths) {
    mkdirSync(paths.plansDir, { recursive: true });
    mkdirSync(paths.buildDir, { recursive: true });
}
//# sourceMappingURL=project-root.js.map