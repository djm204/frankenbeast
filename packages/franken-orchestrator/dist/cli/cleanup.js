import { existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
/**
 * Removes all files from the .build/ directory (logs, checkpoints, traces db).
 * Returns the number of files removed.
 */
export function cleanupBuild(buildDir) {
    if (!existsSync(buildDir))
        return 0;
    const files = readdirSync(buildDir);
    let removed = 0;
    for (const file of files) {
        try {
            unlinkSync(join(buildDir, file));
            removed++;
        }
        catch {
            // skip files that can't be removed
        }
    }
    return removed;
}
//# sourceMappingURL=cleanup.js.map