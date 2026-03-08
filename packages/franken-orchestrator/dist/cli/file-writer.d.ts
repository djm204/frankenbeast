import type { ProjectPaths } from './project-root.js';
export interface ChunkDefinition {
    id: string;
    objective: string;
    files: string[];
    successCriteria: string;
    verificationCommand: string;
    dependencies: string[];
}
/**
 * Writes the design document to .frankenbeast/plans/design.md.
 * Overwrites if it already exists (revision case).
 * Returns the absolute path written.
 */
export declare function writeDesignDoc(paths: ProjectPaths, content: string): string;
/**
 * Reads the design document from .frankenbeast/plans/design.md.
 * Returns undefined if not found.
 */
export declare function readDesignDoc(paths: ProjectPaths): string | undefined;
/**
 * Removes all numbered chunk .md files from the plans directory.
 * Matches files starting with two digits (e.g., 01_auth.md, 02_db.md).
 */
export declare function clearChunkFiles(paths: ProjectPaths): void;
/**
 * Writes chunk definitions as numbered .md files.
 * Clears existing chunks first to handle regeneration.
 * Returns absolute paths of written files.
 */
export declare function writeChunkFiles(paths: ProjectPaths, chunks: ChunkDefinition[]): string[];
//# sourceMappingURL=file-writer.d.ts.map